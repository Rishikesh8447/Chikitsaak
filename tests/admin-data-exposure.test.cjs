const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const adminSource = readFile(join(cwd(), "actions", "admin.js"), "utf8");
const analyticsSource = readFile(join(cwd(), "actions", "analytics.js"), "utf8");

async function loadAdminDataActions({ doctorName = "Dr Example", experience = 5, clerkUser = { firstName: "Dr", lastName: "Example" } } = {}) {
  const queries = [];
  const fullDoctor = {
    id: "doctor-1", clerkUserId: "clerk-doctor", name: doctorName, email: "doctor@example.com",
    createdAt: new Date("2026-01-01T00:00:00Z"), specialty: "Cardiology", experience,
    credentialUrl: "https://example.test/credential", description: "Professional profile",
    verificationStatus: "PENDING", bloodGroup: "O+", allergies: "private", currentMedications: "private",
  };
  const fullPayout = {
    id: "payout-1", amount: 20, status: "PROCESSING", createdAt: new Date("2026-01-02T00:00:00Z"),
    credits: 2, platformFee: 4, netAmount: 16, paypalEmail: "doctor@example.com", processedBy: "private",
    doctor: { ...fullDoctor, credits: 0 },
  };
  const selectFields = (record, select) => Object.fromEntries(Object.entries(select).flatMap(([key, value]) => {
    if (value === true) return [[key, record[key]]];
    if (value?.select) return [[key, selectFields(record[key], value.select)]];
    return [];
  }));
  const db = {
    user: {
      findUnique: async () => ({ id: "admin-1", role: "ADMIN" }),
      findMany: async (query) => {
        queries.push(query);
        return [selectFields(fullDoctor, query.select)];
      },
    },
    payout: {
      findMany: async (query) => {
        queries.push(query);
        return [selectFields(fullPayout, query.select)];
      },
    },
  };
  const dependencies = {
    db,
    auth: async () => ({ userId: "clerk-admin" }),
    clerkClient: async () => ({ users: { getUser: async () => clerkUser } }),
    revalidatePath: () => {},
  };
  const transformed = (await adminSource)
    .replaceAll('"use server";', "")
    .replaceAll("export async function", "async function")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { clerkClient } from "@clerk/nextjs/server";', "const { clerkClient } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .concat("\nreturn { getPendingDoctors, getVerifiedDoctors, getPendingPayouts };");
  return { ...new Function("dependencies", transformed)(dependencies), queries };
}

test("admin doctor responses omit medical records and unnecessary Clerk identifiers", async () => {
  const actions = await loadAdminDataActions();
  const pending = await actions.getPendingDoctors();
  const verified = await actions.getVerifiedDoctors();
  for (const doctor of [...pending.doctors, ...verified.doctors]) {
    assert.equal("bloodGroup" in doctor, false);
    assert.equal("allergies" in doctor, false);
    assert.equal("currentMedications" in doctor, false);
    assert.equal("clerkUserId" in doctor, false);
  }
  assert.equal(actions.queries[0].select.credentialUrl, true);
  assert.equal(actions.queries[1].select.verificationStatus, true);
  assert.equal(actions.queries.some((query) => query.select.bloodGroup), false);
});

test("pending doctor display name ignores null sentinels and preserves available profile data", async () => {
  const clerkName = await loadAdminDataActions({
    doctorName: "null null",
    experience: null,
    clerkUser: { firstName: "John", lastName: "Doe" },
  });
  const hydrated = (await clerkName.getPendingDoctors()).doctors[0];
  assert.equal(hydrated.name, "John Doe");
  assert.equal(hydrated.experience, null);

  const databaseFallback = await loadAdminDataActions({
    doctorName: "Dr Stored Name",
    clerkUser: { firstName: "null", lastName: "undefined" },
  });
  const fallback = (await databaseFallback.getPendingDoctors()).doctors[0];
  assert.equal(fallback.name, "Dr Stored Name");

  const unavailable = await loadAdminDataActions({
    doctorName: "null null",
    experience: null,
    clerkUser: { firstName: "null", lastName: "undefined" },
  });
  const missing = (await unavailable.getPendingDoctors()).doctors[0];
  assert.equal(missing.name, null);
  assert.equal(missing.experience, null);
});

test("pending payout response contains required payment details without medical fields", async () => {
  const actions = await loadAdminDataActions();
  const result = await actions.getPendingPayouts();
  const payout = result.payouts[0];
  assert.equal(payout.paypalEmail, "doctor@example.com");
  assert.equal(payout.doctor.email, "doctor@example.com");
  assert.equal("clerkUserId" in payout.doctor, false);
  assert.equal("allergies" in payout.doctor, false);
  const query = actions.queries.at(-1);
  assert.equal(query.select.paypalEmail, true);
  assert.equal(query.select.doctor.select.email, true);
  assert.equal(query.select.doctor.select.bloodGroup, undefined);
});

async function loadAdminAnalytics({ role = "ADMIN", failQuery = false, failAuth = false } = {}) {
  const queries = [];
  const db = {
    user: {
      findUnique: async () => {
        if (failAuth) throw new Error("sensitive database detail");
        return { id: "user-1", role };
      },
      groupBy: async (query) => {
        queries.push(query);
        if (failQuery) throw new Error("sensitive database detail");
        return query.by[0] === "role"
          ? [{ role: "DOCTOR", _count: { _all: 2 } }, { role: "PATIENT", _count: { _all: 3 } }]
          : [{ verificationStatus: "PENDING", _count: { _all: 1 } }];
      },
      findMany: async () => [],
    },
    appointment: { findMany: async () => [] },
  };
  const dependencies = { auth: async () => ({ userId: "clerk-user" }), db };
  const transformed = (await analyticsSource)
    .replaceAll('"use server";', "")
    .replaceAll("export async function", "async function")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .concat("\nreturn { getAdminAnalytics };");
  return { ...new Function("dependencies", transformed)(dependencies), queries };
}

test("admin analytics checks persisted role and groups verification only for doctors", async () => {
  for (const role of ["DOCTOR", "PATIENT", "UNASSIGNED"]) {
    const denied = await loadAdminAnalytics({ role });
    await assert.rejects(denied.getAdminAnalytics(30), /Only admins can access admin analytics/);
    assert.equal(denied.queries.length, 0);
  }

  const allowed = await loadAdminAnalytics();
  const result = await allowed.getAdminAnalytics(30);
  assert.equal(result.metrics.users, 5);
  assert.deepEqual(allowed.queries.find((query) => query.by[0] === "verificationStatus").where, { role: "DOCTOR" });
});

test("admin analytics masks database errors", async () => {
  const actions = await loadAdminAnalytics({ failQuery: true });
  await assert.rejects(actions.getAdminAnalytics(30), /Failed to fetch admin analytics/);
  const authFailure = await loadAdminAnalytics({ failAuth: true });
  await assert.rejects(authFailure.getAdminAnalytics(30), /Failed to authorize analytics access/);
});
