const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const payoutSource = readFile(join(cwd(), "actions", "payout.js"), "utf8");
const adminSource = readFile(join(cwd(), "actions", "admin.js"), "utf8");

function serialTransactions(getState, setState, makeTx) {
  let previous = Promise.resolve();
  return (work) => {
    const run = previous.then(async () => {
      const draft = structuredClone(getState());
      const result = await work(makeTx(draft));
      setState(draft);
      return result;
    });
    previous = run.catch(() => {});
    return run;
  };
}

function makePayoutDb({ role = "DOCTOR", verificationStatus = "VERIFIED", credits = 6, completedAppointments = 1, payouts = [], userId = "clerk-doctor" } = {}) {
  let state = {
    users: [
      { id: "doctor-1", clerkUserId: "clerk-doctor", role, verificationStatus, credits },
      { id: "doctor-2", clerkUserId: "clerk-other", role: "DOCTOR", verificationStatus: "VERIFIED", credits: 4 },
      { id: "patient-1", clerkUserId: "clerk-patient", role: "PATIENT", verificationStatus: null, credits: 5 },
    ],
    completedAppointments,
    payouts: structuredClone(payouts),
    transactions: [],
  };
  let nextPayout = 1;
  const selectPayouts = (draft, where = {}) => draft.payouts.filter((payout) =>
    (!where.doctorId || payout.doctorId === where.doctorId) &&
    (!where.status?.in || where.status.in.includes(payout.status)) &&
    (!where.status || Array.isArray(where.status.in) || payout.status === where.status)
  );
  const makeTx = (draft) => ({
    user: {
      findUnique: async ({ where }) => structuredClone(draft.users.find((item) =>
        where.clerkUserId ? item.clerkUserId === where.clerkUserId && (!where.role || item.role === where.role) && (!where.verificationStatus || item.verificationStatus === where.verificationStatus)
          : item.id === where.id
      ) || null),
      updateMany: async ({ where, data }) => {
        const user = draft.users.find((item) => item.id === where.id && item.credits === where.credits);
        if (!user) return { count: 0 };
        user.credits -= data.credits.decrement;
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        const user = draft.users.find((item) => item.id === where.id);
        user.credits += data.credits.increment;
        return structuredClone(user);
      },
    },
    appointment: {
      count: async ({ where }) => where.status === "COMPLETED" ? draft.completedAppointments : 0,
    },
    payout: {
      findFirst: async ({ where }) => structuredClone(selectPayouts(draft, where)[0] || null),
      findMany: async ({ where }) => structuredClone(selectPayouts(draft, where)),
      create: async ({ data }) => {
        const payout = { id: `payout-${nextPayout++}`, ...structuredClone(data) };
        draft.payouts.push(payout);
        return structuredClone(payout);
      },
    },
    creditTransaction: {
      create: async ({ data }) => {
        draft.transactions.push(structuredClone(data));
        return data;
      },
    },
  });
  const db = {
    $transaction: serialTransactions(() => state, (next) => { state = next; }, makeTx),
    user: {
      findFirst: async ({ where }) => structuredClone(state.users.find((item) => item.clerkUserId === where.clerkUserId && item.role === where.role && item.verificationStatus === where.verificationStatus) || null),
    },
    payout: {
      findMany: async ({ where }) => structuredClone(selectPayouts(state, where)),
    },
    appointment: {
      count: async ({ where }) => where.status === "COMPLETED" ? state.completedAppointments : 0,
    },
  };
  return { db, get state() { return structuredClone(state); }, set userId(value) { userId = value; }, get userId() { return userId; } };
}

async function loadPayoutActions(options) {
  const context = makePayoutDb(options);
  const dependencies = {
    db: context.db,
    auth: async () => ({ userId: context.userId }),
    revalidatePath: () => {},
    getPayoutEligibleCredits: (await import("../lib/payout-eligibility.mjs")).getPayoutEligibleCredits,
  };
  const source = (await payoutSource)
    .replace('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { getPayoutEligibleCredits } from "@/lib/payout-eligibility.mjs";', "const { getPayoutEligibleCredits } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { requestPayout, getDoctorPayouts, getDoctorEarnings };");
  const actions = new Function("dependencies", source)(dependencies);
  return {
    ...actions,
    db: context.db,
    get state() { return context.state; },
    get userId() { return context.userId; },
    set userId(value) { context.userId = value; },
  };
}

function formData(values) {
  return new Map(Object.entries(values));
}

test("payout reserves only completed, unpaid consultation credits and records matching amounts", async () => {
  const actions = await loadPayoutActions({ credits: 6, completedAppointments: 1 });
  const result = await actions.requestPayout(formData({ paypalEmail: "  doctor@example.com  ", credits: "99" }));

  assert.equal(result.success, true);
  assert.equal(result.payout.credits, 2);
  assert.equal(result.payout.amount, 20);
  assert.equal(result.payout.platformFee, 4);
  assert.equal(result.payout.netAmount, 16);
  assert.equal(result.payout.paypalEmail, "doctor@example.com");
  assert.equal(actions.state.users.find((user) => user.id === "doctor-1").credits, 4);
  assert.deepEqual(actions.state.transactions, [{ userId: "doctor-1", amount: -2, type: "ADMIN_ADJUSTMENT", allocationKey: "payout:payout-1:credit-reservation" }]);
});

test("starter credits without completed appointments cannot be paid out", async () => {
  const actions = await loadPayoutActions({ credits: 2, completedAppointments: 0 });
  await assert.rejects(actions.requestPayout(formData({ paypalEmail: "doctor@example.com", credits: "-9" })), /No credits available for payout/);
  assert.equal(actions.state.payouts.length, 0);
  assert.equal(actions.state.users.find((user) => user.id === "doctor-1").credits, 2);
  assert.equal(actions.state.transactions.length, 0);
});

test("previous processing and paid payouts reduce the remaining payout-eligible earnings", async () => {
  const actions = await loadPayoutActions({
    credits: 8,
    completedAppointments: 2,
    payouts: [
      { id: "paid", doctorId: "doctor-1", credits: 2, status: "PROCESSED" },
    ],
  });
  const result = await actions.requestPayout(formData({ paypalEmail: "doctor@example.com" }));
  assert.equal(result.payout.credits, 2);
  assert.equal(actions.state.users.find((user) => user.id === "doctor-1").credits, 6);
});

test("payout request rejects malformed destination email", async () => {
  const actions = await loadPayoutActions({ credits: 2, completedAppointments: 1 });
  await assert.rejects(actions.requestPayout(formData({ paypalEmail: "not-an-email" })), /PayPal email is invalid/);
});

test("only an authenticated verified doctor can request payout", async () => {
  for (const options of [
    { role: "PATIENT", verificationStatus: null, userId: "clerk-patient" },
    { role: "DOCTOR", verificationStatus: "PENDING" },
  ]) {
    const actions = await loadPayoutActions({ credits: 4, completedAppointments: 1, ...options });
    await assert.rejects(actions.requestPayout(formData({ paypalEmail: "doctor@example.com" })), /Doctor not found or not verified/);
    assert.equal(actions.state.payouts.length, 0);
  }
  const unauthenticated = await loadPayoutActions({ credits: 4, completedAppointments: 1 });
  unauthenticated.userId = null;
  await assert.rejects(unauthenticated.requestPayout(formData({ paypalEmail: "doctor@example.com" })), /Unauthorized/);
});

test("concurrent payout requests cannot reserve the same completed credits twice", async () => {
  const actions = await loadPayoutActions({ credits: 4, completedAppointments: 1 });
  const results = await Promise.allSettled([
    actions.requestPayout(formData({ paypalEmail: "doctor@example.com" })),
    actions.requestPayout(formData({ paypalEmail: "doctor@example.com" })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(actions.state.payouts.length, 1);
  assert.equal(actions.state.transactions.filter((item) => item.allocationKey.endsWith(":credit-reservation")).length, 1);
  assert.equal(actions.state.users.find((user) => user.id === "doctor-1").credits, 2);
});

test("doctor payout history is scoped to the authenticated doctor's persisted identity", async () => {
  const actions = await loadPayoutActions({
    payouts: [
      { id: "own", doctorId: "doctor-1", status: "PROCESSED", credits: 2 },
      { id: "other", doctorId: "doctor-2", status: "PROCESSED", credits: 4 },
    ],
  });
  const result = await actions.getDoctorPayouts();
  assert.deepEqual(result.payouts.map((payout) => payout.id), ["own"]);
  assert.equal(actions.state.payouts.length, 2);
});

function makeAdminHarness({ role = "ADMIN", reservation = true, reservationAmount = -4, payoutDoctorRole = "DOCTOR", payoutDoctorId = "doctor-1", payoutOverrides = {} } = {}) {
  let state = {
    users: [
      { id: "admin-1", clerkUserId: "clerk-admin", role: "ADMIN", credits: 0 },
      { id: "doctor-1", clerkUserId: "clerk-doctor", role: "DOCTOR", credits: 0 },
      { id: "patient-1", clerkUserId: "clerk-patient", role: "PATIENT", credits: 3 },
      { id: "unassigned-1", clerkUserId: "clerk-unassigned", role: "UNASSIGNED", credits: 2 },
    ],
    payouts: [{ id: "payout-1", doctorId: payoutDoctorId, credits: 4, amount: 40, platformFee: 8, netAmount: 32, paypalEmail: "doctor@example.com", status: "PROCESSING", ...payoutOverrides }],
    transactions: reservation ? [{ userId: payoutDoctorId, amount: reservationAmount, type: "ADMIN_ADJUSTMENT", allocationKey: "payout:payout-1:credit-reservation" }] : [],
    notifications: [],
  };
  let userId = ({ ADMIN: "clerk-admin", DOCTOR: "clerk-doctor", PATIENT: "clerk-patient", UNASSIGNED: "clerk-unassigned" })[role];
  const makeTx = (draft) => ({
    user: {
      findUnique: async ({ where }) => structuredClone(draft.users.find((item) => item.clerkUserId === where.clerkUserId) || null),
      updateMany: async ({ where, data }) => {
        const user = draft.users.find((item) => item.id === where.id && item.credits >= where.credits.gte);
        if (!user) return { count: 0 };
        user.credits -= data.credits.decrement;
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        const user = draft.users.find((item) => item.id === where.id);
        user.credits += data.credits.increment;
        return structuredClone(user);
      },
    },
    payout: {
      findFirst: async ({ where }) => {
        const payout = draft.payouts.find((item) => item.id === where.id && item.status === where.status);
        return payout ? { ...structuredClone(payout), doctor: { id: payout.doctorId, role: payout.doctorId === "admin-1" ? "ADMIN" : payoutDoctorRole } } : null;
      },
      updateMany: async ({ where, data }) => {
        const payout = draft.payouts.find((item) => item.id === where.id && item.status === where.status);
        if (!payout) return { count: 0 };
        Object.assign(payout, data);
        return { count: 1 };
      },
    },
    creditTransaction: {
      findUnique: async ({ where }) => structuredClone(draft.transactions.find((item) => item.allocationKey === where.allocationKey) || null),
      create: async ({ data }) => { draft.transactions.push(structuredClone(data)); return data; },
    },
    notification: {
      createMany: async ({ data, skipDuplicates }) => {
        for (const item of data) if (!skipDuplicates || !draft.notifications.some((current) => current.dedupeKey === item.dedupeKey)) draft.notifications.push(structuredClone(item));
        return { count: data.length };
      },
    },
  });
  const db = {
    $transaction: serialTransactions(() => state, (next) => { state = next; }, makeTx),
    user: { findUnique: async ({ where }) => structuredClone(state.users.find((item) => item.clerkUserId === where.clerkUserId) || null) },
  };
  const dependencies = { db, auth: async () => ({ userId }), clerkClient: async () => ({ users: { getUser: async () => ({}) } }), revalidatePath: () => {} };
  const source = (adminSource.then((text) => text))
  return { db, get state() { return structuredClone(state); }, set userId(value) { userId = value; }, async load() {
    const text = await source;
    const transformed = text
      .replace('"use server";', "")
      .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
      .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
      .replace('import { clerkClient } from "@clerk/nextjs/server";', "const { clerkClient } = dependencies;")
      .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
      .replaceAll("export async function", "async function")
      .concat("\nreturn { verifyAdmin, approvePayout, rejectPayout };");
    return new Function("dependencies", transformed)(dependencies);
  } };
}

test("admin approval consumes a reserved payout once without a second balance debit", async () => {
  const harness = makeAdminHarness();
  const { approvePayout } = await harness.load();
  await approvePayout(formData({ payoutId: "payout-1" }));
  const after = harness.state;
  assert.equal(after.payouts[0].status, "PROCESSED");
  assert.equal(after.payouts[0].processedBy, "admin-1");
  assert.ok(after.payouts[0].processedAt instanceof Date);
  assert.equal(after.users.find((user) => user.id === "doctor-1").credits, 0);
  assert.equal(after.transactions.filter((item) => item.amount === -4).length, 1);
  await assert.rejects(approvePayout(formData({ payoutId: "payout-1" })), /Failed to approve payout/);
  assert.deepEqual(harness.state, after);
});

test("admin rejection releases a reservation exactly once", async () => {
  const harness = makeAdminHarness();
  const { rejectPayout } = await harness.load();
  await rejectPayout(formData({ payoutId: "payout-1" }));
  const after = harness.state;
  assert.equal(after.payouts[0].status, "FAILED");
  assert.equal(after.users.find((user) => user.id === "doctor-1").credits, 4);
  assert.equal(after.transactions.filter((item) => item.allocationKey.endsWith(":reserved-credit-release")).length, 1);
  await assert.rejects(rejectPayout(formData({ payoutId: "payout-1" })), /already processed/);
  assert.deepEqual(harness.state, after);
});

test("non-admin users cannot approve or reject a payout", async () => {
  for (const role of ["PATIENT", "DOCTOR", "UNASSIGNED"]) {
    const harness = makeAdminHarness({ role });
    const { approvePayout, rejectPayout } = await harness.load();
    await assert.rejects(approvePayout(formData({ payoutId: "payout-1" })), /Unauthorized/);
    await assert.rejects(rejectPayout(formData({ payoutId: "payout-1" })), /Unauthorized/);
    assert.equal(harness.state.payouts[0].status, "PROCESSING");
    assert.equal(harness.state.users.find((user) => user.id === "doctor-1").credits, 0);
  }
});

test("admin cannot process a payout attached to a non-doctor or with a mismatched reservation", async () => {
  for (const options of [
    { payoutDoctorRole: "PATIENT" },
    { reservationAmount: -3 },
  ]) {
    const harness = makeAdminHarness(options);
    const { approvePayout, rejectPayout } = await harness.load();
    await assert.rejects(approvePayout(formData({ payoutId: "payout-1" })), /Failed to approve payout/);
    await assert.rejects(rejectPayout(formData({ payoutId: "payout-1" })), /Payout request is invalid|Payout reservation is invalid/);
    assert.equal(harness.state.payouts[0].status, "PROCESSING");
    assert.equal(harness.state.users.find((user) => user.id === "doctor-1").credits, 0);
  }
});

test("admin cannot process a payout that refers to their own account", async () => {
  const harness = makeAdminHarness({ payoutDoctorId: "admin-1", reservation: false });
  const { approvePayout, rejectPayout } = await harness.load();
  await assert.rejects(approvePayout(formData({ payoutId: "payout-1" })), /Failed to approve payout/);
  await assert.rejects(rejectPayout(formData({ payoutId: "payout-1" })), /Payout request is invalid/);
  assert.equal(harness.state.payouts[0].status, "PROCESSING");
});

test("competing admin approval and rejection settle a processing payout only once", async () => {
  const harness = makeAdminHarness();
  const { approvePayout, rejectPayout } = await harness.load();
  const results = await Promise.allSettled([
    approvePayout(formData({ payoutId: "payout-1" })),
    rejectPayout(formData({ payoutId: "payout-1" })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const state = harness.state;
  assert.ok(["PROCESSED", "FAILED"].includes(state.payouts[0].status));
  assert.equal(state.users.find((user) => user.id === "doctor-1").credits, state.payouts[0].status === "FAILED" ? 4 : 0);
  assert.equal(state.transactions.filter((item) => item.allocationKey.endsWith(":reserved-credit-release")).length, state.payouts[0].status === "FAILED" ? 1 : 0);
});
