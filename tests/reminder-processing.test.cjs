const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "lib", "reminders.js"), "utf8");
const reminderKeyPromise = import("../lib/reminder-key.mjs");

async function loadProcessor({ currentStatus = "CONFIRMED", currentStart, candidateStart } = {}) {
  const [source, reminderKey] = await Promise.all([sourcePromise, reminderKeyPromise]);
  const now = new Date("2040-01-01T12:00:00.000Z");
  const startTime = new Date(currentStart || "2040-01-01T12:20:00.000Z");
  const current = {
    id: "appointment-1",
    status: currentStatus,
    startTime,
    patientId: "patient-1",
    doctorId: "doctor-1",
    patient: { id: "patient-1" },
    doctor: { id: "doctor-1" },
  };
  const candidate = { ...current, startTime: new Date(candidateStart || startTime) };
  const state = { current, candidates: [candidate], reminderKeys: new Set(), notifications: new Map(), transactions: 0 };
  const tx = {
    appointment: { findUnique: async ({ where }) => where.id === state.current.id ? state.current : null },
    appointmentReminder: {
      createMany: async ({ data }) => {
        let count = 0;
        for (const reminder of data) {
          const key = `${reminder.appointmentId}:${reminder.type}`;
          if (state.reminderKeys.has(key)) continue;
          state.reminderKeys.add(key);
          count += 1;
        }
        return { count };
      },
    },
    notification: {
      createMany: async ({ data }) => {
        for (const item of data) if (!state.notifications.has(item.dedupeKey)) state.notifications.set(item.dedupeKey, item);
        return { count: data.length };
      },
    },
  };
  const dependencies = {
    db: {
      appointment: { findMany: async () => state.candidates },
      $transaction: async (callback, options) => {
        state.transactions += 1;
        state.lastIsolationLevel = options?.isolationLevel;
        return callback(tx);
      },
    },
    createAppointmentNotificationPair: async (transaction, appointment, details) => transaction.notification.createMany({
      data: [
        { userId: appointment.patientId, appointmentId: appointment.id, type: details.type, dedupeKey: `${details.key}:patient` },
        { userId: appointment.doctorId, appointmentId: appointment.id, type: details.type, dedupeKey: `${details.key}:doctor` },
      ],
      skipDuplicates: true,
    }),
    appointmentReminderKey: reminderKey.appointmentReminderKey,
  };
  const transformed = source
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { appointmentReminderKey } from "@/lib/reminder-key.mjs";', "const { appointmentReminderKey } = dependencies;")
    .replace("export async function processDueAppointmentReminders", "async function processDueAppointmentReminders")
    .concat("\nreturn { processDueAppointmentReminders };");
  return { ...new Function("dependencies", transformed)(dependencies), state, now };
}

for (const status of ["CANCELLED", "COMPLETED"]) {
  test(`${status.toLowerCase()} appointment found in a stale scan does not receive a reminder`, async () => {
    const { processDueAppointmentReminders, state, now } = await loadProcessor({ currentStatus: status });
    assert.deepEqual(await processDueAppointmentReminders(now), { processed: 0 });
    assert.equal(state.reminderKeys.size, 0);
    assert.equal(state.notifications.size, 0);
  });
}

test("rescheduled appointment uses its current start time when creating a reminder", async () => {
  const oldStart = "2040-01-02T09:00:00.000Z";
  const currentStart = "2040-01-01T12:20:00.000Z";
  const { processDueAppointmentReminders, state, now } = await loadProcessor({ candidateStart: oldStart, currentStart });
  assert.deepEqual(await processDueAppointmentReminders(now), { processed: 1 });
  assert.ok([...state.notifications.keys()].every((key) => key.includes(currentStart)));
  assert.ok([...state.notifications.keys()].every((key) => !key.includes(oldStart)));
});

test("repeated and concurrent cron processing claims a reminder once", async () => {
  const { processDueAppointmentReminders, state, now } = await loadProcessor();
  const results = await Promise.all([
    processDueAppointmentReminders(now),
    processDueAppointmentReminders(now),
  ]);
  assert.equal(results.reduce((sum, result) => sum + result.processed, 0), 1);
  assert.equal(state.reminderKeys.size, 1);
  assert.equal(state.notifications.size, 2);
  assert.equal(state.lastIsolationLevel, "Serializable");
});
