const { test } = require("node:test");
const assert = require("node:assert/strict");
const appointmentTime = import("../lib/appointment-time.mjs");

test("date-only availability labels stay on the same local calendar day west of UTC", async () => {
  const { parseLocalCalendarDate, groupSlotsByLocalDate } = await appointmentTime;
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    const parsed = parseLocalCalendarDate("2035-06-01");
    assert.equal(parsed.getFullYear(), 2035);
    assert.equal(parsed.getMonth(), 5);
    assert.equal(parsed.getDate(), 1);
    assert.equal(parsed.getDay(), 5);
    const grouped = groupSlotsByLocalDate([{ date: "2035-06-01", slots: [{ startTime: "2035-06-01T00:30:00.000Z", endTime: "2035-06-01T01:00:00.000Z" }] }]);
    assert.equal(grouped[0].date, "2035-05-31");
    assert.equal(grouped[0].displayDate, "Thursday, May 31");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("booking time range uses the same local timezone as the selected appointment instant", async () => {
  const { formatLocalSlotRange } = await appointmentTime;
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    assert.equal(formatLocalSlotRange("2035-06-01T08:00:00.000Z", "2035-06-01T08:30:00.000Z"), "1:00 AM - 1:30 AM");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("video join policy permits the 30-minute opening and rejects the exact end instant", async () => {
  const { getVideoJoinWindowError } = await appointmentTime;
  const start = new Date("2035-06-01T08:00:00.000Z");
  const end = new Date("2035-06-01T08:30:00.000Z");
  assert.equal(getVideoJoinWindowError(start, end, new Date(start.getTime() - 30 * 60 * 1000)), null);
  assert.equal(getVideoJoinWindowError(start, end, new Date(start.getTime() - 30 * 60 * 1000 - 1)), "The call will be available 30 minutes before the scheduled time");
  assert.equal(getVideoJoinWindowError(start, end, end), "This appointment has ended");
});
