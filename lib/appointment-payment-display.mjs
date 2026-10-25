export function getAppointmentPaymentLabel(payment, { appointmentStatus, checkoutExpiresAt } = {}) {
  if (!payment) return null;
  if (payment.refundStatus === "REVIEW_REQUIRED") return "Payment received — admin review required";
  if (payment.status === "PAID" && appointmentStatus === "PAYMENT_PENDING") return "Payment received — confirmation pending";
  if (payment.status === "PENDING" && appointmentStatus === "PAYMENT_PENDING"
    && checkoutExpiresAt && new Date(checkoutExpiresAt) <= new Date()) return "Checkout expired — choose another slot";
  if (payment.status === "CASH_DUE" && payment.method === "CASH") return "Cash due";
  if (payment.status === "PAID" && payment.method === "CASH") {
    return payment.cashCollection?.collectedAt ? "Cash collected" : "Cash collection status requires verification";
  }
  if (payment.status === "PAID") return "Paid";
  if (payment.status === "PENDING") return "Payment pending";
  if (payment.status === "FAILED") return "Payment failed";
  if (payment.status === "EXPIRED") return "Checkout expired";
  if (payment.status === "CANCELLED") return "Payment cancelled";
  return payment.status.replaceAll("_", " ");
}
