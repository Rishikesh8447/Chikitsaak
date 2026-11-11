const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const doctorNameSourcePromise = readFile(join(cwd(), "lib", "doctor-name.js"), "utf8");
const adminSourcePromise = readFile(join(cwd(), "actions", "admin.js"), "utf8");

async function loadDoctorNameModule(clerkUsersApi) {
  const source = await doctorNameSourcePromise;
  const transformed = source
    .replace('import { clerkClient } from "@clerk/nextjs/server";', "const { clerkClient } = dependencies;")
    .replaceAll("export function", "function")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { resolveDoctorPublicNames, isInvalidDoctorName };");

  return new Function("dependencies", transformed)({
    clerkClient: async () => ({ users: clerkUsersApi }),
  });
}

async function loadAdminActions({ pendingDoctors = [], pendingPayouts = [], paymentPayoutIssues = [], clerkUsersApi }) {
  const source = await adminSourcePromise;
  const db = {
    user: {
      findUnique: async () => ({ id: "admin-1", role: "ADMIN" }),
      findMany: async () => pendingDoctors,
    },
    payout: {
      findMany: async (query) =>
        query?.where?.status === "PROCESSING" ? pendingPayouts : paymentPayoutIssues,
    },
  };

  const dependencies = {
    cache: (fn) => fn,
    db,
    auth: async () => ({ userId: "clerk-admin" }),
    clerkClient: async () => ({ users: clerkUsersApi }),
    revalidatePath: () => {},
    ...(await import("../lib/payment-payouts.mjs")),
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { cache } from "react";', "const { cache } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { clerkClient } from "@clerk/nextjs/server";', "const { clerkClient } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace(
      'import { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } from "@/lib/payment-payouts.mjs";',
      "const { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } = dependencies;"
    )
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getPendingDoctors, getPendingPayouts };");

  return new Function("dependencies", transformed)(dependencies);
}

test("resolveDoctorPublicNames batches unique Clerk IDs via getUserList and preserves valid doctor names", async () => {
  const getUserListCalls = [];
  let getUserCalls = 0;

  const { resolveDoctorPublicNames } = await loadDoctorNameModule({
    getUserList: async (params) => {
      getUserListCalls.push(params);
      return {
        data: [
          { id: "clerk-2", firstName: "Asha", lastName: "Verma" },
          { id: "clerk-3", firstName: null, lastName: null, username: "dr_kapoor" },
        ],
      };
    },
    getUser: async () => {
      getUserCalls += 1;
      throw new Error("getUser should not be called when getUserList is available");
    },
  });

  const doctors = [
    { id: "d1", clerkUserId: "clerk-1", name: "Dr. Existing Valid" },
    { id: "d2", clerkUserId: "clerk-2", name: "null null" },
    { id: "d3", clerkUserId: "clerk-2", name: "" },
    { id: "d4", clerkUserId: "clerk-3", name: "undefined" },
    { id: "d5", clerkUserId: "clerk-4", name: "null" },
  ];

  const resolved = await resolveDoctorPublicNames(doctors);

  assert.equal(getUserCalls, 0);
  assert.equal(getUserListCalls.length, 1);
  assert.deepEqual(getUserListCalls[0].userId, ["clerk-2", "clerk-3", "clerk-4"]);
  assert.equal(getUserListCalls[0].limit, 3);

  assert.deepEqual(
    resolved.map((d) => d.name),
    ["Dr. Existing Valid", "Asha Verma", "Asha Verma", "dr_kapoor", "Doctor"]
  );
  for (const doctor of resolved) {
    assert.equal("clerkUserId" in doctor, false);
  }
});

test("resolveDoctorPublicNames deduplicates fallback getUser calls and skips Clerk when all names are valid", async () => {
  const getUserCalls = [];
  const { resolveDoctorPublicNames } = await loadDoctorNameModule({
    getUser: async (id) => {
      getUserCalls.push(id);
      return { id, firstName: "Neha", lastName: "Rao" };
    },
  });

  const allValid = await resolveDoctorPublicNames([
    { id: "d1", clerkUserId: "clerk-1", name: "Dr. Valid" },
  ]);
  assert.equal(getUserCalls.length, 0);
  assert.equal(allValid[0].name, "Dr. Valid");

  const withDuplicates = await resolveDoctorPublicNames([
    { id: "d2", clerkUserId: "clerk-2", name: "null null" },
    { id: "d3", clerkUserId: "clerk-2", name: "" },
  ]);
  assert.deepEqual(getUserCalls, ["clerk-2"]);
  assert.deepEqual(
    withDuplicates.map((d) => d.name),
    ["Neha Rao", "Neha Rao"]
  );
});

test("admin actions batch Clerk lookups via getUserList and deduplicate payout doctor IDs", async () => {
  const getUserListCalls = [];
  let getUserCalls = 0;

  const actions = await loadAdminActions({
    pendingDoctors: [
      { id: "doc-1", clerkUserId: "clerk-doc-1", name: "null null", email: "a@test.com", createdAt: new Date() },
      { id: "doc-2", clerkUserId: "clerk-doc-2", name: "DB Fallback", email: "b@test.com", createdAt: new Date() },
    ],
    pendingPayouts: [
      { id: "p-1", amountPaise: 1000n, platformFeePaise: 0n, netAmountPaise: 1000n, doctor: { id: "doc-1", clerkUserId: "clerk-doc-1", name: "null null" } },
      { id: "p-2", amountPaise: 2000n, platformFeePaise: 0n, netAmountPaise: 2000n, doctor: { id: "doc-1", clerkUserId: "clerk-doc-1", name: "null null" } },
    ],
    paymentPayoutIssues: [
      { id: "p-3", netAmountPaise: 1500n, doctor: { id: "doc-1", clerkUserId: "clerk-doc-1", name: "null null" } },
      { id: "p-4", netAmountPaise: 1500n, doctor: { id: "doc-3", clerkUserId: "clerk-doc-3", name: "Stored Name" } },
    ],
    clerkUsersApi: {
      getUserList: async (params) => {
        getUserListCalls.push(params);
        return {
          data: [
            { id: "clerk-doc-1", firstName: "Priya", lastName: "Sen" },
            { id: "clerk-doc-2", firstName: "null", lastName: "undefined" },
          ],
        };
      },
      getUser: async () => {
        getUserCalls += 1;
        return {};
      },
    },
  });

  const pending = await actions.getPendingDoctors();
  assert.equal(getUserCalls, 0);
  assert.equal(getUserListCalls.length, 1);
  assert.deepEqual(getUserListCalls[0].userId, ["clerk-doc-1", "clerk-doc-2"]);
  assert.deepEqual(
    pending.doctors.map((d) => d.name),
    ["Priya Sen", "DB Fallback"]
  );

  const payouts = await actions.getPendingPayouts();
  assert.equal(getUserCalls, 0);
  assert.equal(getUserListCalls.length, 2);
  assert.deepEqual(getUserListCalls[1].userId, ["clerk-doc-1", "clerk-doc-3"]);
  assert.equal(payouts.payouts[0].doctor.name, "Priya Sen");
  assert.equal(payouts.payouts[1].doctor.name, "Priya Sen");
  assert.equal(payouts.paymentPayoutIssues[0].doctor.name, "Priya Sen");
  assert.equal(payouts.paymentPayoutIssues[1].doctor.name, "Stored Name");
});

