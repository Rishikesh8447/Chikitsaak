const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const {
  flagPaymentPayoutsForReview,
  isEligibleCollectedPayment,
  recordPaymentPayoutTransfer,
  releasePaymentPayoutAllocations,
  reservePaymentCollections,
} = require("../lib/payment-payouts.mjs");

const eligible = (overrides = {}) => ({
  id: "payment-1",
  status: "PAID",
  verifiedAt: new Date(),
  refundStatus: "NOT_REQUIRED",
  currency: "INR",
  amountPaise: 25000,
  method: "ONLINE",
  appointment: { doctorId: "doctor-1", status: "COMPLETED" },
  cashCollection: null,
  ...overrides,
});

function transactionalStore(seed) {
  let state = structuredClone(seed);
  let nextId = 1;
  let previous = Promise.resolve();
  const transaction = (work) => {
    const run = previous.then(async () => {
      const draft = structuredClone(state);
      const tx = {
        appointmentPayment: {
          findMany: async () => draft.payments.filter((payment) => payment.status === "PAID" && payment.refundStatus === "NOT_REQUIRED" && !draft.allocations.some((allocation) => allocation.appointmentPaymentId === payment.id && ["RESERVED", "PAID"].includes(allocation.status))),
        },
        payout: {
          create: async ({ data }) => { const payout = { id: `payout-${nextId++}`, ...structuredClone(data), reviewRequiredAt: null, reviewReason: null }; draft.payouts.push(payout); return payout; },
          updateMany: async ({ where, data }) => {
            const payout = draft.payouts.find((item) => (Array.isArray(where.id?.in) ? where.id.in.includes(item.id) : !where.id || item.id === where.id) && (!where.status || item.status === where.status) && (where.reviewRequiredAt === undefined || (where.reviewRequiredAt?.not === null ? item.reviewRequiredAt !== null : item.reviewRequiredAt === where.reviewRequiredAt)));
            if (!payout) return { count: 0 };
            Object.assign(payout, data);
            return { count: 1 };
          },
          findMany: async ({ where }) => draft.payouts.filter((item) => where.id?.in?.includes(item.id) && item.reviewRequiredAt === null),
        },
        payoutPaymentAllocation: {
          createMany: async ({ data }) => {
            for (const allocation of data) {
              if (allocation.activePaymentId && draft.allocations.some((item) => item.activePaymentId === allocation.activePaymentId)) throw new Error("unique active payment allocation");
              draft.allocations.push({ id: `allocation-${nextId++}`, ...structuredClone(allocation), createdAt: new Date(), releasedAt: null, paidAt: null });
            }
          },
          findMany: async ({ where }) => draft.allocations.filter((item) =>
            (!where.payoutId || item.payoutId === where.payoutId)
            && (!where.appointmentPaymentId || item.appointmentPaymentId === where.appointmentPaymentId)
            && (!where.status || (Array.isArray(where.status.in) ? where.status.in.includes(item.status) : item.status === where.status))
          ).map((item) => ({ ...item, appointmentPayment: draft.payments.find((payment) => payment.id === item.appointmentPaymentId) })),
          updateMany: async ({ where, data }) => {
            const found = draft.allocations.filter((item) => item.payoutId === where.payoutId && item.status === where.status);
            found.forEach((item) => Object.assign(item, data));
            return { count: found.length };
          },
        },
      };
      const result = await work(tx);
      state = draft;
      return result;
    });
    previous = run.catch(() => {});
    return run;
  };
  return {
    transaction,
    setPayment(id, changes) { Object.assign(state.payments.find((payment) => payment.id === id), changes); },
    get state() { return structuredClone(state); },
  };
}

test("eligibility requires a verified paid INR collection, completed appointment and cash audit", () => {
  assert.equal(isEligibleCollectedPayment(eligible()), true);
  assert.equal(isEligibleCollectedPayment(eligible({ status: "PENDING" })), false);
  assert.equal(isEligibleCollectedPayment(eligible({ status: "FAILED" })), false);
  assert.equal(isEligibleCollectedPayment(eligible({ verifiedAt: null })), false);
  assert.equal(isEligibleCollectedPayment(eligible({ refundStatus: "REVIEW_REQUIRED" })), false);
  assert.equal(isEligibleCollectedPayment(eligible({ refundStatus: "REFUNDED" })), false);
  assert.equal(isEligibleCollectedPayment(eligible({ appointment: { doctorId: "doctor-1", status: "SCHEDULED" } })), false);
  assert.equal(isEligibleCollectedPayment(eligible({ method: "CASH" })), false);
  assert.equal(isEligibleCollectedPayment(eligible({ method: "CASH", cashCollection: { paymentId: "payment-1" } })), true);
});

test("concurrent requests reserve the same collected payment only once", async () => {
  const store = transactionalStore({ payments: [eligible()], payouts: [], allocations: [] });
  const results = await Promise.allSettled([
    store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000001" })),
    store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000002" })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(store.state.allocations.length, 1);
  assert.equal(store.state.payouts.length, 1);
  assert.equal(store.state.payouts[0].amountPaise, 25000n);
  assert.equal(store.state.payouts[0].platformFeePaise, 0n);
});

test("rejection releases allocations so a later payout can reserve the same payment", async () => {
  const store = transactionalStore({ payments: [eligible()], payouts: [], allocations: [] });
  const payout = await store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000001" }));
  await store.transaction((tx) => releasePaymentPayoutAllocations(tx, payout.id, { processedBy: "admin-1" }));
  const next = await store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000002" }));
  assert.equal(store.state.payouts[0].status, "FAILED");
  assert.equal(store.state.allocations[0].status, "RELEASED");
  assert.equal(store.state.allocations[0].activePaymentId, null);
  assert.equal(next.allocations[0].activePaymentId, "payment-1");
});

test("a review flag keeps an unknown transfer outcome reserved and blocks release or reuse", async () => {
  const store = transactionalStore({ payments: [eligible()], payouts: [], allocations: [] });
  const payout = await store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000001" }));
  store.setPayment("payment-1", { refundStatus: "REVIEW_REQUIRED" });
  await store.transaction((tx) => flagPaymentPayoutsForReview(tx, "payment-1", "Refund requires review"));
  await assert.rejects(store.transaction((tx) => releasePaymentPayoutAllocations(tx, payout.id, { processedBy: "admin-1" })), /no longer pending/);
  assert.equal(store.state.payouts[0].status, "PROCESSING");
  assert.equal(store.state.allocations[0].status, "RESERVED");
  assert.equal(store.state.allocations[0].activePaymentId, "payment-1");
  await assert.rejects(store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000002" })), /No collected appointment payments/);
});

test("explicit no-transfer resolution releases a review-flagged reservation", async () => {
  const store = transactionalStore({ payments: [eligible()], payouts: [], allocations: [] });
  const payout = await store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000001" }));
  store.setPayment("payment-1", { refundStatus: "REVIEW_REQUIRED" });
  await store.transaction((tx) => flagPaymentPayoutsForReview(tx, "payment-1", "Refund requires review"));
  await assert.rejects(store.transaction((tx) => releasePaymentPayoutAllocations(tx, payout.id, { processedBy: "admin-1" })), /no longer pending/);
  await store.transaction((tx) => releasePaymentPayoutAllocations(tx, payout.id, { processedBy: "admin-1", allowReviewRelease: true }));
  assert.equal(store.state.payouts[0].status, "FAILED");
  assert.equal(store.state.payouts[0].reviewRequiredAt instanceof Date, true);
  assert.equal(store.state.allocations[0].status, "RELEASED");
  assert.equal(store.state.allocations[0].activePaymentId, null);
});

test("explicit sent-transfer resolution records flagged payout while retaining review and paid allocation", async () => {
  const store = transactionalStore({ payments: [eligible()], payouts: [], allocations: [] });
  const payout = await store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000001" }));
  store.setPayment("payment-1", { refundStatus: "REVIEW_REQUIRED" });
  await store.transaction((tx) => flagPaymentPayoutsForReview(tx, "payment-1", "Refund event after transfer"));
  const flagged = store.state.payouts[0];
  await store.transaction((tx) => recordPaymentPayoutTransfer(tx, { payout: flagged, adminId: "admin-1", transferReference: "bank-ref-123", allowReviewRequired: true }));
  const after = store.state;
  assert.equal(after.payouts[0].status, "PROCESSED");
  assert.equal(after.payouts[0].transferReference, "bank-ref-123");
  assert.ok(after.payouts[0].reviewRequiredAt instanceof Date);
  assert.equal(after.allocations[0].status, "PAID");
  await assert.rejects(store.transaction((tx) => releasePaymentPayoutAllocations(tx, payout.id, { processedBy: "admin-1", allowReviewRelease: true })), /no longer pending/);
  store.setPayment("payment-1", { refundStatus: "NOT_REQUIRED" });
  await assert.rejects(store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000002" })), /No collected appointment payments/);
});

test("late refund review flags a completed transfer without changing paid allocations", async () => {
  const store = transactionalStore({ payments: [eligible()], payouts: [], allocations: [] });
  const payout = await store.transaction((tx) => reservePaymentCollections(tx, { doctorId: "doctor-1", requestKey: "request_key_0000001" }));
  await store.transaction((tx) => recordPaymentPayoutTransfer(tx, { payout, adminId: "admin-1", transferReference: "bank-ref-123" }));
  assert.equal(await store.transaction((tx) => flagPaymentPayoutsForReview(tx, "payment-1", "Refund event after transfer")), 1);
  const [after] = store.state.payouts;
  assert.equal(after.status, "PROCESSED");
  assert.equal(after.transferReference, "bank-ref-123");
  assert.ok(after.reviewRequiredAt instanceof Date);
  assert.equal(store.state.allocations[0].status, "PAID");
  assert.deepEqual(await store.transaction((tx) => recordPaymentPayoutTransfer(tx, { payout: after, adminId: "admin-1", transferReference: "bank-ref-123" })), { allocationCount: 0, alreadyRecorded: true });
  await assert.rejects(store.transaction((tx) => recordPaymentPayoutTransfer(tx, { payout: after, adminId: "admin-1", transferReference: "bank-ref-456" })), /no longer pending/);
});

test("payout SQL enforces unique active allocation and transfer references", async () => {
  const sql = await readFile("prisma/migrations/20261024120000_payment_backed_doctor_payouts/migration.sql", "utf8");
  assert.match(sql.trim(), /^--[\s\S]*BEGIN;[\s\S]*COMMIT;$/);
  assert.match(sql, /CREATE UNIQUE INDEX "Payout_transferReference_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "PayoutPaymentAllocation_activePaymentId_key"/);
  assert.match(sql, /"requestKey" IS NOT NULL/);
  assert.match(sql, /"amountPaise" IS NOT NULL/);
  assert.match(sql, /"activePaymentId" IS NOT NULL/);
  assert.match(sql, /PayoutPaymentAllocation_payoutId_fkey/);
  assert.match(sql, /PayoutPaymentAllocation_appointmentPaymentId_fkey/);
  assert.match(sql, /"status" = 'PROCESSED'.*"transferReference" IS NOT NULL/s);
});

test("payout request retries reuse the request key inside the serializable transaction", async () => {
  const source = await readFile("actions/payout.js", "utf8");
  const schema = await readFile("prisma/schema.prisma", "utf8");
  assert.match(schema, /requestKey\s+String\?\s+@unique/);
  assert.match(source, /tx\.payout\.findUnique\(\{ where: \{ requestKey \} \}\)/);
  assert.match(source, /return \{ payout: duplicate, alreadyRequested: true \}/);
});
