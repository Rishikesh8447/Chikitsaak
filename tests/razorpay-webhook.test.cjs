const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

const handlerModule = import("../lib/razorpay-webhook.mjs");
const signatureModule = import("../lib/razorpay.mjs");

function mockDatabase({ expired = false } = {}) {
  const startTime = new Date(2099, 5, 1, 8, 0, 0);
  const appointment = {
    id: "appointment-1",
    patientId: "patient-1",
    doctorId: "doctor-1",
    startTime,
    endTime: new Date(startTime.getTime() + 20 * 60 * 1000),
    status: expired ? "CANCELLED" : "PAYMENT_PENDING",
    checkoutExpiresAt: expired ? null : new Date(Date.now() + 15 * 60 * 1000),
  };
  const state = {
    appointment,
    payment: {
      id: "payment-1",
      appointmentId: appointment.id,
      amountRupees: 500,
      amountPaise: 50000,
      currency: "INR",
      status: expired ? "EXPIRED" : "PENDING",
      orderStatus: expired ? "EXPIRED" : "CREATED",
      refundStatus: "NOT_REQUIRED",
      razorpayOrderId: "order_test_1",
      razorpayPaymentId: null,
      appointment,
    },
    events: [],
    notifications: [],
  };

  function clone(value) { return structuredClone(value); }
  const tx = {
    razorpayWebhookEvent: {
      findUnique: async ({ where }) => clone(state.events.find((event) => event.id === where.id) || null),
      create: async ({ data }) => {
        if (state.events.some((event) => event.id === data.id)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
        state.events.push(clone(data));
        return clone(data);
      },
      update: async ({ where, data }) => {
        const event = state.events.find((item) => item.id === where.id);
        Object.assign(event, clone(data));
        return clone(event);
      },
    },
    appointmentPayment: {
      findUnique: async ({ where }) => (where.razorpayOrderId === state.payment.razorpayOrderId || where.razorpayPaymentId === state.payment.razorpayPaymentId) ? clone({ ...state.payment, appointment: state.appointment }) : null,
      update: async ({ where, data }) => {
        assert.equal(where.id, state.payment.id);
        Object.assign(state.payment, clone(data));
        return clone(state.payment);
      },
      updateMany: async ({ where, data }) => {
        if (where.id !== state.payment.id) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(state.payment.status)) return { count: 0 };
        if (typeof where.status === "string" && where.status !== state.payment.status) return { count: 0 };
        if (where.refundStatus?.in && !where.refundStatus.in.includes(state.payment.refundStatus)) return { count: 0 };
        if (where.refundStatus?.not && where.refundStatus.not === state.payment.refundStatus) return { count: 0 };
        Object.assign(state.payment, clone(data));
        return { count: 1 };
      },
    },
    appointment: {
      updateMany: async ({ where, data }) => {
        if (where.id !== state.appointment.id || where.status !== state.appointment.status) return { count: 0 };
        if (where.checkoutExpiresAt?.gt && !(state.appointment.checkoutExpiresAt > where.checkoutExpiresAt.gt)) return { count: 0 };
        Object.assign(state.appointment, clone(data));
        return { count: 1 };
      },
      findFirst: async () => null,
    },
    availability: {
      findMany: async () => [{ dayOfWeek: null, blockedDate: null, startTime: new Date(state.appointment.startTime.getTime() - 60 * 60 * 1000), endTime: new Date(state.appointment.endTime.getTime() + 60 * 60 * 1000) }],
    },
    payoutPaymentAllocation: { findMany: async () => [] },
    notification: {
      createMany: async ({ data }) => { state.notifications.push(...clone(data)); return { count: data.length }; },
    },
  };
  const db = {
    razorpayWebhookEvent: tx.razorpayWebhookEvent,
    $transaction: async (work) => work(tx),
  };
  return { db, state };
}

function paymentCapturedEvent() {
  return {
    event: "payment.captured",
    payload: { payment: { entity: {
      id: "pay_test_1",
      order_id: "order_test_1",
      amount: 50000,
      currency: "INR",
      status: "captured",
      captured: true,
    } } },
  };
}

async function signedRequest(payload, { eventId = "evt_test_1", signatureOverride } = {}) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = createHmac("sha256", "webhook-test-secret").update(rawBody).digest("hex");
  return new Request("http://localhost/api/webhooks/razorpay", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-event-id": eventId,
      "x-razorpay-signature": signatureOverride || signature,
    },
    body: rawBody,
  });
}

async function createHandler(db) {
  const { createRazorpayWebhookHandler } = await handlerModule;
  return createRazorpayWebhookHandler({ db, webhookSecret: "webhook-test-secret", mode: "test" });
}

test("webhook HMAC uses the raw body and rejects invalid signatures", async () => {
  const { verifyRazorpayWebhookSignature } = await signatureModule;
  const rawBody = Buffer.from('{"event":"payment.captured"}');
  const good = createHmac("sha256", "webhook-test-secret").update(rawBody).digest("hex");
  assert.equal(verifyRazorpayWebhookSignature(rawBody, good, "webhook-test-secret"), true);
  assert.equal(verifyRazorpayWebhookSignature(rawBody, "0".repeat(64), "webhook-test-secret"), false);

  const { db, state } = mockDatabase();
  const handler = await createHandler(db);
  const response = await handler(await signedRequest(paymentCapturedEvent(), { signatureOverride: "0".repeat(64) }));
  assert.equal(response.status, 400);
  assert.equal(state.events.length, 0);
  assert.equal(state.payment.status, "PENDING");
});

test("a captured webhook recovers checkout without a browser callback and deduplicates delivery", async () => {
  const { db, state } = mockDatabase();
  const handler = await createHandler(db);
  assert.equal((await handler(await signedRequest(paymentCapturedEvent()))).status, 200);
  assert.equal((await handler(await signedRequest(paymentCapturedEvent()))).status, 200);
  assert.equal(state.payment.status, "PAID");
  assert.equal(state.appointment.status, "SCHEDULED");
  assert.equal(state.events.length, 1);
  assert.equal(state.notifications.length, 2);
});

test("late capture is recorded for review without confirming an expired appointment", async () => {
  const { db, state } = mockDatabase({ expired: true });
  const handler = await createHandler(db);
  const response = await handler(await signedRequest(paymentCapturedEvent()));
  assert.equal(response.status, 200);
  assert.equal(state.payment.status, "PAID");
  assert.equal(state.payment.refundStatus, "REVIEW_REQUIRED");
  assert.equal(state.appointment.status, "CANCELLED");
  assert.equal(state.events[0].status, "REVIEW_REQUIRED");
  assert.equal(state.notifications.length, 0);
});

test("a captured payment already marked PAID cannot leave a pending checkout hold active", async () => {
  const { db, state } = mockDatabase();
  state.payment.status = "PAID";
  state.payment.orderStatus = "PAID";
  state.payment.razorpayPaymentId = "pay_test_1";
  const handler = await createHandler(db);

  assert.equal((await handler(await signedRequest(paymentCapturedEvent()))).status, 200);
  assert.equal(state.payment.status, "PAID");
  assert.equal(state.payment.refundStatus, "REVIEW_REQUIRED");
  assert.equal(state.appointment.status, "CANCELLED");
  assert.equal(state.appointment.checkoutExpiresAt, null);
  assert.equal(state.events[0].status, "REVIEW_REQUIRED");
  assert.equal(state.notifications.length, 0);
});

test("a captured webhook with a mismatched amount is recorded for review and never confirms", async () => {
  const { db, state } = mockDatabase();
  const handler = await createHandler(db);
  const payment = paymentCapturedEvent();
  payment.payload.payment.entity.amount = 100;
  const response = await handler(await signedRequest(payment));
  assert.equal(response.status, 200);
  assert.equal(state.payment.status, "PAID");
  assert.equal(state.payment.refundStatus, "REVIEW_REQUIRED");
  assert.equal(state.appointment.status, "CANCELLED");
  assert.equal(state.events[0].amountPaise, 100);
  assert.equal(state.events[0].status, "REVIEW_REQUIRED");
});

test("a captured webhook with a mismatched currency is reviewed and cannot confirm", async () => {
  const { db, state } = mockDatabase();
  const handler = await createHandler(db);
  const payment = paymentCapturedEvent();
  payment.payload.payment.entity.currency = "USD";
  const response = await handler(await signedRequest(payment));
  assert.equal(response.status, 200);
  assert.equal(state.payment.refundStatus, "REVIEW_REQUIRED");
  assert.equal(state.appointment.status, "CANCELLED");
  assert.equal(state.events[0].currency, "USD");
});

test("offline UPI payment events must identify UPI before appointment confirmation", async () => {
  const { db, state } = mockDatabase();
  state.payment.method = "UPI_QR";
  const handler = await createHandler(db);
  const event = paymentCapturedEvent();
  event.payload.payment.entity.method = "card";
  assert.equal((await handler(await signedRequest(event))).status, 200);
  assert.equal(state.payment.status, "PAID");
  assert.equal(state.payment.refundStatus, "REVIEW_REQUIRED");
  assert.equal(state.appointment.status, "CANCELLED");
  assert.equal(state.notifications.length, 0);
});

test("a later duplicate capture cannot overwrite an admin-approved review", async () => {
  const { db, state } = mockDatabase({ expired: true });
  state.payment.status = "PAID";
  state.payment.orderStatus = "PAID";
  state.payment.refundStatus = "APPROVED";
  state.payment.razorpayPaymentId = "pay_test_1";
  const handler = await createHandler(db);
  assert.equal((await handler(await signedRequest(paymentCapturedEvent(), { eventId: "evt_capture_after_approval" }))).status, 200);
  assert.equal(state.payment.refundStatus, "APPROVED");
  assert.equal(state.appointment.status, "CANCELLED");
  assert.equal(state.notifications.length, 0);
});

test("a mismatched later capture cannot reopen an admin-rejected refund review", async () => {
  const { db, state } = mockDatabase({ expired: true });
  state.payment.status = "PAID";
  state.payment.orderStatus = "PAID";
  state.payment.refundStatus = "REJECTED";
  state.payment.razorpayPaymentId = "pay_test_1";
  const handler = await createHandler(db);
  const payload = paymentCapturedEvent();
  payload.payload.payment.entity.amount = 123;
  assert.equal((await handler(await signedRequest(payload, { eventId: "evt_mismatched_after_rejection" }))).status, 200);
  assert.equal(state.payment.refundStatus, "REJECTED");
  assert.equal(state.appointment.status, "CANCELLED");
});

test("a captured event for an unknown order cannot confirm another appointment", async () => {
  const { db, state } = mockDatabase();
  const handler = await createHandler(db);
  const payment = paymentCapturedEvent();
  payment.payload.payment.entity.order_id = "order_unknown";
  assert.equal((await handler(await signedRequest(payment))).status, 200);
  assert.equal(state.appointment.status, "PAYMENT_PENDING");
  assert.equal(state.payment.status, "PENDING");
  assert.equal(state.events[0].status, "IGNORED");
  assert.equal(state.events[0].appointmentPaymentId, null);
});

test("out-of-order refund notifications are acknowledged and deduplicated without mutation", async () => {
  const { db, state } = mockDatabase();
  const handler = await createHandler(db);
  const payload = { event: "refund.processed", payload: {} };
  assert.equal((await handler(await signedRequest(payload, { eventId: "evt_refund_1" }))).status, 200);
  assert.equal((await handler(await signedRequest(payload, { eventId: "evt_refund_1" }))).status, 200);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].status, "IGNORED");
  assert.equal(state.payment.status, "PENDING");
});

test("a verified full refund event updates payment status for review without changing appointment or payout transfer", async () => {
  const { db, state } = mockDatabase();
  state.payment.status = "PAID";
  state.payment.razorpayPaymentId = "pay_test_1";
  state.payment.verifiedAt = new Date();
  const handler = await createHandler(db);
  const payload = { event: "refund.processed", payload: { refund: { entity: { id: "rfnd_test_1", payment_id: "pay_test_1", amount: 50000, status: "processed" } } } };
  const response = await handler(await signedRequest(payload, { eventId: "evt_refund_processed_1" }));
  assert.equal(response.status, 200);
  assert.equal(state.payment.refundStatus, "REFUNDED");
  assert.equal(state.payment.status, "PAID");
  assert.equal(state.appointment.status, "PAYMENT_PENDING");
  assert.equal(state.events[0].status, "REVIEW_REQUIRED");
});

test("an authorization event arriving before capture is ignored and later capture still books", async () => {
  const { db, state } = mockDatabase();
  const handler = await createHandler(db);
  const authorized = paymentCapturedEvent();
  authorized.event = "payment.authorized";
  authorized.payload.payment.entity.status = "authorized";
  authorized.payload.payment.entity.captured = false;
  assert.equal((await handler(await signedRequest(authorized, { eventId: "evt_authorized_1" }))).status, 200);
  assert.equal(state.appointment.status, "PAYMENT_PENDING");

  assert.equal((await handler(await signedRequest(paymentCapturedEvent(), { eventId: "evt_captured_1" }))).status, 200);
  assert.equal(state.appointment.status, "SCHEDULED");
  assert.equal(state.payment.status, "PAID");
  assert.equal(state.events.length, 2);
  assert.equal(state.events[0].status, "IGNORED");
  assert.equal(state.events[1].status, "PROCESSED");
  assert.equal(state.notifications.length, 2);
});
