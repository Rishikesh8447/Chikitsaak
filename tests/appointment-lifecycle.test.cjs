const { test } = require("node:test");
const assert = require("node:assert/strict");
const lifecyclePromise = import("../lib/appointment-lifecycle.mjs");

test("doctor appointment lifecycle only allows explicit transitions", async () => {
  const { canTransitionAppointment: canTransition } = await lifecyclePromise;
  assert.equal(canTransition("SCHEDULED", "CONFIRMED"), true);
  assert.equal(canTransition("CONFIRMED", "IN_PROGRESS"), true);
  assert.equal(canTransition("IN_PROGRESS", "COMPLETED"), true);
  assert.equal(canTransition("IN_PROGRESS", "CANCELLED"), false);
  assert.equal(canTransition("COMPLETED", "CONFIRMED"), false);
});

test("cancellation is supported only before consultation starts", async () => {
  const { canTransitionAppointment: canTransition } = await lifecyclePromise;
  assert.equal(canTransition("SCHEDULED", "CANCELLED"), true);
  assert.equal(canTransition("CONFIRMED", "CANCELLED"), true);
  assert.equal(canTransition("IN_PROGRESS", "CANCELLED"), false);
});
