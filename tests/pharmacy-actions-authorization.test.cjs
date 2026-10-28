const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey, serializePharmacyProduct } = require("../lib/pharmacy-workflow.mjs");

const sourcePromise = readFile(join(__dirname, "..", "actions", "pharmacy.js"), "utf8");

function form(fields) { return { get: (key) => fields[key] ?? null }; }

async function loadActions({ role = "PATIENT", userId = "user-a", membership = null, pharmacyStatus = "PENDING", updateCount = 1, workspaceMemberships = [] } = {}) {
  const source = await sourcePromise;
  const state = { membershipQueries: [], productWrites: [], audits: [], statusWrites: [], auditReads: [], transactions: 0 };
  const tx = {
    pharmacyMembership: {
      findFirst: async (query) => { state.membershipQueries.push(query); return membership; },
      findMany: async () => workspaceMemberships,
      findUnique: async () => null,
      create: async () => ({}), update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    pharmacyProduct: {
      create: async (query) => { state.productWrites.push({ type: "create", ...query }); return { id: "product-new" }; },
      updateMany: async (query) => { state.productWrites.push({ type: "update", ...query }); return { count: updateCount }; },
      findMany: async () => [],
    },
    pharmacyAuditEvent: {
      create: async (query) => { state.audits.push(query); return query; },
      findMany: async (query) => {
        state.auditReads.push(query);
        const event = { action: "PHARMACY_SUSPENDED", createdAt: new Date(0) };
        if (query.select.reason) event.reason = "Review details";
        return [event];
      },
    },
    pharmacy: {
      findUnique: async () => ({ id: "pharmacy-a", status: pharmacyStatus }),
      updateMany: async (query) => { state.statusWrites.push(query); return { count: 1 }; },
    },
  };
  const dependencies = {
    auth: async () => ({ userId }),
    revalidatePath() {},
    db: {
      user: { findUnique: async () => ({ id: userId, clerkUserId: userId, role }) },
      $transaction: async (callback) => { state.transactions += 1; return callback(tx); },
      ...tx,
    },
    verifyAdmin: async () => role === "ADMIN",
    canManagePharmacy,
    canTransitionPharmacy,
    normalizeLicenseKey,
    serializePharmacyProduct,
  };
  const transformed = source
    .replace('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { verifyAdmin } from "@/actions/admin";', "const { verifyAdmin } = dependencies;")
    .replace(/import \{[\s\S]*?\} from ["']@\/lib\/pharmacy-workflow\.mjs["'];/, "const { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey, serializePharmacyProduct } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { savePharmacyProduct, updatePharmacyStatus, getPharmacyWorkspace };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

const verifiedMembership = {
  id: "membership-a", userId: "user-a", pharmacyId: "pharmacy-a", role: "MANAGER", status: "ACTIVE",
  pharmacy: { id: "pharmacy-a", status: "VERIFIED" },
};

test("pending pharmacy membership cannot write catalog products", async () => {
  const { savePharmacyProduct, state } = await loadActions({ membership: { ...verifiedMembership, pharmacy: { status: "PENDING" } } });
  await assert.rejects(savePharmacyProduct(form({ pharmacyId: "pharmacy-a", name: "Item", price: "2.50" })), /verified pharmacy/);
  assert.equal(state.productWrites.length, 0);
  assert.equal(state.audits.length, 0);
});

test("pharmacy membership lookup is scoped to the authenticated user, organization, and management roles", async () => {
  const { savePharmacyProduct, state } = await loadActions({ membership: null });
  await assert.rejects(savePharmacyProduct(form({ pharmacyId: "pharmacy-b", name: "Item", price: "2.50" })), /membership required/);
  assert.deepEqual(state.membershipQueries[0].where, { pharmacyId: "pharmacy-b", userId: "user-a", status: "ACTIVE", role: { in: ["OWNER", "MANAGER"] } });
  assert.equal(state.productWrites.length, 0);
});

test("product updates include pharmacy ownership in the database write predicate", async () => {
  const { savePharmacyProduct, state } = await loadActions({ membership: verifiedMembership, updateCount: 0 });
  await assert.rejects(savePharmacyProduct(form({ pharmacyId: "pharmacy-a", productId: "foreign-product", name: "Item", price: "2.50" })), /does not belong/);
  assert.deepEqual(state.productWrites[0].where, { id: "foreign-product", pharmacyId: "pharmacy-a" });
  assert.equal(state.audits.length, 0);
});

test("only Admin can approve and the decision audit records the acting administrator", async () => {
  const nonAdmin = await loadActions({ role: "PATIENT" });
  await assert.rejects(nonAdmin.updatePharmacyStatus(form({ pharmacyId: "pharmacy-a", status: "VERIFIED" })), /Unauthorized/);
  assert.equal(nonAdmin.state.transactions, 0);

  const admin = await loadActions({ role: "ADMIN", userId: "admin-a" });
  await admin.updatePharmacyStatus(form({ pharmacyId: "pharmacy-a", status: "VERIFIED", reason: "License reviewed" }));
  assert.equal(admin.state.statusWrites.length, 1);
  assert.equal(admin.state.audits[0].data.actorUserId, "admin-a");
  assert.equal(admin.state.audits[0].data.fromStatus, "PENDING");
  assert.equal(admin.state.audits[0].data.toStatus, "VERIFIED");
  assert.equal(admin.state.audits[0].data.reason, "License reviewed");
});

test("Pharmacy Admin review reasons are returned only to the owner", async () => {
  const makeMembership = (role) => ({
    id: `membership-${role.toLowerCase()}`, userId: "user-a", pharmacyId: "pharmacy-a", role, status: "ACTIVE",
    pharmacy: { id: "pharmacy-a", name: "Example Pharmacy", status: "VERIFIED", statusReason: "Review details", city: "City", state: "State", country: "Country" },
  });
  const owner = await loadActions({ workspaceMemberships: [makeMembership("OWNER")] });
  const ownerWorkspace = await owner.getPharmacyWorkspace();
  assert.equal(ownerWorkspace.selected.statusReason, "Review details");
  assert.equal(ownerWorkspace.auditEvents[0].reason, "Review details");
  assert.equal(Object.hasOwn(owner.state.auditReads[0].select, "reason"), true);

  const staff = await loadActions({ workspaceMemberships: [makeMembership("STAFF")] });
  const staffWorkspace = await staff.getPharmacyWorkspace();
  assert.equal(staffWorkspace.selected.statusReason, null);
  assert.equal(staffWorkspace.memberships[0].pharmacy.statusReason, null);
  assert.equal(Object.hasOwn(staffWorkspace.auditEvents[0], "reason"), false);
  assert.equal(Object.hasOwn(staff.state.auditReads[0].select, "reason"), false);
});
