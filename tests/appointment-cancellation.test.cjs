const { test } = require("node:test");
const assert = require("node:assert/strict");
const cancellationModule = import("../lib/appointment-cancellation.mjs");

function createDatabase({ appointmentStatus = "SCHEDULED", payment = null, paymentUpdateCount = 1 } = {}) {
  const state = {
    appointment: { id: "appointment-1", patientId: "patient-1", doctorId: "doctor-1", status: appointmentStatus },
    payment: payment && { appointmentId: "appointment-1", ...payment },
    notifications: [],
  };
  const tx = {
    appointment: {
      findUnique: async () => structuredClone(state.appointment),
      updateMany: async ({ where, data }) => {
        if (state.appointment.status !== where.status) return { count: 0 };
        Object.assign(state.appointment, data);
        return { count: 1 };
      },
    },
    appointmentPayment: {
      findUnique: async () => structuredClone(state.payment),
      updateMany: async ({ where, data }) => {
        if (!state.payment || state.payment.status !== where.status || (where.refundStatus && state.payment.refundStatus !== where.refundStatus)) return { count: 0 };
        if (where.refundStatus && paymentUpdateCount !== 1) return { count: paymentUpdateCount };
        Object.assign(state.payment, data);
        return { count: 1 };
      },
    },
    payoutPaymentAllocation: { findMany: async () => [] },
    payout: { updateMany: async () => ({ count: 0 }) },
    notification: { createMany: async ({ data }) => { state.notifications.push(...data); return { count: data.length }; } },
  };
  return {
    state,
    async cancel(actorId = "patient-1") {
      const { cancelAppointmentInTransaction } = await cancellationModule;
      return cancelAppointmentInTransaction(tx, {
        appointmentId: "appointment-1",
        actorId,
        notify: (transaction, appointment) => transaction.notification.createMany({ data: [
          { userId: appointment.patientId, dedupeKey: `appointment:${appointment.id}:cancelled:patient` },
          { userId: appointment.doctorId, dedupeKey: `appointment:${appointment.id}:cancelled:doctor` },
        ], skipDuplicates: true }),
      });
    },
  };
}

test("unpaid appointment cancellation changes status and notifies participants without credit accounting", async () => {
  const db = createDatabase();
  await db.cancel();
  assert.equal(db.state.appointment.status, "CANCELLED");
  assert.equal(db.state.notifications.length, 2);
  assert.equal("credits" in db.state, false);
});

test("paid appointment cancellation flags refund review and preserves collected payment status", async () => {
  const db = createDatabase({ payment: { id: "payment-1", status: "PAID", refundStatus: "NOT_REQUIRED" } });
  await db.cancel();
  assert.equal(db.state.appointment.status, "CANCELLED");
  assert.equal(db.state.payment.status, "PAID");
  assert.equal(db.state.payment.refundStatus, "REVIEW_REQUIRED");
  assert.equal(db.state.notifications.length, 2);
});

test("paid appointment cancellation aborts if refund review could not be recorded", async () => {
  const db = createDatabase({ payment: { id: "payment-1", status: "PAID", refundStatus: "NOT_REQUIRED" }, paymentUpdateCount: 0 });
  await assert.rejects(db.cancel(), /cannot be cancelled/);
  assert.equal(db.state.payment.refundStatus, "NOT_REQUIRED");
});

test("cancelling pending checkout expires payment and clears the appointment hold", async () => {
  const db = createDatabase({ appointmentStatus: "PAYMENT_PENDING", payment: { id: "payment-1", status: "PENDING", orderStatus: "CREATED" } });
  db.state.appointment.checkoutExpiresAt = new Date(Date.now() + 60000);
  await db.cancel();
  assert.equal(db.state.appointment.status, "CANCELLED");
  assert.equal(db.state.appointment.checkoutExpiresAt, null);
  assert.equal(db.state.payment.status, "EXPIRED");
  assert.equal(db.state.payment.orderStatus, "EXPIRED");
});

test("cancelling cash-due appointment cancels only the unpaid cash obligation", async () => {
  const db = createDatabase({ payment: { id: "payment-1", status: "CASH_DUE", method: "CASH" } });
  await db.cancel();
  assert.equal(db.state.appointment.status, "CANCELLED");
  assert.equal(db.state.payment.status, "CANCELLED");
});

test("cancellation remains authorized and rejects invalid/repeated transitions", async () => {
  const { CANCELLATION_ERRORS } = await cancellationModule;
  const unauthorized = createDatabase();
  await assert.rejects(unauthorized.cancel("other-user"), /not authorized/);
  const cancelled = createDatabase({ appointmentStatus: "CANCELLED" });
  await assert.rejects(cancelled.cancel(), new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE));
});
