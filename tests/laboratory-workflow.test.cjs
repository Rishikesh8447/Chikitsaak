const { test } = require("node:test");
const assert = require("node:assert/strict");
const { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, getLabOrderBookingTotalCents, normalizeCatalogKey, normalizeIdList, parseMoney } = require("../lib/laboratory-workflow.mjs");

test("laboratory order transition graph rejects stale and out-of-order transitions", () => {
  assert.equal(canTransitionLabOrder("AWAITING_LAB_SELECTION", "REQUESTED"), true);
  assert.equal(canTransitionLabOrder("REQUESTED", "ACCEPTED"), true);
  assert.equal(canTransitionLabOrder("ACCEPTED", "COLLECTION_SCHEDULED"), true);
  assert.equal(canTransitionLabOrder("COLLECTION_SCHEDULED", "COLLECTED"), true);
  assert.equal(canTransitionLabOrder("REQUESTED", "COLLECTED"), false);
  assert.equal(canTransitionLabOrder("ACCEPTED", "REJECTED"), false);
  assert.equal(canTransitionLabOrder("REJECTED", "ACCEPTED"), false);
});

test("laboratory review graph supports verification, rejection, suspension, and reactivation", () => {
  assert.equal(canTransitionLaboratory("PENDING", "VERIFIED"), true);
  assert.equal(canTransitionLaboratory("PENDING", "REJECTED"), true);
  assert.equal(canTransitionLaboratory("VERIFIED", "SUSPENDED"), true);
  assert.equal(canTransitionLaboratory("SUSPENDED", "VERIFIED"), true);
  assert.equal(canTransitionLaboratory("REJECTED", "VERIFIED"), false);
  assert.equal(canTransitionLaboratory("PENDING", "SUSPENDED"), false);
});

test("laboratory eligibility requires every selected test to be available", () => {
  const labs = [
    { id: "lab-a", name: "A", offerings: [{ labTestId: "cbc", isAvailable: true }, { labTestId: "cmp", isAvailable: true }] },
    { id: "lab-b", name: "B", offerings: [{ labTestId: "cbc", isAvailable: true }, { labTestId: "cmp", isAvailable: false }] },
    { id: "lab-c", name: "C", offerings: [{ labTestId: "cbc", isAvailable: true }] },
  ];
  assert.deepEqual(getEligibleLaboratories(labs, ["cbc", "cmp"]).map((lab) => lab.id), ["lab-a"]);
});

test("form IDs are deduplicated and money values are constrained to decimal currency", () => {
  assert.deepEqual(normalizeIdList(["a", "a", "", null, " b "]), ["a", "b"]);
  assert.equal(parseMoney("10"), "10.00");
  assert.equal(parseMoney("10.25"), "10.25");
  assert.equal(parseMoney("-1"), null);
  assert.equal(parseMoney("1.999"), null);
  assert.equal(parseMoney("1e3"), null);
});

test("booking total is hidden for empty, unassigned, or partially priced orders", () => {
  assert.equal(getLabOrderBookingTotalCents([]), null);
  assert.equal(getLabOrderBookingTotalCents([{ priceAtBooking: null }]), null);
  assert.equal(getLabOrderBookingTotalCents([{ priceAtBooking: "3.50" }, { priceAtBooking: null }]), null);
});

test("booking total sums captured prices as exact cents", () => {
  assert.equal(getLabOrderBookingTotalCents([{ priceAtBooking: "0.10" }, { priceAtBooking: "0.20" }, { priceAtBooking: "1" }]), 130);
});

test("catalog uniqueness key ignores case and surrounding whitespace", () => {
  assert.equal(normalizeCatalogKey("  CBC  "), normalizeCatalogKey("cbc"));
  assert.equal(normalizeCatalogKey(" REG-12 "), "reg-12");
});
