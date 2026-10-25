import { canTransitionAppointment } from "./appointment-lifecycle.mjs";
import { flagPaymentPayoutsForReview } from "./payment-payouts.mjs";

export const CANCELLATION_ERRORS = Object.freeze({
  NOT_CANCELLABLE: "This appointment cannot be cancelled",
});

/** Apply appointment cancellation and any payment review changes in one transaction. */
export async function cancelAppointmentInTransaction(tx, { appointmentId, actorId, notify }) {
  const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) throw new Error("Appointment not found");
  if (appointment.patientId !== actorId && appointment.doctorId !== actorId) {
    throw new Error("You are not authorized to cancel this appointment");
  }
  if (!canTransitionAppointment(appointment.status, "CANCELLED")) {
    throw new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE);
  }

  const payment = await tx.appointmentPayment.findUnique({ where: { appointmentId } });

  const cancelled = await tx.appointment.updateMany({
    where: { id: appointmentId, status: appointment.status },
    data: { status: "CANCELLED", checkoutExpiresAt: null },
  });
  if (cancelled.count !== 1) throw new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE);

  if (payment) {
    if (payment.status === "PAID" && payment.refundStatus === "NOT_REQUIRED") {
      const flagged = await tx.appointmentPayment.updateMany({
        where: { id: payment.id, status: "PAID", refundStatus: "NOT_REQUIRED" },
        data: { refundStatus: "REVIEW_REQUIRED" },
      });
      if (flagged.count !== 1) throw new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE);
    } else if (payment.status === "PENDING") {
      const expired = await tx.appointmentPayment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "EXPIRED", orderStatus: "EXPIRED" },
      });
      if (expired.count !== 1) throw new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE);
    } else if (payment.status === "CASH_DUE" && payment.method === "CASH") {
      const cancelledCashDue = await tx.appointmentPayment.updateMany({
        where: { id: payment.id, method: "CASH", status: "CASH_DUE" },
        data: { status: "CANCELLED" },
      });
      if (cancelledCashDue.count !== 1) throw new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE);
    }
    if (payment.status === "PAID") {
      await flagPaymentPayoutsForReview(tx, payment.id, "Appointment cancelled after payment collection");
    }
    await notify(tx, appointment);
    return appointment;
  }

  await notify(tx, appointment);

  return appointment;
}
