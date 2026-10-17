const { test } = require("node:test");
const assert = require("node:assert/strict");
const { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey } = require("../lib/pharmacy-workflow.mjs");

const verifiedOwner = {
  userId: "user-a", pharmacyId: "pharmacy-a", role: "OWNER", status: "ACTIVE",
  pharmacy: { id: "pharmacy-a", status: "VERIFIED" },
};

test("only an active owner or manager in the verified pharmacy can manage partner operations", () => {
  assert.equal(canManagePharmacy({ userId: "user-a", pharmacyId: "pharmacy-a", membership: verifiedOwner }), true);
  assert.equal(canManagePharmacy({ userId: "user-a", pharmacyId: "pharmacy-a", membership: { ...verifiedOwner, role: "MANAGER" } }), true);
  assert.equal(canManagePharmacy({ userId: "user-a", pharmacyId: "pharmacy-a", membership: { ...verifiedOwner, role: "STAFF" } }), false);
  assert.equal(canManagePharmacy({ userId: "user-a", pharmacyId: "pharmacy-a", membership: { ...verifiedOwner, status: "REVOKED" } }), false);
  assert.equal(canManagePharmacy({ userId: "user-b", pharmacyId: "pharmacy-a", membership: verifiedOwner }), false);
  assert.equal(canManagePharmacy({ userId: "user-a", pharmacyId: "pharmacy-b", membership: verifiedOwner }), false);
  assert.equal(canManagePharmacy({ userId: "user-a", pharmacyId: "pharmacy-a", membership: { ...verifiedOwner, pharmacy: { status: "PENDING" } } }), false);
});

test("pharmacy approval workflow permits review, suspension, and reinstatement only", () => {
  assert.equal(canTransitionPharmacy("PENDING", "VERIFIED"), true);
  assert.equal(canTransitionPharmacy("PENDING", "REJECTED"), true);
  assert.equal(canTransitionPharmacy("VERIFIED", "SUSPENDED"), true);
  assert.equal(canTransitionPharmacy("SUSPENDED", "VERIFIED"), true);
  assert.equal(canTransitionPharmacy("REJECTED", "VERIFIED"), false);
  assert.equal(canTransitionPharmacy("PENDING", "SUSPENDED"), false);
  assert.equal(canTransitionPharmacy("VERIFIED", "REJECTED"), false);
});

test("pharmacy license keys normalize whitespace and case", () => {
  assert.equal(normalizeLicenseKey("  AB-C 12 "), "ab-c 12");
  assert.equal(normalizeLicenseKey(null), "");
});

test("pharmacy license normalization preserves compatibility characters to match the database check", () => {
  assert.equal(normalizeLicenseKey("  ﬀ-123  "), "ﬀ-123");
  assert.notEqual(normalizeLicenseKey("ﬀ-123"), "ff-123");
});
