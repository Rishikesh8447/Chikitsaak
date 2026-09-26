const { test } = require("node:test");
const assert = require("node:assert/strict");
const reminderKey = import("../lib/reminder-key.mjs");

test("rescheduled appointment uses a fresh idempotency key for the new reminder schedule", async () => {
  const { appointmentReminderKey } = await reminderKey;
  const original = appointmentReminderKey("appointment-1", "TWENTY_FOUR_HOURS", "2035-06-01T08:00:00.000Z");
  const rescheduled = appointmentReminderKey("appointment-1", "TWENTY_FOUR_HOURS", "2035-06-08T08:00:00.000Z");
  assert.notEqual(original, rescheduled);
  assert.match(rescheduled, /2035-06-08T08:00:00\.000Z$/);
});
