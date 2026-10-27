const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { addMinutes } = require("date-fns");
const { rupeesToPaise, verifyRazorpayPaymentSignature } = require("../lib/razorpay.mjs");
const reconciliationPromise = import("../lib/appointment-payment-reconciliation.mjs");

async function loadPaymentActions() {
  const source = await readFile(join(process.cwd(), "actions", "payments.js"), "utf8");
  const transformed = source.replace(/^import .*;\r?\n/gm, "").replaceAll("export async function", "async function");
  const clock = { now: new Date() };
  class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now.getTime(); }
  }
  const state = {
    users: [
      { id: "patient-1", clerkUserId: "clerk-patient", role: "PATIENT" },
      { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED", consultationPriceRupees: 500 },
    ],
    appointments: [],
    payments: [],
    availability: [{ dayOfWeek: null, blockedDate: null, startTime: new Date(2099, 5, 1, 7), endTime: new Date(2099, 5, 1, 10) }],
    notifications: [],
    providerPayments: new Map(),
    providerOrderFailure: false,
    providerOrderStatus: 400,
    configFailure: false,
    orderRequests: [],
    diagnostics: [],
    orderNumber: 0,
    appointmentNumber: 0,
    forcedSerializableFailures: 0,
    transactionQueue: Promise.resolve(),
  };

  function matchesOverlap(appointment, where) {
    if (where.id?.not && appointment.id === where.id.not) return false;
    if (where.doctorId && appointment.doctorId !== where.doctorId) return false;
    if (where.patientId && appointment.patientId !== where.patientId) return false;
    if (where.startTime?.lt && !(appointment.startTime < where.startTime.lt)) return false;
    if (where.endTime?.gt && !(appointment.endTime > where.endTime.gt)) return false;
    if (where.OR?.length) {
      const matchesOr = where.OR.some((clause) => {
        if (clause.doctorId && appointment.doctorId !== clause.doctorId) return false;
        if (clause.patientId && appointment.patientId !== clause.patientId) return false;
        if (clause.status?.in && !clause.status.in.includes(appointment.status)) return false;
        if (typeof clause.status === "string" && appointment.status !== clause.status) return false;
        if (clause.checkoutExpiresAt?.gt && !(appointment.checkoutExpiresAt > clause.checkoutExpiresAt.gt)) return false;
        return true;
      });
      if (!matchesOr) return false;
    }
    return true;
  }

  function paymentResult(payment, include) {
    if (!payment) return null;
    const appointment = state.appointments.find((item) => item.id === payment.appointmentId);
    if (include?.appointment?.include?.patient) {
      return structuredClone({ ...payment, appointment: { ...appointment, patient: { clerkUserId: "clerk-patient" } } });
    }
    return structuredClone({ ...payment, ...(include?.appointment ? { appointment } : {}) });
  }

  const tx = {
    user: {
      findUnique: async ({ where }) => structuredClone(state.users.find((user) =>
        where.clerkUserId ? user.clerkUserId === where.clerkUserId && user.role === where.role
          : user.id === where.id && user.role === where.role && (!where.verificationStatus || user.verificationStatus === where.verificationStatus)
      ) || null),
    },
    availability: {
      findMany: async () => structuredClone(state.availability),
    },
    appointment: {
      findMany: async ({ where }) => structuredClone(state.appointments.filter((item) => item.doctorId === where.doctorId && item.status === where.status && item.checkoutExpiresAt <= where.checkoutExpiresAt.lte).map(({ id }) => ({ id }))),
      findFirst: async ({ where }) => structuredClone(state.appointments.find((item) => matchesOverlap(item, where)) || null),
      create: async ({ data }) => {
        const appointment = { id: `appointment-${++state.appointmentNumber}`, ...structuredClone(data) };
        state.appointments.push(appointment);
        return structuredClone(appointment);
      },
      updateMany: async ({ where, data }) => {
        const appointment = state.appointments.find((item) => (where.id?.in ? where.id.in.includes(item.id) : item.id === where.id) && item.status === where.status && (!where.checkoutExpiresAt?.gt || item.checkoutExpiresAt > where.checkoutExpiresAt.gt));
        if (!appointment) return { count: 0 };
        Object.assign(appointment, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        const appointment = state.appointments.find((item) => item.id === where.id);
        if (!appointment) throw new Error("Appointment not found");
        Object.assign(appointment, structuredClone(data));
        return structuredClone(appointment);
      },
    },
    appointmentPayment: {
      create: async ({ data }) => {
        const payment = { id: `payment-${state.payments.length + 1}`, status: "PENDING", orderStatus: "CREATED", refundStatus: "NOT_REQUIRED", currency: "INR", razorpayOrderId: null, ...structuredClone(data) };
        state.payments.push(payment);
        return structuredClone(payment);
      },
      findUnique: async ({ where, include }) => paymentResult(state.payments.find((item) => (where.appointmentId && item.appointmentId === where.appointmentId) || (where.razorpayOrderId && item.razorpayOrderId === where.razorpayOrderId)) || null, include),
      update: async ({ where, data }) => {
        const payment = state.payments.find((item) => item.id === where.id && (!where.status || item.status === where.status));
        if (!payment) throw new Error("Payment not found");
        Object.assign(payment, data);
        return structuredClone(payment);
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const payment of state.payments) {
          if (where.status?.in && !where.status.in.includes(payment.status)) continue;
          if (where.status && !where.status.in && payment.status !== where.status) continue;
          if (where.id && payment.id !== where.id) continue;
          if (where.appointmentId?.in && !where.appointmentId.in.includes(payment.appointmentId)) continue;
          Object.assign(payment, data);
          count += 1;
        }
        return { count };
      },
    },
    notification: { createMany: async ({ data }) => { state.notifications.push(...structuredClone(data)); return { count: data.length }; } },
  };
  const db = {
    appointmentPayment: tx.appointmentPayment,
    $transaction: async (work, options) => {
      if (options?.isolationLevel === "Serializable" && state.forcedSerializableFailures > 0) {
        state.forcedSerializableFailures -= 1;
        throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
      }
      const previous = state.transactionQueue;
      let release;
      state.transactionQueue = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await work(tx); } finally { release(); }
    },
  };
  const reconciliation = await reconciliationPromise;
  const dependencies = {
    auth: async () => ({ userId: "clerk-patient" }),
    revalidatePath: () => {},
    addMinutes,
    db,
    createAppointmentNotificationPair: async (_transaction, appointment) => {
      state.notifications.push({ appointmentId: appointment.id, userId: "patient-1" }, { appointmentId: appointment.id, userId: "doctor-1" });
    },
    rupeesToPaise,
    verifyRazorpayPaymentSignature,
    getRazorpayApiConfig: () => {
      if (state.configFailure) throw Object.assign(new Error("Razorpay configuration is invalid"), { diagnosticCode: "CONFIG_KEY_ID_MISSING" });
      return { mode: "test", keyId: "rzp_test_public", keySecret: "test-secret" };
    },
    reconcileCapturedAppointmentPayment: reconciliation.reconcileCapturedAppointmentPayment,
    withSerializableRetries: reconciliation.withSerializableRetries,
    sendAppointmentBookedEmail: async () => {},
    process: { env: { RAZORPAY_KEY_ID: "rzp_test_public", RAZORPAY_KEY_SECRET: "test-secret" } },
    Date: TestDate,
    fetch: async (url, options = {}) => {
      if (url.endsWith("/orders")) {
        if (state.providerOrderFailure) return Response.json({ error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } }, { status: state.providerOrderStatus });
        const body = JSON.parse(options.body);
        state.authorizationValid = options.headers.Authorization === `Basic ${Buffer.from("rzp_test_public:test-secret").toString("base64")}`;
        state.orderRequests.push(body);
        const id = `order_${++state.orderNumber}`;
        return Response.json({ id, amount: body.amount, currency: body.currency, receipt: body.receipt });
      }
      const paymentId = decodeURIComponent(url.split("/").at(-1));
      return Response.json(state.providerPayments.get(paymentId) || { id: paymentId, status: "failed" });
    },
  };
  const factory = new Function("dependencies", `const { auth, revalidatePath, addMinutes, db, createAppointmentNotificationPair, rupeesToPaise, verifyRazorpayPaymentSignature, getRazorpayApiConfig, reconcileCapturedAppointmentPayment, withSerializableRetries, fetch, Date, sendAppointmentBookedEmail } = dependencies; const process = dependencies.process; const console = { error: (...args) => state.diagnostics.push(args) }; const state = dependencies.state; ${transformed}\nreturn { createOnlineAppointmentCheckout, createOfflineAppointmentCheckout, verifyOnlineAppointmentPayment };`);
  dependencies.state = state;
  return { ...factory(dependencies), state, clock };
}

function appointmentForm() {
  const startTime = new Date(2099, 5, 1, 8);
  return new Map([
    ["doctorId", "doctor-1"],
    ["startTime", startTime.toISOString()],
    ["endTime", new Date(startTime.getTime() + 20 * 60 * 1000).toISOString()],
    ["description", ""],
    ["aiSummary", null],
    ["aiSpecialtySuggestion", null],
  ]);
}

function signedPayment(checkout, paymentId = "pay_test_1") {
  const signature = createHmac("sha256", "test-secret").update(`${checkout.orderId}|${paymentId}`).digest("hex");
  return { appointmentId: checkout.appointmentId, orderId: checkout.orderId, paymentId, signature };
}

function setCapturedPayment(state, checkout, paymentId = "pay_test_1", updates = {}) {
  state.providerPayments.set(paymentId, {
    id: paymentId,
    order_id: checkout.orderId,
    amount: checkout.amount,
    currency: "INR",
    status: "captured",
    captured: true,
    ...updates,
  });
}

test("checkout stores ₹500, sends 50000 paise and creates a 15-minute hold", async () => {
  const { createOnlineAppointmentCheckout, state, clock } = await loadPaymentActions();
  const checkout = await createOnlineAppointmentCheckout(appointmentForm());
  assert.equal(checkout.success, true);
  assert.equal(checkout.amountRupees, 500);
  assert.equal(checkout.amount, 50000);
  assert.equal(checkout.currency, "INR");
  assert.equal(checkout.keyId, "rzp_test_public");
  assert.equal(state.authorizationValid, true);
  assert.deepEqual(state.orderRequests[0], { amount: 50000, currency: "INR", receipt: state.appointments[0].id, notes: { appointmentId: state.appointments[0].id } });
  assert.equal(state.payments[0].amountRupees, 500);
  assert.equal(state.payments[0].amountPaise, 50000);
  assert.equal(state.appointments[0].status, "PAYMENT_PENDING");
  assert.equal(new Date(checkout.holdExpiresAt) - clock.now, 15 * 60 * 1000);
  assert.equal(state.appointments[0].endTime - state.appointments[0].startTime, 20 * 60 * 1000);
});

test("₹600 order uses 60000 paise and the selected test-mode key ID", async () => {
  const { createOnlineAppointmentCheckout, state } = await loadPaymentActions();
  state.users[1].consultationPriceRupees = 600;

  const checkout = await createOnlineAppointmentCheckout(appointmentForm());

  assert.equal(checkout.success, true);
  assert.equal(checkout.amount, 60000);
  assert.equal(checkout.amountRupees, 600);
  assert.equal(checkout.currency, "INR");
  assert.equal(checkout.keyId, "rzp_test_public");
  assert.equal(state.orderRequests[0].amount, 60000);
  assert.equal(state.orderRequests[0].currency, "INR");
});

test("missing Razorpay config is diagnosed without creating an appointment or exposing credentials", async () => {
  const { createOnlineAppointmentCheckout, state } = await loadPaymentActions();
  state.configFailure = true;

  const result = await createOnlineAppointmentCheckout(appointmentForm());

  assert.equal(result.code, "PAYMENT_SERVICE_UNAVAILABLE");
  assert.equal(state.appointments.length, 0);
  assert.equal(state.payments.length, 0);
  assert.equal(state.diagnostics.length, 1);
  assert.deepEqual(state.diagnostics[0][1], {
    errorCode: "CONFIG_KEY_ID_MISSING",
    providerCode: null,
    httpStatus: null,
    description: "The Razorpay API key ID is not configured.",
  });
  assert.doesNotMatch(JSON.stringify(state.diagnostics), /test-secret|rzp_test_public/);
});

test("provider order creation failure closes the hold and leaves checkout unsuccessful", async () => {
  const { createOnlineAppointmentCheckout, state } = await loadPaymentActions();
  state.providerOrderFailure = true;
  const result = await createOnlineAppointmentCheckout(appointmentForm());

  assert.equal(result.success, false);
  assert.equal(result.code, "CHECKOUT_UNAVAILABLE");
  assert.deepEqual(state.diagnostics[0][1], {
    errorCode: "BAD_REQUEST_ERROR",
    providerCode: "BAD_REQUEST_ERROR",
    httpStatus: 400,
    description: "Razorpay rejected the order request.",
  });
  assert.doesNotMatch(JSON.stringify(state.diagnostics), /test-secret|rzp_test_public/);
  assert.equal(state.orderNumber, 0);
  assert.equal(state.payments[0].status, "FAILED");
  assert.equal(state.payments[0].orderStatus, "EXPIRED");
  assert.equal(state.appointments[0].status, "CANCELLED");
});

test("HTTP 401 is diagnosed as authentication failure while retaining only the safe provider code", async () => {
  const { createOnlineAppointmentCheckout, state } = await loadPaymentActions();
  state.providerOrderFailure = true;
  state.providerOrderStatus = 401;

  const result = await createOnlineAppointmentCheckout(appointmentForm());

  assert.equal(result.success, false);
  assert.deepEqual(state.diagnostics[0][1], {
    errorCode: "AUTHENTICATION_FAILED",
    providerCode: "BAD_REQUEST_ERROR",
    httpStatus: 401,
    description: "Razorpay did not authenticate the configured API key pair.",
  });
  assert.doesNotMatch(JSON.stringify(state.diagnostics), /test-secret|rzp_test_public|Authentication failed/);
});

test("offline cash booking is scheduled with an explicit cash-due payment and no provider order", async () => {
  const { createOfflineAppointmentCheckout, state } = await loadPaymentActions();
  const result = await createOfflineAppointmentCheckout(appointmentForm(), "CASH");
  assert.equal(result.success, true);
  assert.equal(result.code, "CASH_DUE");
  assert.equal(state.appointments[0].consultationMode, "OFFLINE");
  assert.equal(state.appointments[0].status, "SCHEDULED");
  assert.equal(state.appointments[0].checkoutExpiresAt, null);
  assert.equal(state.payments[0].method, "CASH");
  assert.equal(state.payments[0].status, "CASH_DUE");
  assert.equal(state.payments[0].orderStatus, "NOT_APPLICABLE");
  assert.equal(state.orderNumber, 0);
});

test("offline checkout rejects methods other than cash and UPI QR", async () => {
  const { createOfflineAppointmentCheckout, state } = await loadPaymentActions();
  const result = await createOfflineAppointmentCheckout(appointmentForm(), "ONLINE");
  assert.equal(result.success, false);
  assert.equal(result.code, "INVALID_PAYMENT_METHOD");
  assert.equal(state.appointments.length, 0);
});

test("offline UPI checkout keeps the 15-minute hold and confirms only a captured UPI payment", async () => {
  const { createOfflineAppointmentCheckout, verifyOnlineAppointmentPayment, state } = await loadPaymentActions();
  const checkout = await createOfflineAppointmentCheckout(appointmentForm(), "UPI_QR");
  assert.equal(checkout.success, true);
  assert.equal(state.appointments[0].consultationMode, "OFFLINE");
  assert.equal(state.payments[0].method, "UPI_QR");
  assert.equal(state.appointments[0].status, "PAYMENT_PENDING");
  setCapturedPayment(state, checkout, "pay_upi_1", { method: "upi" });
  const result = await verifyOnlineAppointmentPayment(signedPayment(checkout, "pay_upi_1"));
  assert.equal(result.success, true);
  assert.equal(state.payments[0].status, "PAID");
  assert.equal(state.appointments[0].status, "SCHEDULED");
});

test("offline UPI selection flags a captured non-UPI payment for review", async () => {
  const { createOfflineAppointmentCheckout, verifyOnlineAppointmentPayment, state } = await loadPaymentActions();
  const checkout = await createOfflineAppointmentCheckout(appointmentForm(), "UPI_QR");
  setCapturedPayment(state, checkout, "pay_card_1", { method: "card" });
  const result = await verifyOnlineAppointmentPayment(signedPayment(checkout, "pay_card_1"));
  assert.equal(result.success, false);
  assert.equal(result.code, "REFUND_REVIEW_REQUIRED");
  assert.equal(state.payments[0].status, "PAID");
  assert.equal(state.payments[0].refundStatus, "REVIEW_REQUIRED");
  assert.equal(state.appointments[0].status, "CANCELLED");
});

test("checkout retries a serialization conflict without creating duplicate holds", async () => {
  const { createOnlineAppointmentCheckout, state } = await loadPaymentActions();
  state.forcedSerializableFailures = 1;
  const result = await createOnlineAppointmentCheckout(appointmentForm());
  assert.equal(result.success, true);
  assert.equal(state.appointments.length, 1);
  assert.equal(state.payments.length, 1);
});

test("serializable retry helper does not retry unrelated failures", async () => {
  const { withSerializableRetries } = await reconciliationPromise;
  let attempts = 0;
  await assert.rejects(withSerializableRetries(async () => {
    attempts += 1;
    throw Object.assign(new Error("network failure"), { code: "ECONNRESET" });
  }, { delay: async () => {} }), /network failure/);
  assert.equal(attempts, 1);
});

test("concurrent checkouts for one slot create only one active hold", async () => {
  const { createOnlineAppointmentCheckout, state } = await loadPaymentActions();
  const results = await Promise.all([createOnlineAppointmentCheckout(appointmentForm()), createOnlineAppointmentCheckout(appointmentForm())]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => result.code === "SLOT_UNAVAILABLE").length, 1);
  assert.equal(state.appointments.length, 1);
  assert.equal(state.payments.length, 1);
});

test("invalid or mismatched provider payment never confirms an appointment", async () => {
  const { createOnlineAppointmentCheckout, verifyOnlineAppointmentPayment, state } = await loadPaymentActions();
  const checkout = await createOnlineAppointmentCheckout(appointmentForm());
  const invalid = await verifyOnlineAppointmentPayment({ ...signedPayment(checkout), signature: "invalid" });
  assert.equal(invalid.success, false);
  setCapturedPayment(state, checkout, "pay_test_1", { amount: checkout.amount + 100 });
  const mismatch = await verifyOnlineAppointmentPayment(signedPayment(checkout));
  assert.equal(mismatch.success, false);
  assert.equal(state.appointments[0].status, "PAYMENT_PENDING");
  assert.equal(state.notifications.length, 0);
});

test("a valid signature cannot confirm a provider payment that is not captured", async () => {
  const { createOnlineAppointmentCheckout, verifyOnlineAppointmentPayment, state } = await loadPaymentActions();
  const checkout = await createOnlineAppointmentCheckout(appointmentForm());
  state.providerPayments.set("pay_failed_1", {
    id: "pay_failed_1",
    order_id: checkout.orderId,
    amount: checkout.amount,
    currency: "INR",
    status: "failed",
    captured: false,
  });

  const result = await verifyOnlineAppointmentPayment(signedPayment(checkout, "pay_failed_1"));
  assert.equal(result.success, false);
  assert.equal(state.payments[0].status, "PENDING");
  assert.equal(state.appointments[0].status, "PAYMENT_PENDING");
  assert.equal(state.notifications.length, 0);
});

test("captured payment verification confirms once and repeated verification is idempotent", async () => {
  const { createOnlineAppointmentCheckout, verifyOnlineAppointmentPayment, state } = await loadPaymentActions();
  const checkout = await createOnlineAppointmentCheckout(appointmentForm());
  setCapturedPayment(state, checkout);
  const request = signedPayment(checkout);
  assert.equal((await verifyOnlineAppointmentPayment(request)).success, true);
  state.appointments[0].status = "CONFIRMED";
  assert.equal((await verifyOnlineAppointmentPayment(request)).success, true);
  assert.equal(state.appointments[0].status, "CONFIRMED");
  assert.equal(state.payments[0].status, "PAID");
  assert.equal(state.notifications.length, 2);
});

test("payment confirmation retries a serialization conflict and confirms once", async () => {
  const { createOnlineAppointmentCheckout, verifyOnlineAppointmentPayment, state } = await loadPaymentActions();
  const checkout = await createOnlineAppointmentCheckout(appointmentForm());
  setCapturedPayment(state, checkout);
  state.forcedSerializableFailures = 1;
  assert.equal((await verifyOnlineAppointmentPayment(signedPayment(checkout))).success, true);
  assert.equal(state.appointments[0].status, "SCHEDULED");
  assert.equal(state.notifications.length, 2);
});

test("exhausted payment transaction retries preserve a captured payment for admin review", async () => {
  const { createOnlineAppointmentCheckout, verifyOnlineAppointmentPayment, state } = await loadPaymentActions();
  const checkout = await createOnlineAppointmentCheckout(appointmentForm());
  setCapturedPayment(state, checkout);
  state.forcedSerializableFailures = 3;
  const result = await verifyOnlineAppointmentPayment(signedPayment(checkout));
  assert.equal(result.success, false);
  assert.equal(result.code, "REFUND_REVIEW_REQUIRED");
  assert.equal(state.payments[0].status, "PAID");
  assert.equal(state.payments[0].refundStatus, "REVIEW_REQUIRED");
  assert.equal(state.appointments[0].status, "CANCELLED");
});

test("expired holds release the slot and a delayed capture is flagged for refund review", async () => {
  const { createOnlineAppointmentCheckout, verifyOnlineAppointmentPayment, state, clock } = await loadPaymentActions();
  const expiredCheckout = await createOnlineAppointmentCheckout(appointmentForm());
  clock.now = new Date(new Date(expiredCheckout.holdExpiresAt).getTime() + 1);
  const nextCheckout = await createOnlineAppointmentCheckout(appointmentForm());
  assert.equal(nextCheckout.success, true);
  assert.equal(state.appointments[0].status, "CANCELLED");
  assert.equal(state.payments[0].status, "EXPIRED");
  setCapturedPayment(state, expiredCheckout, "pay_late_1");
  const delayedResult = await verifyOnlineAppointmentPayment(signedPayment(expiredCheckout, "pay_late_1"));
  assert.equal(delayedResult.code, "REFUND_REVIEW_REQUIRED");
  assert.equal(state.appointments[0].status, "CANCELLED");
  assert.equal(state.payments[0].status, "PAID");
  assert.equal(state.payments[0].refundStatus, "REVIEW_REQUIRED");
});
