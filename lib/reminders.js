import { db } from "@/lib/prisma";
import { createAppointmentNotificationPair } from "@/lib/notifications";

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
  for (const appointment of appointments) {
    const minutesUntilStart = (appointment.startTime.getTime() - now.getTime()) / 60000;
    if (!appointment.patient || !appointment.doctor) continue;
    const type = minutesUntilStart <= 30 ? "THIRTY_MINUTES" : "TWENTY_FOUR_HOURS";
    const threshold = type === "THIRTY_MINUTES" ? 30 : 24 * 60;
    if (minutesUntilStart > threshold || minutesUntilStart <= 0) continue;
    try {
      await db.$transaction(async (tx) => {
        const claimed = await tx.appointmentReminder.createMany({ data: [{ appointmentId: appointment.id, type }], skipDuplicates: true });
        if (claimed.count === 0) return;
        await createAppointmentNotificationPair(tx, appointment, { type: "APPOINTMENT_REMINDER", title: "Appointment reminder", patientMessage: `Your appointment starts in ${type === "THIRTY_MINUTES" ? "30 minutes" : "24 hours"}.`, doctorMessage: `An appointment starts in ${type === "THIRTY_MINUTES" ? "30 minutes" : "24 hours"}.`, key: `appointment:${appointment.id}:reminder:${type}` });
        processed += 1;
      });
    } catch (error) {
      console.error("Failed to process reminder", appointment.id, error instanceof Error ? error.message : "Unknown error");
    }
  }
  return { processed };
}
