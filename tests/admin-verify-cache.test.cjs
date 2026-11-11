const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const adminSourcePromise = readFile(join(cwd(), "actions", "admin.js"), "utf8");

function createMockCache() {
  const cacheMap = new Map();
  return function mockCache(fn) {
    return function cachedFn(...args) {
      const key = JSON.stringify(args);
      if (cacheMap.has(key)) {
        return cacheMap.get(key);
      }
      const promise = fn(...args);
      cacheMap.set(key, promise);
      return promise;
    };
  };
}

async function loadVerifyAdmin({ role = "ADMIN", userId = "clerk-admin-1", dbError = null, mockCache = createMockCache() } = {}) {
  const source = await adminSourcePromise;
  let dbLookupCount = 0;

  const db = {
    user: {
      findUnique: async ({ where }) => {
        dbLookupCount += 1;
        if (dbError) throw dbError;
        if (where.clerkUserId === userId) {
          return { id: "user-1", clerkUserId: userId, role };
        }
        return null;
      },
    },
  };

  const dependencies = {
    cache: mockCache,
    db,
    auth: async () => ({ userId }),
    clerkClient: async () => ({}),
    revalidatePath: () => {},
    flagPaymentPayoutsForReview: async () => {},
    releasePaymentPayoutAllocations: async () => {},
    recordPaymentPayoutTransfer: async () => {},
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { cache } from "react";', "const { cache } = dependencies;")
    .replaceAll("export async function", "async function")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { clerkClient } from "@clerk/nextjs/server";', "const { clerkClient } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } from "@/lib/payment-payouts.mjs";', "const { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } = dependencies;")
    .concat("\nreturn { verifyAdmin };");

  const { verifyAdmin } = new Function("dependencies", transformed)(dependencies);

  return {
    verifyAdmin,
    getLookupCount: () => dbLookupCount,
  };
}

test("verifyAdmin() reuses the cached result across multiple calls within the same server request", async () => {
  const { verifyAdmin, getLookupCount } = await loadVerifyAdmin({ role: "ADMIN", userId: "admin-1" });

  const [res1, res2, res3] = await Promise.all([
    verifyAdmin(),
    verifyAdmin(),
    verifyAdmin(),
  ]);

  assert.equal(res1, true);
  assert.equal(res2, true);
  assert.equal(res3, true);
  assert.equal(getLookupCount(), 1, "db.user.findUnique should only be executed once across parallel calls in the same request");
});

test("verifyAdmin() rejects non-admin users (returns false) and reuses cached result", async () => {
  const { verifyAdmin, getLookupCount } = await loadVerifyAdmin({ role: "PATIENT", userId: "patient-1" });

  const res1 = await verifyAdmin();
  const res2 = await verifyAdmin();

  assert.equal(res1, false);
  assert.equal(res2, false);
  assert.equal(getLookupCount(), 1);
});

test("verifyAdmin() returns false when unauthenticated (no userId)", async () => {
  const { verifyAdmin, getLookupCount } = await loadVerifyAdmin({ userId: null });

  const res = await verifyAdmin();

  assert.equal(res, false);
  assert.equal(getLookupCount(), 0, "Should not query database when userId is absent");
});

test("verifyAdmin() returns false gracefully when database throws an error", async () => {
  const { verifyAdmin, getLookupCount } = await loadVerifyAdmin({
    role: "ADMIN",
    userId: "admin-1",
    dbError: new Error("Database connection timed out"),
  });

  const res = await verifyAdmin();

  assert.equal(res, false);
  assert.equal(getLookupCount(), 1);
});

