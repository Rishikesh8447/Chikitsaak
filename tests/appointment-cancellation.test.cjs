const { test } = require("node:test");
const assert = require("node:assert/strict");
const cancellationModule = import("../lib/appointment-cancellation.mjs");

function createDatabase(seed) {
  let state = structuredClone(seed);
  return {
    get state() {
      return structuredClone(state);
    },
    async $transaction(work) {
      const draft = structuredClone(state);
      const tx = {
        appointment: {
          findUnique: async ({ where }) => structuredClone(draft.appointments.find((item) => item.id === where.id) || null),
          updateMany: async ({ where, data }) => {
            const appointment = draft.appointments.find((item) => item.id === where.id && item.status === where.status);
            if (!appointment) return { count: 0 };
            Object.assign(appointment, data);
            return { count: 1 };
          },
        },
        user: {
          findUnique: async ({ where }) => structuredClone(draft.users.find((item) => item.id === where.id) || null),
          update: async ({ where, data }) => {
            const user = draft.users.find((item) => item.id === where.id);
            if (!user) throw new Error("User not found");
            if (data.credits?.increment !== undefined) user.credits += data.credits.increment;
            return structuredClone(user);
          },
          updateMany: async ({ where, data }) => {
            const user = draft.users.find((item) => item.id === where.id && item.credits >= where.credits.gte);
            if (!user) return { count: 0 };
            user.credits -= data.credits.decrement;
            return { count: 1 };
          },
        },
        payout: {
          findFirst: async ({ where }) => structuredClone(draft.payouts.find((item) => item.doctorId === where.doctorId && item.status === where.status) || null),
        },
        creditTransaction: {
          findUnique: async ({ where }) => structuredClone(draft.transactions.find((item) => item.allocationKey === where.allocationKey) || null),
          create: async ({ data }) => {
            if (draft.transactions.some((item) => item.allocationKey === data.allocationKey)) {
              const error = new Error("Unique allocation key");
              error.code = "P2002";
              throw error;
            }
            draft.transactions.push(structuredClone(data));
            return data;
          },
        },
        notification: {
          createMany: async ({ data, skipDuplicates }) => {
            let count = 0;
            for (const notification of data) {
              if (skipDuplicates && draft.notifications.some((item) => item.dedupeKey === notification.dedupeKey)) continue;
              draft.notifications.push(structuredClone(notification));
              count += 1;
            }
            return { count };
          },
        },
      };
      const result = await work(tx);
      state = draft;
      return result;
    },
  };
}

function seed({ doctorCredits = 2, payouts = [], extraTransactions = [] } = {}) {
  return {
    appointments: [{ id: "appointment-1", patientId: "patient-1", doctorId: "doctor-1", status: "SCHEDULED" }],
    users: [
      { id: "patient-1", credits: 8 },
      { id: "doctor-1", credits: doctorCredits },
    ],
    payouts: structuredClone(payouts),
    transactions: [
      { userId: "patient-1", amount: -2, type: "APPOINTMENT_DEDUCTION", allocationKey: "appointment:appointment-1:patient-debit" },
      { userId: "doctor-1", amount: 2, type: "APPOINTMENT_DEDUCTION", allocationKey: "appointment:appointment-1:doctor-credit" },
      ...structuredClone(extraTransactions),
    ],
    notifications: [],
  };
}

async function cancel(db, actorId = "patient-1") {
  const { cancelAppointmentInTransaction } = await cancellationModule;
  return db.$transaction((tx) => cancelAppointmentInTransaction(tx, {
    appointmentId: "appointment-1",
    actorId,
    notify: (transaction, appointment) => transaction.notification.createMany({
      data: [
        { userId: appointment.patientId, dedupeKey: `appointment:${appointment.id}:cancelled:patient` },
        { userId: appointment.doctorId, dedupeKey: `appointment:${appointment.id}:cancelled:doctor` },
      ],
      skipDuplicates: true,
    }),
  }));
}

test("cancellation refunds the patient and reverses the doctor's available appointment credits", async () => {
  const db = createDatabase(seed());

  await cancel(db);

  const state = db.state;
  assert.equal(state.appointments[0].status, "CANCELLED");
  assert.equal(state.users.find((user) => user.id === "patient-1").credits, 10);
  assert.equal(state.users.find((user) => user.id === "doctor-1").credits, 0);
  assert.deepEqual(state.transactions.slice(-2).map(({ userId, amount, type }) => ({ userId, amount, type })), [
    { userId: "patient-1", amount: 2, type: "APPOINTMENT_REFUND" },
    { userId: "doctor-1", amount: -2, type: "APPOINTMENT_REFUND" },
  ]);
});

test("cancellation rolls back when a pending payout leaves fewer than two available credits", async () => {
  const { CANCELLATION_ERRORS } = await cancellationModule;
  const payout = { id: "payout-1", doctorId: "doctor-1", credits: 4, amount: 40, status: "PROCESSING" };
  const db = createDatabase(seed({
    doctorCredits: 1,
    payouts: [payout],
    extraTransactions: [{ userId: "doctor-1", amount: -4, type: "ADMIN_ADJUSTMENT", allocationKey: "payout:payout-1:credit-reservation" }],
  }));
  const before = db.state;

  await assert.rejects(cancel(db), new Error(CANCELLATION_ERRORS.PAYOUT_RESERVED));

  assert.deepEqual(db.state, before);
  assert.equal(db.state.users.find((user) => user.id === "doctor-1").credits, 1);
  assert.equal(db.state.payouts[0].status, "PROCESSING");
  assert.equal(db.state.payouts[0].credits, 4);
  assert.equal(db.state.users.find((user) => user.id === "patient-1").credits, 8);
});

test("cancellation after payout processing does not alter the processed payout", async () => {
  const payout = { id: "payout-1", doctorId: "doctor-1", credits: 4, amount: 40, netAmount: 32, status: "PROCESSED" };
  const db = createDatabase(seed({
    doctorCredits: 2,
    payouts: [payout],
    extraTransactions: [{ userId: "doctor-1", amount: -4, type: "ADMIN_ADJUSTMENT", allocationKey: "payout:payout-1:credit-reservation" }],
  }));

  await cancel(db);

  const state = db.state;
  assert.equal(state.appointments[0].status, "CANCELLED");
  assert.equal(state.users.find((user) => user.id === "patient-1").credits, 10);
  assert.equal(state.users.find((user) => user.id === "doctor-1").credits, 0);
  assert.deepEqual(state.payouts[0], payout);
  assert.equal(state.transactions.filter((item) => item.allocationKey === "payout:payout-1:credit-reservation").length, 1);
});

test("repeated cancellation does not create duplicate refunds", async () => {
  const { CANCELLATION_ERRORS } = await cancellationModule;
  const db = createDatabase(seed());
  await cancel(db);
  const afterFirstCancellation = db.state;

  await assert.rejects(cancel(db), new Error(CANCELLATION_ERRORS.NOT_CANCELLABLE));

  assert.deepEqual(db.state, afterFirstCancellation);
  assert.equal(db.state.transactions.filter((item) => item.type === "APPOINTMENT_REFUND").length, 2);
});
