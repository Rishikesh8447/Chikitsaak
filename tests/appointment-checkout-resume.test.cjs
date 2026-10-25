const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadResumeAction({ appointmentOverrides = {}, paymentOverrides = {}, providerOrder = {}, ownerPatientId = "patient-1" } = {}) {
  const source = await readFile(join(process.cwd(), "actions", "payments.js"), "utf8");
  const transformed = source.replace(/^import .*;\r?\n/gm, "").replaceAll("export async function", "async function");
  const state = { providerRequests: [] };
  const appointment = {
    id: "appointment-1",
    patientId: ownerPatientId,
    status: "PAYMENT_PENDING",
    consultationMode: "ONLINE",
    checkoutExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    payment: {
      id: "payment-1",
      status: "PENDING",
      orderStatus: "CREATED",
      refundStatus: "NOT_REQUIRED",
      verifiedAt: null,
      method: "ONLINE",
      amountRupees: 500,
      amountPaise: 50000,
      currency: "INR",
      razorpayOrderId: "order_existing_1",
    },
    ...structuredClone(appointmentOverrides),
  };
  appointment.payment = { ...appointment.payment, ...structuredClone(paymentOverrides) };
  const dependencies = {
    auth: async () => ({ userId: "clerk-patient" }),
    db: {
      user: { findUnique: async ({ where }) => where.clerkUserId === "clerk-patient" && where.role === "PATIENT" ? { id: "patient-1" } : null },
      appointment: { findUnique: async ({ where }) => where.id === appointment.id && where.patientId === appointment.patientId ? structuredClone(appointment) : null },
    },
    getRazorpayApiConfig: () => ({ mode: "test", keyId: "rzp_test_public", keySecret: "test-secret" }),
    rupeesToPaise: (rupees) => rupees * 100,
    fetch: async (url, options) => {
      state.providerRequests.push({ url, options });
      return Response.json({
        id: "order_existing_1",
        receipt: "appointment-1",
        amount: 50000,
        currency: "INR",
        status: "created",
        amount_paid: 0,
        amount_due: 50000,
        ...providerOrder,
      });
    },
  };
  const factory = new Function("dependencies", `const { auth, db, getRazorpayApiConfig, rupeesToPaise, fetch } = dependencies; ${transformed}\nreturn { resumePendingAppointmentCheckout };`);
  return { resumePendingAppointmentCheckout: factory(dependencies).resumePendingAppointmentCheckout, state };
}

test("only the authenticated patient's own appointment can be resumed", async () => {
  const { resumePendingAppointmentCheckout, state } = await loadResumeAction({ ownerPatientId: "patient-other" });
  const result = await resumePendingAppointmentCheckout("appointment-1");
  assert.equal(result.success, false);
  assert.equal(result.code, "APPOINTMENT_NOT_FOUND");
  assert.equal(state.providerRequests.length, 0);
});

for (const [label, appointmentOverrides, paymentOverrides, providerChecks] of [
  ["cancelled appointment", { status: "CANCELLED" }, {}, 1],
  ["expired hold", { checkoutExpiresAt: new Date(Date.now() - 1000) }, {}, 1],
  ["paid payment", {}, { status: "PAID" }, 0],
  ["failed payment", {}, { status: "FAILED" }, 1],
  ["expired payment", {}, { status: "EXPIRED" }, 1],
  ["admin-review payment", {}, { refundStatus: "REVIEW_REQUIRED" }, 0],
  ["cash payment", { consultationMode: "OFFLINE" }, { method: "CASH" }, 0],
]) {
  test(`${label} checkout is not resumed`, async () => {
    const { resumePendingAppointmentCheckout, state } = await loadResumeAction({ appointmentOverrides, paymentOverrides });
    const result = await resumePendingAppointmentCheckout("appointment-1");
    assert.equal(result.success, false);
    assert.equal(state.providerRequests.length, providerChecks);
  });
}

test("eligible existing order is verified and reused without creating another order or payment", async () => {
  const { resumePendingAppointmentCheckout, state } = await loadResumeAction();
  const result = await resumePendingAppointmentCheckout("appointment-1");
  assert.equal(result.success, true);
  assert.equal(result.orderId, "order_existing_1");
  assert.equal(result.appointmentId, "appointment-1");
  assert.equal(result.amount, 50000);
  assert.equal(result.keyId, "rzp_test_public");
  assert.equal(Object.hasOwn(result, "keySecret"), false);
  assert.equal(state.providerRequests.length, 1);
  assert.match(state.providerRequests[0].url, /\/orders\/order_existing_1$/);
  assert.equal(state.providerRequests[0].options.method, undefined);
  assert.match(state.providerRequests[0].options.headers.Authorization, /^Basic /);
});

test("provider order that is already paid is not returned for another checkout attempt", async () => {
  const { resumePendingAppointmentCheckout, state } = await loadResumeAction({
    providerOrder: { status: "paid", amount_paid: 50000, amount_due: 0 },
  });
  const result = await resumePendingAppointmentCheckout("appointment-1");
  assert.equal(result.success, false);
  assert.equal(result.code, "PAYMENT_PROCESSING");
  assert.equal(result.orderId, undefined);
  assert.equal(state.providerRequests.length, 1);
});

test("expired or failed local payment with captured provider funds is reported as processing, never resumed", async () => {
  for (const paymentStatus of ["EXPIRED", "FAILED"]) {
    const { resumePendingAppointmentCheckout, state } = await loadResumeAction({
      appointmentOverrides: { status: "CANCELLED", checkoutExpiresAt: null },
      paymentOverrides: { status: paymentStatus, orderStatus: "EXPIRED" },
      providerOrder: { status: "paid", amount_paid: 50000, amount_due: 0 },
    });
    const result = await resumePendingAppointmentCheckout("appointment-1");
    assert.equal(result.success, false);
    assert.equal(result.code, "PAYMENT_PROCESSING");
    assert.equal(result.orderId, undefined);
    assert.equal(state.providerRequests.length, 1);
  }
});

test("offline UPI checkout resumes only the persisted UPI order", async () => {
  const { resumePendingAppointmentCheckout } = await loadResumeAction({
    appointmentOverrides: { consultationMode: "OFFLINE" },
    paymentOverrides: { method: "UPI_QR" },
  });
  const result = await resumePendingAppointmentCheckout("appointment-1");
  assert.equal(result.success, true);
  assert.equal(result.method, "UPI_QR");
  assert.equal(result.orderId, "order_existing_1");
});
