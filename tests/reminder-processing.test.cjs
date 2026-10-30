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
        { userId: appointment.patientId, appointmentId: appointment.id, type: details.type, dedupeKey: `${details.key}:patient`, message: details.patientMessage },
        { userId: appointment.doctorId, appointmentId: appointment.id, type: details.type, dedupeKey: `${details.key}:doctor`, message: details.doctorMessage },
      ],
      skipDuplicates: true,
    }),
    appointmentReminderKey: reminderKey.appointmentReminderKey,
  };
  const transformed = source
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { appointmentReminderKey } from "@/lib/reminder-key.mjs";', "const { appointmentReminderKey } = dependencies;")
    .replace('import { sendAppointmentReminderEmail } from "@/lib/email";', "const sendAppointmentReminderEmail = dependencies.sendAppointmentReminderEmail || (async () => {});")
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

test("appointment at 23.5 hours away claims TWENTY_FOUR_HOURS reminder with 24 hours message", async () => {
  const start = "2040-01-02T11:30:00.000Z"; // 23.5 hours from 2040-01-01T12:00:00.000Z
  const { processDueAppointmentReminders, state, now } = await loadProcessor({ currentStart: start });
  const result = await processDueAppointmentReminders(now);
  assert.equal(result.processed, 1);
  assert.ok(state.reminderKeys.has("appointment-1:TWENTY_FOUR_HOURS"));
  const patientNotification = [...state.notifications.values()].find((n) => n.userId === "patient-1");
  assert.ok(patientNotification);
  assert.match(patientNotification.message, /24 hours/);
});

for (const [desc, start] of [
  ["45 minutes away", "2040-01-01T12:45:00.000Z"],
  ["2 hours away", "2040-01-01T14:00:00.000Z"],
  ["10 hours away", "2040-01-01T22:00:00.000Z"],
  ["22 hours away", "2040-01-02T10:00:00.000Z"],
]) {
  test(`appointment ${desc} is outside reminder windows and receives no reminder`, async () => {
    const { processDueAppointmentReminders, state, now } = await loadProcessor({ currentStart: start });
    const result = await processDueAppointmentReminders(now);
    assert.deepEqual(result, { processed: 0 });
    assert.equal(state.reminderKeys.size, 0);
    assert.equal(state.notifications.size, 0);
  });
}

test("appointment in 23-24 hour window receives 24-hour reminder, then later receives 30-minute reminder", async () => {
  const appointmentStart = "2040-01-02T11:30:00.000Z";
  const { processDueAppointmentReminders, state } = await loadProcessor({ currentStart: appointmentStart });

  // Cron run 1 at 23.5 hours before appointment: claims TWENTY_FOUR_HOURS
  const now1 = new Date("2040-01-01T12:00:00.000Z");
  const result1 = await processDueAppointmentReminders(now1);
  assert.equal(result1.processed, 1);
  assert.ok(state.reminderKeys.has("appointment-1:TWENTY_FOUR_HOURS"));
  assert.equal(state.reminderKeys.has("appointment-1:THIRTY_MINUTES"), false);

  // Cron run 2 at 10 hours before appointment (intermediate window): no new reminder
  const now2 = new Date("2040-01-02T01:30:00.000Z");
  const result2 = await processDueAppointmentReminders(now2);
  assert.equal(result2.processed, 0);

  // Cron run 3 at 20 minutes before appointment (30-minute window): claims THIRTY_MINUTES
  const now3 = new Date("2040-01-02T11:10:00.000Z");
  const result3 = await processDueAppointmentReminders(now3);
  assert.equal(result3.processed, 1);
  assert.ok(state.reminderKeys.has("appointment-1:TWENTY_FOUR_HOURS"));
  assert.ok(state.reminderKeys.has("appointment-1:THIRTY_MINUTES"));

  // Verify notifications include both 24-hour and 30-minute reminders for the patient
  const patientNotifications = [...state.notifications.values()].filter((n) => n.userId === "patient-1");
  assert.equal(patientNotifications.length, 2);
  assert.ok(patientNotifications.some((n) => n.message.includes("24 hours")));
  assert.ok(patientNotifications.some((n) => n.message.includes("30 minutes")));
});
