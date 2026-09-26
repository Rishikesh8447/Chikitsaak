import { db } from "@/lib/prisma";
import { createAppointmentNotificationPair } from "@/lib/notifications";
import { appointmentReminderKey } from "@/lib/reminder-key.mjs";

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
      const didProcess = await db.$transaction(async (tx) => {
        // The initial query is only a candidate scan. Re-read inside the
        // transaction so a cancellation or reschedule cannot use stale data.
        const appointment = await tx.appointment.findUnique({
          where: { id: candidate.id },
          include: { patient: { select: { id: true } }, doctor: { select: { id: true } } },
        });
        if (!appointment || !ACTIVE_STATUSES.includes(appointment.status) || !appointment.patient || !appointment.doctor) return false;

        const minutesUntilStart = (appointment.startTime.getTime() - now.getTime()) / 60000;
        if (minutesUntilStart <= 0 || minutesUntilStart > 24 * 60) return false;
        const type = minutesUntilStart <= 30 ? "THIRTY_MINUTES" : "TWENTY_FOUR_HOURS";
        const claimed = await tx.appointmentReminder.createMany({ data: [{ appointmentId: appointment.id, type }], skipDuplicates: true });
        if (claimed.count === 0) return false;

        await createAppointmentNotificationPair(tx, appointment, { type: "APPOINTMENT_REMINDER", title: "Appointment reminder", patientMessage: `Your appointment starts in ${type === "THIRTY_MINUTES" ? "30 minutes" : "24 hours"}.`, doctorMessage: `An appointment starts in ${type === "THIRTY_MINUTES" ? "30 minutes" : "24 hours"}.`, key: appointmentReminderKey(appointment.id, type, appointment.startTime) });
        return true;
      }, { isolationLevel: "Serializable" });
      if (didProcess) processed += 1;
    } catch (error) {
      console.error("Failed to process reminder", candidate.id, error instanceof Error ? error.message : "Unknown error");
    }
  }
  return { processed };
}
