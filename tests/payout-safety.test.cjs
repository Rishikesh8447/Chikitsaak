const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const sourcePromise = readFile(join(process.cwd(), "actions/admin.js"), "utf8");
const payoutSourcePromise = readFile(join(process.cwd(), "actions/payout.js"), "utf8");
const payment = {
  id: "payment-1", status: "PAID", verifiedAt: new Date(), refundStatus: "REVIEW_REQUIRED",
  currency: "INR", amountPaise: 25000, method: "ONLINE",
  appointment: { doctorId: "doctor-1", status: "COMPLETED" }, cashCollection: null,
};

async function makeAdminAction({ role = "ADMIN", transferReference = null, allocationStatus = "RESERVED" } = {}) {
  const state = {
    payout: {
      id: "payout-1", doctorId: "doctor-1", status: "PROCESSING", currency: "INR", amountPaise: 25000n,
      netAmountPaise: 25000n, transferReference, reviewRequiredAt: new Date(), reviewReason: "Refund review required",
      doctor: { id: "doctor-1", role: "DOCTOR" },
    },
    allocation: { id: "allocation-1", payoutId: "payout-1", appointmentPaymentId: "payment-1", activePaymentId: "payment-1", amountPaise: 25000n, status: allocationStatus, appointmentPayment: structuredClone(payment) },
    notifications: [],
  };
  const tx = {
    payout: {
      findFirst: async () => structuredClone(state.payout),
      updateMany: async ({ where, data }) => {
        if (state.payout.id !== where.id || state.payout.status !== where.status) return { count: 0 };
        if (where.reviewRequiredAt?.not === null && !state.payout.reviewRequiredAt) return { count: 0 };
        Object.assign(state.payout, data);
        return { count: 1 };
      },
    },
    payoutPaymentAllocation: {
      findMany: async ({ where }) => state.allocation.payoutId === where.payoutId && (Array.isArray(where.status?.in) ? where.status.in.includes(state.allocation.status) : !where.status || state.allocation.status === where.status) ? [structuredClone(state.allocation)] : [],
      updateMany: async ({ where, data }) => {
        if (state.allocation.payoutId !== where.payoutId || state.allocation.status !== where.status) return { count: 0 };
        Object.assign(state.allocation, data);
        return { count: 1 };
      },
    },
    notification: { createMany: async ({ data }) => { state.notifications.push(...data); return { count: data.length }; } },
  };
  const db = {
    $transaction: async (work) => work(tx),
    user: { findUnique: async () => ({ id: "admin-1", role }) },
  };
  const dependencies = {
    db,
    auth: async () => ({ userId: "clerk-admin" }),
    clerkClient: async () => ({ users: { getUser: async () => ({}) } }),
    revalidatePath: () => {},
    ...await import("../lib/payment-payouts.mjs"),
  };
  const transformed = (await sourcePromise)
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { clerkClient } from "@clerk/nextjs/server";', "const { clerkClient } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } from "@/lib/payment-payouts.mjs";', "const { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { resolvePaymentPayoutOutcomeAction };");
  return { action: new Function("dependencies", transformed)(dependencies).resolvePaymentPayoutOutcomeAction, state };
}

const form = (values) => new Map(Object.entries(values));

async function makePayoutRequest({ userId = "clerk-doctor", role = "DOCTOR", verificationStatus = "VERIFIED" } = {}) {
  const state = { payouts: [], allocations: [] };
  const doctor = { id: "doctor-1", clerkUserId: "clerk-doctor", role, verificationStatus };
  const eligiblePayment = {
    id: "payment-1", status: "PAID", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED", currency: "INR",
    amountPaise: 12500, method: "ONLINE", appointment: { doctorId: "doctor-1", status: "COMPLETED" }, cashCollection: null,
  };
  const findPayout = ({ where }) => state.payouts.find((payout) => where.requestKey ? payout.requestKey === where.requestKey : payout.id === where.id) || null;
  const tx = {
    user: { findUnique: async () => doctor.role === "DOCTOR" && doctor.verificationStatus === "VERIFIED" ? { id: doctor.id } : null },
    appointmentPayment: { findMany: async () => [structuredClone(eligiblePayment)] },
    payout: {
      findUnique: async ({ where }) => structuredClone(findPayout({ where })),
      create: async ({ data }) => {
        const payout = { id: "payout-1", createdAt: new Date(), updatedAt: new Date(), processedAt: null, processedBy: null, transferReference: null, reviewRequiredAt: null, reviewReason: null, ...structuredClone(data) };
        state.payouts.push(payout);
        return structuredClone(payout);
      },
    },
    payoutPaymentAllocation: { createMany: async ({ data }) => { state.allocations.push(...structuredClone(data)); } },
  };
  const db = {
    $transaction: async (work) => work(tx),
    user: { findUnique: async () => doctor.role === "DOCTOR" && doctor.verificationStatus === "VERIFIED" ? { id: doctor.id } : null },
    payout: { findUnique: async ({ where }) => structuredClone(findPayout({ where })) },
  };
  const dependencies = {
    db,
    auth: async () => ({ userId }),
    revalidatePath: () => {},
    measureServerTiming: async (_label, operation) => operation(),
    ...await import("../lib/payment-payouts.mjs"),
    ...await import("../lib/appointment-payment-reconciliation.mjs"),
  };
  const transformed = (await payoutSourcePromise)
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { eligiblePaymentWhere, releasePaymentPayoutAllocations, reservePaymentCollections, sumAllocationPaise } from "@/lib/payment-payouts.mjs";', "const { eligiblePaymentWhere, releasePaymentPayoutAllocations, reservePaymentCollections, sumAllocationPaise } = dependencies;")
    .replace('import { withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";', "const { withSerializableRetries } = dependencies;")
    .replace('import { measureServerTiming } from "@/lib/server-timing.mjs";', "const { measureServerTiming } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { requestPaymentPayout };");
  return { request: new Function("dependencies", transformed)(dependencies).requestPaymentPayout, state };
}

test("payment payout request is idempotent and allocates only verified INR collections", async () => {
  const harness = await makePayoutRequest();
  const request = form({ requestKey: "request_key_0000001" });
  const first = await harness.request(request);
  const retry = await harness.request(request);
  assert.equal(first.success, true);
  assert.equal(first.alreadyRequested, false);
  assert.equal(first.payout.amountPaise, "12500");
  assert.equal(retry.alreadyRequested, true);
  assert.equal(harness.state.payouts.length, 1);
  assert.equal(harness.state.allocations.length, 1);
  assert.equal(harness.state.allocations[0].appointmentPaymentId, "payment-1");
});

test("payment payout request requires authenticated verified doctor and valid retry key", async () => {
  await assert.rejects((await makePayoutRequest({ userId: null })).request(form({ requestKey: "request_key_0000001" })), /Unauthorized/);
  await assert.rejects((await makePayoutRequest({ role: "PATIENT" })).request(form({ requestKey: "request_key_0000001" })), /Doctor not found or not verified/);
  await assert.rejects((await makePayoutRequest({ verificationStatus: "PENDING" })).request(form({ requestKey: "request_key_0000001" })), /Doctor not found or not verified/);
  await assert.rejects((await makePayoutRequest()).request(form({ requestKey: "bad" })), /valid payout request key/);
});

test("persisted admin can confirm no transfer and release flagged reservations exactly once", async () => {
  const harness = await makeAdminAction();
  const request = form({ payoutId: "payout-1", resolution: "NOT_SENT", transferNotSentConfirmed: "true" });
  assert.deepEqual(await harness.action(request), { success: true, alreadyResolved: false });
  assert.equal(harness.state.payout.status, "FAILED");
  assert.equal(harness.state.allocation.status, "RELEASED");
  assert.equal(harness.state.allocation.activePaymentId, null);
  assert.deepEqual(await harness.action(request), { success: true, alreadyResolved: true });
});

test("persisted admin records already-sent transfer without clearing refund review", async () => {
  const harness = await makeAdminAction();
  const request = form({ payoutId: "payout-1", resolution: "TRANSFER_SENT", transferConfirmed: "true", transferReference: "bank-ref-123" });
  assert.deepEqual(await harness.action(request), { success: true, alreadyResolved: false });
  assert.equal(harness.state.payout.status, "PROCESSED");
  assert.equal(harness.state.payout.transferReference, "bank-ref-123");
  assert.ok(harness.state.payout.reviewRequiredAt);
  assert.equal(harness.state.allocation.status, "PAID");
  assert.equal(harness.state.allocation.activePaymentId, "payment-1");
  assert.deepEqual(await harness.action(request), { success: true, alreadyResolved: true });
  await assert.rejects(harness.action(form({ payoutId: "payout-1", resolution: "TRANSFER_SENT", transferConfirmed: "true", transferReference: "bank-ref-456" })), /no longer pending/);
});

test("unknown transfer outcome cannot release flagged allocations and non-admin is denied", async () => {
  const unknown = await makeAdminAction();
  await assert.rejects(unknown.action(form({ payoutId: "payout-1", resolution: "NOT_SENT" })), /Confirm that no transfer occurred/);
  assert.equal(unknown.state.payout.status, "PROCESSING");
  assert.equal(unknown.state.allocation.status, "RESERVED");
  const unauthorized = await makeAdminAction({ role: "PATIENT" });
  await assert.rejects(unauthorized.action(form({ payoutId: "payout-1", resolution: "NOT_SENT", transferNotSentConfirmed: "true" })), /Unauthorized/);
  assert.equal(unauthorized.state.allocation.status, "RESERVED");
});
