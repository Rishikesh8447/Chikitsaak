import { db } from "@/lib/prisma";
import { createAppointmentNotificationPair } from "@/lib/notifications";
import { appointmentReminderKey } from "@/lib/reminder-key.mjs";
import { sendAppointmentReminderEmail } from "@/lib/email";

const ACTIVE_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];

/**
 * Process reminders that are due at the time this function is called.
 * A cron, queue worker, or other trusted server scheduler must call this
 * function periodically; browser timers are intentionally not used.
 */
export async function processDueAppointmentReminders(now = new Date()) {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const appointments = await db.appointment.findMany({ where: { status: { in: ACTIVE_STATUSES }, startTime: { gt: now, lte: horizon } }, include: { patient: { select: { id: true } }, doctor: { select: { id: true } } } });
  let processed = 0;
  for (const candidate of appointments) {
    try {
      const emailPayload = await db.$transaction(async (tx) => {
        // The initial query is only a candidate scan. Re-read inside the
        // transaction so a cancellation or reschedule cannot use stale data.
        const appointment = await tx.appointment.findUnique({
          where: { id: candidate.id },
          include: {
            patient: { select: { id: true, name: true, email: true } },
            doctor: { select: { id: true, name: true, email: true } },
          },
        });
        if (!appointment || !ACTIVE_STATUSES.includes(appointment.status) || !appointment.patient || !appointment.doctor) return null;

        const minutesUntilStart = (appointment.startTime.getTime() - now.getTime()) / 60000;
        if (minutesUntilStart <= 0 || minutesUntilStart > 24 * 60) return null;

        let type = null;
        if (minutesUntilStart <= 30) {
          type = "THIRTY_MINUTES";
        } else if (minutesUntilStart >= 23 * 60 && minutesUntilStart <= 24 * 60) {
          type = "TWENTY_FOUR_HOURS";
        }

        if (!type) return null;

        const claimed = await tx.appointmentReminder.createMany({ data: [{ appointmentId: appointment.id, type }], skipDuplicates: true });
        if (claimed.count === 0) return null;

        await createAppointmentNotificationPair(tx, appointment, { type: "APPOINTMENT_REMINDER", title: "Appointment reminder", patientMessage: `Your appointment starts in ${type === "THIRTY_MINUTES" ? "30 minutes" : "24 hours"}.`, doctorMessage: `An appointment starts in ${type === "THIRTY_MINUTES" ? "30 minutes" : "24 hours"}.`, key: appointmentReminderKey(appointment.id, type, appointment.startTime) });
        return {
          appointmentId: appointment.id,
          startTime: appointment.startTime,
          consultationMode: appointment.consultationMode,
          reminderType: type,
          patient: appointment.patient,
          doctor: appointment.doctor,
        };
      }, { isolationLevel: "Serializable" });

      if (emailPayload) {
        processed += 1;
        if (emailPayload.patient?.email) {
          sendAppointmentReminderEmail({
            to: emailPayload.patient.email,
            recipientName: emailPayload.patient.name || "Patient",
            otherPartyName: emailPayload.doctor?.name || "Doctor",
            recipientRole: "PATIENT",
            startTime: emailPayload.startTime,
            reminderType: emailPayload.reminderType,
            consultationMode: emailPayload.consultationMode,
          }).catch((err) => console.error("Failed to send reminder email to patient:", err));
        }
        if (emailPayload.doctor?.email) {
          sendAppointmentReminderEmail({
            to: emailPayload.doctor.email,
            recipientName: emailPayload.doctor.name || "Doctor",
            otherPartyName: emailPayload.patient?.name || "Patient",
            recipientRole: "DOCTOR",
            startTime: emailPayload.startTime,
            reminderType: emailPayload.reminderType,
            consultationMode: emailPayload.consultationMode,
          }).catch((err) => console.error("Failed to send reminder email to doctor:", err));
        }
      }
    } catch (error) {
      console.error("Failed to process reminder", candidate.id, error instanceof Error ? error.message : "Unknown error");
    }
  }
  return { processed };
}
