import { canTransitionAppointment } from "./appointment-lifecycle.mjs";

export const CANCELLATION_ERRORS = Object.freeze({
  NOT_CANCELLABLE: "This appointment cannot be cancelled",
  PAYOUT_RESERVED: "Cancellation cannot be completed because the doctor's credits are reserved by a pending payout. No cancellation or refund was recorded.",
  INSUFFICIENT_CREDITS: "Cancellation cannot be completed because the doctor has insufficient available credits. No cancellation or refund was recorded.",
});

async function insufficientCreditsError(tx, doctorId) {
  const pendingPayout = await tx.payout.findFirst({
    where: { doctorId, status: "PROCESSING" },
    select: { id: true },
  });
  if (pendingPayout) {
    const reservation = await tx.creditTransaction.findUnique({
      where: { allocationKey: `payout:${pendingPayout.id}:credit-reservation` },
      select: { id: true },
    });
    if (reservation) return CANCELLATION_ERRORS.PAYOUT_RESERVED;
  }
  return CANCELLATION_ERRORS.INSUFFICIENT_CREDITS;
}

/** Apply appointment cancellation and its credit accounting inside one Prisma transaction. */
export async function cancelAppointmentInTransaction(tx, { appointmentId, actorId, notify }) {
  const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new Error("Appointment not found");
  if (appointment.patientId !== actorId && appointment.doctorId !== actorId) {
    throw new Error("You are not authorized to cancel this appointment");
  }
  if (!canTransitionAppointment(appointment.status, "CANCELLED")) {
    throw new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE);
  }

  const cancelled = await tx.appointment.updateMany({
    where: { id: appointmentId, status: appointment.status },
    data: { status: "CANCELLED" },
  });
  if (cancelled.count !== 1) throw new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE);

  const doctor = await tx.user.findUnique({
    where: { id: appointment.doctorId },
    select: { credits: true },
  });
  if (!doctor || doctor.credits < 2) {
    throw new Error(await insufficientCreditsError(tx, appointment.doctorId));
  }

  const doctorDebit = await tx.user.updateMany({
    where: { id: appointment.doctorId, credits: { gte: 2 } },
    data: { credits: { decrement: 2 } },
  });
  if (doctorDebit.count !== 1) {
    throw new Error(await insufficientCreditsError(tx, appointment.doctorId));
  }

  await tx.user.update({
    where: { id: appointment.patientId },
    data: { credits: { increment: 2 } },
  });
  await tx.creditTransaction.create({
    data: {
      userId: appointment.patientId,
      amount: 2,
      type: "APPOINTMENT_REFUND",
      allocationKey: `appointment:${appointment.id}:patient-refund`,
    },
  });
  await tx.creditTransaction.create({
    data: {
      userId: appointment.doctorId,
      amount: -2,
      type: "APPOINTMENT_REFUND",
      allocationKey: `appointment:${appointment.id}:doctor-refund`,
    },
  });
  await notify(tx, appointment);

  return appointment;
}
