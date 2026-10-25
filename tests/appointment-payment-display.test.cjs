const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const paymentDisplay = import("../lib/appointment-payment-display.mjs");

test("appointment payment labels distinguish patient-visible payment states", async () => {
  const { getAppointmentPaymentLabel } = await paymentDisplay;
  const cases = [
    [{ method: "ONLINE", status: "PENDING" }, "Payment pending"],
    [{ method: "ONLINE", status: "FAILED" }, "Payment failed"],
    [{ method: "ONLINE", status: "EXPIRED" }, "Checkout expired"],
    [{ method: "ONLINE", status: "PAID", refundStatus: "NOT_REQUIRED" }, "Paid"],
    [{ method: "ONLINE", status: "PAID", refundStatus: "NOT_REQUIRED" }, "Payment received — confirmation pending", "PAYMENT_PENDING"],
    [{ method: "CASH", status: "CASH_DUE" }, "Cash due"],
    [{ method: "CASH", status: "PAID", cashCollection: { collectedAt: new Date() } }, "Cash collected"],
    [{ method: "CASH", status: "PAID" }, "Cash collection status requires verification"],
    [{ method: "ONLINE", status: "PAID", refundStatus: "REVIEW_REQUIRED" }, "Payment received — admin review required"],
  ];
  for (const [payment, label, appointmentStatus] of cases) assert.equal(getAppointmentPaymentLabel(payment, { appointmentStatus }), label);
  assert.equal(getAppointmentPaymentLabel(
    { method: "ONLINE", status: "PENDING" },
    { appointmentStatus: "PAYMENT_PENDING", checkoutExpiresAt: new Date(Date.now() - 1000) },
  ), "Checkout expired — choose another slot");
});

test("captured payments requiring reconciliation leave checkout instead of offering another payment attempt", async () => {
  const source = await readFile("app/(main)/doctors/[specialty]/[id]/_components/appointment-form.jsx", "utf8");
  assert.match(source, /\["REFUND_REVIEW_REQUIRED", "PAYMENT_RECONCILIATION_PENDING"\]\.includes\(result\?\.code\)/);
  assert.match(source, /setActiveCheckout\(null\);\s*onComplete\(\);/);
});
