const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

test("consultation prices are positive whole rupees and convert to paise once", async () => {
  const { parseConsultationPriceRupees, rupeesToPaise } = await import("../lib/razorpay.mjs");
  assert.equal(parseConsultationPriceRupees("500"), 500);
  assert.equal(rupeesToPaise(500), 50000);
  assert.equal(parseConsultationPriceRupees("100000"), 100000);
  for (const value of ["0", "-1", "1.5", "100001", "Infinity", " 500"]) {
    assert.equal(parseConsultationPriceRupees(value), null, `expected rejection for ${value}`);
  }
  assert.throws(() => rupeesToPaise(0), RangeError);
});

test("Razorpay payment signature validation rejects tampered data", async () => {
  const { verifyRazorpayPaymentSignature } = await import("../lib/razorpay.mjs");
  const orderId = "order_test_123";
  const paymentId = "pay_test_456";
  const secret = "test-secret";
  const signature = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  assert.equal(verifyRazorpayPaymentSignature(orderId, paymentId, signature, secret), true);
  assert.equal(verifyRazorpayPaymentSignature(orderId, paymentId, signature, "wrong-secret"), false);
  assert.equal(verifyRazorpayPaymentSignature("order-other", paymentId, signature, secret), false);
  assert.equal(verifyRazorpayPaymentSignature(orderId, paymentId, "bad", secret), false);
});
