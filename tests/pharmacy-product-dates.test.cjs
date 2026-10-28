const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const {
  canManagePharmacy,
  canTransitionPharmacy,
  normalizeLicenseKey,
  parseDateOnly,
  formatDateOnly,
  validateProductDates,
  isProductExpired,
  isProductExpiringSoon,
} = require("../lib/pharmacy-workflow.mjs");

test("parseDateOnly creates UTC midnight dates avoiding local timezone date shifts", () => {
  const d = parseDateOnly("2026-11-15");
  assert.ok(d instanceof Date);
  assert.equal(d.toISOString(), "2026-11-15T00:00:00.000Z");
  assert.equal(formatDateOnly(d), "2026-11-15");

  // Invalid date format or non-existent calendar dates
  assert.equal(parseDateOnly("invalid"), null);
  assert.equal(parseDateOnly("2026-02-30"), null);
  assert.equal(parseDateOnly(""), null);
  assert.equal(parseDateOnly(null), null);
});

test("validateProductDates enforces that expiry date cannot precede manufacturing date", () => {
  const valid = validateProductDates({
    manufactureDate: "2026-01-01",
    expiryDate: "2027-01-01",
  });
  assert.equal(valid.valid, true);
  assert.ok(valid.manufactureDate instanceof Date);
  assert.ok(valid.expiryDate instanceof Date);

  // Equal dates (same day manufacture and expiry) is valid
  const sameDay = validateProductDates({
    manufactureDate: "2026-05-10",
    expiryDate: "2026-05-10",
  });
  assert.equal(sameDay.valid, true);

  // Expiry preceding manufacturing date must be rejected
  const invalid = validateProductDates({
    manufactureDate: "2026-06-01",
    expiryDate: "2026-05-01",
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.error, /Expiry date cannot be before manufacturing date/);
});

test("isProductExpired and isProductExpiringSoon accurately determine product status", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");

  // Past expiry
  const pastDate = parseDateOnly("2026-10-01");
  assert.equal(isProductExpired(pastDate, now), true);
  assert.equal(isProductExpiringSoon(pastDate, 30, now), false);

  // Expiring within 30 days
  const soonDate = parseDateOnly("2026-11-10");
  assert.equal(isProductExpired(soonDate, now), false);
  assert.equal(isProductExpiringSoon(soonDate, 30, now), true);

  // Expiring far in the future (e.g. 1 year)
  const futureDate = parseDateOnly("2027-10-28");
  assert.equal(isProductExpired(futureDate, now), false);
  assert.equal(isProductExpiringSoon(futureDate, 30, now), false);

  // Null / missing expiry date is not expired
  assert.equal(isProductExpired(null, now), false);
  assert.equal(isProductExpiringSoon(null, 30, now), false);
});

const sourcePromise = readFile(join(__dirname, "..", "actions", "pharmacy.js"), "utf8");

function form(fields) {
  return { get: (key) => fields[key] ?? null };
}

async function loadActions({ role = "PATIENT", userId = "user-a", membership = null, updateCount = 1, productRecord = null } = {}) {
  const source = await sourcePromise;
  const state = { productWrites: [], audits: [] };
  const tx = {
    pharmacyMembership: {
      findFirst: async () => membership,
      findMany: async () => [],
      findUnique: async () => null,
      create: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    pharmacyProduct: {
      create: async (query) => { state.productWrites.push({ type: "create", ...query }); return { id: "product-new" }; },
      updateMany: async (query) => { state.productWrites.push({ type: "update", ...query }); return { count: updateCount }; },
      findFirst: async () => productRecord,
      findMany: async () => [],
    },
    pharmacyAuditEvent: {
      create: async (query) => { state.audits.push(query); return query; },
    },
    $queryRawUnsafe: async () => [{ exists: 1 }],
  };
  const dependencies = {
    auth: async () => ({ userId }),
    revalidatePath() {},
    db: {
      user: { findUnique: async () => ({ id: userId, clerkUserId: userId, role }) },
      $transaction: async (callback) => callback(tx),
      ...tx,
    },
    verifyAdmin: async () => role === "ADMIN",
    canManagePharmacy,
    canTransitionPharmacy,
    normalizeLicenseKey,
    validateProductDates,
    isProductExpired,
    parseDateOnly,
    formatDateOnly,
  };
  const transformed = source
    .replace('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { verifyAdmin } from "@/actions/admin";', "const { verifyAdmin } = dependencies;")
    .replace(/import \{[\s\S]*?\} from ["']@\/lib\/pharmacy-workflow\.mjs["'];/, "const { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey, validateProductDates, isProductExpired, parseDateOnly, formatDateOnly } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { savePharmacyProduct, setPharmacyProductAvailability };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

const verifiedMembership = {
  id: "membership-a", userId: "user-a", pharmacyId: "pharmacy-a", role: "MANAGER", status: "ACTIVE",
  pharmacy: { id: "pharmacy-a", status: "VERIFIED" },
};

test("savePharmacyProduct rejects when expiry date precedes manufacturing date", async () => {
  const { savePharmacyProduct, state } = await loadActions({ membership: verifiedMembership });
  await assert.rejects(
    savePharmacyProduct(form({
      pharmacyId: "pharmacy-a",
      name: "Amoxicillin 500mg",
      price: "150.00",
      manufactureDate: "2026-06-01",
      expiryDate: "2026-01-01",
    })),
    /Expiry date cannot be before manufacturing date/
  );
  assert.equal(state.productWrites.length, 0);
});

test("savePharmacyProduct automatically marks expired product as unavailable", async () => {
  const { savePharmacyProduct, state } = await loadActions({ membership: verifiedMembership });
  await savePharmacyProduct(form({
    pharmacyId: "pharmacy-a",
    name: "Expired Syrups",
    price: "80.00",
    manufactureDate: "2020-01-01",
    expiryDate: "2021-01-01",
  }));
  assert.equal(state.productWrites.length, 1);
  assert.equal(state.productWrites[0].data.isAvailable, false);
});

test("setPharmacyProductAvailability rejects making an expired product available", async () => {
  const expiredProduct = {
    id: "product-exp",
    pharmacyId: "pharmacy-a",
    expiryDate: new Date("2020-01-01T00:00:00.000Z"),
  };
  const { setPharmacyProductAvailability, state } = await loadActions({
    membership: verifiedMembership,
    productRecord: expiredProduct,
  });

  await assert.rejects(
    setPharmacyProductAvailability(form({
      pharmacyId: "pharmacy-a",
      productId: "product-exp",
      available: "true",
    })),
    /Expired products cannot be made available for dispensing/
  );
  assert.equal(state.productWrites.length, 0);
});
