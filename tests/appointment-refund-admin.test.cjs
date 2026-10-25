const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadRefundActions({ role = "ADMIN" } = {}) {
  const source = await readFile(join(process.cwd(), "actions", "admin.js"), "utf8");
  const section = source.slice(source.indexOf("async function getPersistedAdmin()"))
    .replaceAll("export async function", "async function");
  const state = {
    user: { id: "admin-1", clerkUserId: "clerk-admin", role },
    payments: [{ id: "payment-1", refundStatus: "REVIEW_REQUIRED", amountRupees: 500, currency: "INR", createdAt: new Date(), razorpayPaymentId: "pay_test_1", appointment: { id: "appointment-1", status: "CANCELLED", startTime: new Date(), endTime: new Date(), patient: { name: "Patient" }, doctor: { name: "Doctor" } } }],
    decisions: [],
    revalidated: [],
  };
  const tx = {
    appointmentPayment: {
      updateMany: async ({ where, data }) => {
        const payment = state.payments.find((item) => item.id === where.id && item.refundStatus === where.refundStatus);
        if (!payment) return { count: 0 };
        payment.refundStatus = data.refundStatus;
        return { count: 1 };
      },
    },
    appointmentRefundDecision: {
      create: async ({ data }) => {
        if (state.decisions.some((item) => item.paymentId === data.paymentId)) throw Object.assign(new Error("unique"), { code: "P2002" });
        state.decisions.push(structuredClone(data));
        return data;
      },
    },
  };
  const db = {
    user: { findUnique: async () => state.user },
    appointmentPayment: { findMany: async () => structuredClone(state.payments.filter((item) => item.refundStatus === "REVIEW_REQUIRED")) },
    $transaction: async (work) => work(tx),
  };
  const factory = new Function("dependencies", `const { auth, db, revalidatePath, flagPaymentPayoutsForReview } = dependencies; ${section}\nreturn { getAppointmentRefundReviews, decideAppointmentRefundReview };`);
  return { ...factory({ auth: async () => ({ userId: "clerk-admin" }), db, revalidatePath: (path) => state.revalidated.push(path), flagPaymentPayoutsForReview: async () => 0 }), state };
}

test("refund review actions require a persisted admin role", async () => {
  const { getAppointmentRefundReviews, decideAppointmentRefundReview, state } = await loadRefundActions({ role: "PATIENT" });
  await assert.rejects(getAppointmentRefundReviews(), /Unauthorized/);
  await assert.rejects(decideAppointmentRefundReview(new Map([
    ["paymentId", "payment-1"], ["decision", "APPROVED"], ["note", "Reviewed"]
  ])), /Unauthorized/);
  assert.equal(state.decisions.length, 0);
  assert.equal(state.payments[0].refundStatus, "REVIEW_REQUIRED");
});

test("admin decision stores an audit note once and a duplicate request is rejected", async () => {
  const { getAppointmentRefundReviews, decideAppointmentRefundReview, state } = await loadRefundActions();
  assert.equal((await getAppointmentRefundReviews()).reviews.length, 1);
  const form = new Map([["paymentId", "payment-1"], ["decision", "APPROVED"], ["note", "Eligibility reviewed by administrator"]]);
  assert.deepEqual(await decideAppointmentRefundReview(form), { success: true, decision: "APPROVED" });
  await assert.rejects(decideAppointmentRefundReview(form), /already decided/);
  assert.equal(state.payments[0].refundStatus, "APPROVED");
  assert.equal(state.decisions.length, 1);
  assert.equal(state.decisions[0].note, "Eligibility reviewed by administrator");
  assert.deepEqual(state.revalidated, ["/admin"]);
});
