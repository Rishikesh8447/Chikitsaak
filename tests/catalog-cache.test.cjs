const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } = require("../lib/laboratory-workflow.mjs");
const { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey, validateProductDates, isProductExpired, parseDateOnly, formatDateOnly, serializePharmacyProduct } = require("../lib/pharmacy-workflow.mjs");

const labSourcePromise = readFile(join(cwd(), "actions", "laboratory.js"), "utf8");
const pharmacySourcePromise = readFile(join(cwd(), "actions", "pharmacy.js"), "utf8");

function form(fields) {
  return { get: (key) => fields[key] ?? null };
}

function createTagCacheSimulator() {
  const store = new Map();
  const registrations = [];
  const invalidatedTags = [];

  const unstable_cache = (cb, keyParts, options) => {
    const cacheKey = JSON.stringify(keyParts);
    registrations.push({ keyParts, options });
    return async (...args) => {
      const fullKey = `${cacheKey}:${JSON.stringify(args)}`;
      const entry = store.get(fullKey);
      if (entry) return entry.value;
      const value = await cb(...args);
      store.set(fullKey, { value, tags: options?.tags || [] });
      return value;
    };
  };

  const updateTag = (tag) => {
    invalidatedTags.push(tag);
    for (const [key, entry] of store.entries()) {
      if (entry.tags.includes(tag)) {
        store.delete(key);
      }
    }
  };

  return { unstable_cache, updateTag, registrations, invalidatedTags };
}

async function loadLabCatalogHarness({ user = { id: "user-1", clerkUserId: "clerk-1", role: "PATIENT" }, authUserId = "clerk-1" } = {}) {
  const source = await labSourcePromise;
  const cacheSim = createTagCacheSimulator();
  let queryCount = 0;
  let offeringPrice = 250;

  const tx = {
    laboratoryMembership: {
      findFirst: async () => ({ id: "mem-1", role: "OWNER", laboratory: { id: "lab-1", status: "VERIFIED" } }),
      findMany: async () => [],
    },
    labTest: {
      findFirst: async () => ({ id: "test-1" }),
      create: async () => ({ id: "test-2" }),
      updateMany: async () => ({ count: 1 }),
      findMany: async () => {
        queryCount += 1;
        return [{ id: "test-1", name: "CBC", code: "CBC", category: "Blood", description: "Complete blood count" }];
      },
    },
    laboratoryOffering: {
      upsert: async () => { offeringPrice = 300; return { id: "off-1" }; },
      updateMany: async () => ({ count: 1 }),
    },
    laboratory: {
      findUnique: async () => ({ id: "lab-1", name: "Alpha Lab", status: "PENDING" }),
      updateMany: async () => ({ count: 1 }),
      findMany: async () => [
        {
          id: "lab-1",
          name: "Alpha Lab",
          city: "Delhi",
          state: "DL",
          offerings: [
            {
              id: "off-1",
              laboratoryId: "lab-1",
              labTestId: "test-1",
              price: { toFixed: (d) => offeringPrice.toFixed(d) },
              preparationInstructions: null,
              estimatedHours: 12,
              labTest: { name: "CBC", category: "Blood", description: "Complete blood count" },
            },
          ],
        },
      ],
    },
    laboratoryAuditEvent: { create: async () => ({}) },
    notification: { createMany: async () => ({ count: 0 }) },
  };

  const dependencies = {
    auth: async () => ({ userId: authUserId }),
    revalidatePath() {},
    unstable_cache: cacheSim.unstable_cache,
    updateTag: cacheSim.updateTag,
    db: {
      user: { findUnique: async () => user },
      $transaction: async (cb) => cb(tx),
      ...tx,
    },
    verifyAdmin: async () => user,
    canTransitionLabOrder,
    canTransitionLaboratory,
    getEligibleLaboratories,
    normalizeCatalogKey,
    normalizeIdList,
    parseMoney,
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath, unstable_cache, updateTag } from "next/cache";', "const { revalidatePath, unstable_cache, updateTag } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { verifyAdmin } from "@/actions/admin";', "const { verifyAdmin } = dependencies;")
    .replace('import { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } from "@/lib/laboratory-workflow.mjs";', "const { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getAvailableLaboratoryTests, saveLaboratoryOffering, setLaboratoryOfferingAvailability, updateLaboratoryStatus, createLabTest, setLabTestActive };");

  return {
    ...new Function("dependencies", transformed)(dependencies),
    cacheSim,
    getQueryCount: () => queryCount,
  };
}

async function loadPharmacyCatalogHarness() {
  const source = await pharmacySourcePromise;
  const cacheSim = createTagCacheSimulator();
  let queryCount = 0;
  let priceValue = "120.00";

  const tx = {
    pharmacyMembership: {
      findFirst: async () => ({
        id: "pm-1",
        userId: "user-1",
        pharmacyId: "ph-1",
        status: "ACTIVE",
        role: "OWNER",
        pharmacy: { id: "ph-1", status: "VERIFIED" },
      }),
    },
    pharmacyProduct: {
      findFirst: async () => null,
      create: async () => { priceValue = "150.00"; return { id: "prod-2" }; },
      updateMany: async () => ({ count: 1 }),
      deleteMany: async () => ({ count: 1 }),
      findMany: async () => {
        queryCount += 1;
        return [
          {
            id: "prod-1",
            name: "Paracetamol",
            description: "500mg",
            price: priceValue,
            isAvailable: true,
            pharmacy: { id: "ph-1", name: "Care Pharmacy", address: "1 Main", city: "Delhi", state: "DL", contactPhone: "999", contactEmail: "ph@test.com" },
          },
        ];
      },
    },
    pharmacy: {
      findUnique: async () => ({ id: "ph-1", status: "PENDING" }),
      updateMany: async () => ({ count: 1 }),
    },
    pharmacyAuditEvent: { create: async () => ({}) },
    $queryRawUnsafe: async () => [{ exists: 1 }],
  };

  const dependencies = {
    auth: async () => ({ userId: "clerk-1" }),
    revalidatePath() {},
    unstable_cache: cacheSim.unstable_cache,
    updateTag: cacheSim.updateTag,
    db: {
      user: { findUnique: async () => ({ id: "user-1", clerkUserId: "clerk-1", role: "ADMIN" }) },
      $transaction: async (cb) => cb(tx),
      ...tx,
    },
    verifyAdmin: async () => true,
    canManagePharmacy,
    canTransitionPharmacy,
    normalizeLicenseKey,
    validateProductDates,
    isProductExpired,
    parseDateOnly,
    formatDateOnly,
    serializePharmacyProduct,
  };

  const transformed = source
    .replace('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath, unstable_cache, updateTag } from "next/cache";', "const { revalidatePath, unstable_cache, updateTag } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { verifyAdmin } from "@/actions/admin";', "const { verifyAdmin } = dependencies;")
    .replace(/import \{[\s\S]*?\} from ["']@\/lib\/pharmacy-workflow\.mjs["'];/, "const { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey, validateProductDates, isProductExpired, parseDateOnly, formatDateOnly } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getAvailablePharmacyProducts, savePharmacyProduct, deletePharmacyProduct, setPharmacyProductAvailability, updatePharmacyStatus };");

  return {
    ...new Function("dependencies", transformed)(dependencies),
    cacheSim,
    getQueryCount: () => queryCount,
  };
}

test("getAvailableLaboratoryTests caches catalogue with 60s TTL, enforces auth outside cache, and invalidates on all lab mutations", async () => {
  const unauthHarness = await loadLabCatalogHarness({ user: null, authUserId: null });
  await assert.rejects(unauthHarness.getAvailableLaboratoryTests(), /Unauthorized/);
  assert.equal(unauthHarness.getQueryCount(), 0);

  const harness = await loadLabCatalogHarness({ user: { id: "admin-1", clerkUserId: "clerk-1", role: "ADMIN" } });
  assert.deepEqual(harness.cacheSim.registrations[0], {
    keyParts: ["available-laboratory-tests"],
    options: { revalidate: 60, tags: ["laboratory-catalog"] },
  });

  const first = await harness.getAvailableLaboratoryTests();
  const second = await harness.getAvailableLaboratoryTests();
  assert.equal(harness.getQueryCount(), 1);
  assert.equal(first.laboratories[0].offerings[0].price, "250.00");
  assert.equal(second.laboratories[0].offerings[0].price, "250.00");

  await harness.saveLaboratoryOffering(form({ laboratoryId: "lab-1", labTestId: "test-1", price: "300.00" }));
  const afterUpdate = await harness.getAvailableLaboratoryTests();
  assert.equal(harness.getQueryCount(), 2);
  assert.equal(afterUpdate.laboratories[0].offerings[0].price, "300.00");

  await harness.setLaboratoryOfferingAvailability(form({ laboratoryId: "lab-1", offeringId: "off-1", available: "false" }));
  await harness.updateLaboratoryStatus(form({ laboratoryId: "lab-1", status: "VERIFIED" }));
  await harness.createLabTest(form({ name: "Lipid Profile" }));
  await harness.setLabTestActive(form({ labTestId: "test-1", isActive: "false" }));

  assert.equal(harness.cacheSim.invalidatedTags.filter((t) => t === "laboratory-catalog").length, 5);
});

test("getAvailablePharmacyProducts caches catalogue with 60s TTL and invalidates on all pharmacy catalog mutations", async () => {
  const harness = await loadPharmacyCatalogHarness();
  assert.deepEqual(harness.cacheSim.registrations[0], {
    keyParts: ["available-pharmacy-products"],
    options: { revalidate: 60, tags: ["pharmacy-catalog"] },
  });

  const first = await harness.getAvailablePharmacyProducts();
  const second = await harness.getAvailablePharmacyProducts();
  assert.equal(harness.getQueryCount(), 1);
  assert.equal(first.products[0].price, "120.00");
  assert.equal(second.products[0].price, "120.00");

  await harness.savePharmacyProduct(form({ pharmacyId: "ph-1", name: "Paracetamol", price: "150.00", isAvailable: "true" }));
  const afterSave = await harness.getAvailablePharmacyProducts();
  assert.equal(harness.getQueryCount(), 2);
  assert.equal(afterSave.products[0].price, "150.00");

  await harness.deletePharmacyProduct(form({ pharmacyId: "ph-1", productId: "prod-1" }));
  await harness.setPharmacyProductAvailability(form({ pharmacyId: "ph-1", productId: "prod-1", available: "true" }));
  await harness.updatePharmacyStatus(form({ pharmacyId: "ph-1", status: "VERIFIED" }));

  assert.equal(harness.cacheSim.invalidatedTags.filter((t) => t === "pharmacy-catalog").length, 4);
});
