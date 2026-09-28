const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "appointments.js"), "utf8");

async function loadBookingAction({ patientCredits = 2, userId = "clerk-patient", doctorVerificationStatus = "VERIFIED", available = true } = {}) {
  const source = await sourcePromise;
  const appointmentTime = await import("../lib/appointment-time.mjs");
  const appointmentDate = "2099-06-01";
  const startTime = new Date(`${appointmentDate}T08:00:00.000Z`);
  const endTime = new Date(`${appointmentDate}T08:30:00.000Z`);
  const state = {
    users: [
      { id: "patient-1", clerkUserId: "clerk-patient", role: "PATIENT", credits: patientCredits },
      { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED", credits: 4 },
    ],
    appointment: null,
    appointments: [],
    transactions: [],
    notifications: [],
    reminders: [],
    isolationLevels: [],
    revalidated: [],
    conflictQueries: [],
  };
  let transactionQueue = Promise.resolve();
  const tx = {
    user: {
      findUnique: async ({ where }) => structuredClone(state.users.find((user) =>
        where.clerkUserId ? user.clerkUserId === where.clerkUserId && user.role === where.role
          : user.id === where.id && (!where.role || user.role === where.role) && (!where.verificationStatus || user.verificationStatus === doctorVerificationStatus)
      ) || null),
      updateMany: async ({ where, data }) => {
        const user = state.users.find((item) => item.id === where.id && item.credits >= where.credits.gte);
        if (!user) return { count: 0 };
        user.credits += data.credits.decrement === undefined ? 0 : -data.credits.decrement;
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        const user = state.users.find((item) => item.id === where.id);
        user.credits += data.credits.increment;
        return structuredClone(user);
      },
    },
    availability: {
      findMany: async () => available ? [{
        dayOfWeek: null,
        blockedDate: null,
        startTime: new Date(`${appointmentDate}T07:00:00.000Z`),
        endTime: new Date(`${appointmentDate}T09:00:00.000Z`),
      }] : [],
    },
    appointment: {
      findFirst: async ({ where }) => {
        state.conflictQueries.push(where);
        return state.appointments.find((appointment) =>
          (!where.doctorId || appointment.doctorId === where.doctorId)
          && (!where.patientId || appointment.patientId === where.patientId)
          && (!where.status?.in || where.status.in.includes(appointment.status))
          && appointment.startTime < where.startTime.lt
          && appointment.endTime > where.endTime.gt
        ) || null;
      },
      create: async ({ data }) => {
        state.appointment = { id: "appointment-1", ...structuredClone(data) };
        state.appointments.push(state.appointment);
        return structuredClone(state.appointment);
      },
    },
    creditTransaction: {
      createMany: async ({ data }) => {
        state.transactions.push(...structuredClone(data));
        return { count: data.length };
      },
    },
    notification: { createMany: async () => ({ count: 2 }) },
  };
  const db = {
    $transaction: async (work, options = {}) => {
      let release;
      const previous = transactionQueue;
      transactionQueue = new Promise((resolve) => { release = resolve; });
      await previous;
      state.isolationLevels.push(options.isolationLevel);
      try {
        return await work(tx);
      } finally {
        release();
      }
    },
    appointment: {
      update: async ({ where, data }) => {
        if (state.appointment?.id !== where.id) throw new Error("Appointment not found");
        Object.assign(state.appointment, data);
        return structuredClone(state.appointment);
      },
    },
  };
  class FakeVonage {
    constructor() {
      this.video = { createSession: async () => ({ sessionId: "test-session" }) };
    }
  }
  class FakeAuth {}
  const dependencies = {
    auth: async () => ({ userId }),
    db,
    revalidatePath: (path) => state.revalidated.push(path),
    Vonage: FakeVonage,
    Auth: FakeAuth,
    createAppointmentNotificationPair: async (transaction, appointment, details) => {
      state.notifications.push(
        { userId: appointment.patientId, appointmentId: appointment.id, type: details.type, dedupeKey: `${details.key}:patient` },
        { userId: appointment.doctorId, appointmentId: appointment.id, type: details.type, dedupeKey: `${details.key}:doctor` },
      );
    },
    resolveDoctorPublicNames: async () => [],
    ...appointmentTime,
    addDays: () => {}, addMinutes: () => {}, format: () => {}, endOfDay: () => {},
  };
  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { Vonage } from "@vonage/server-sdk";', "const Vonage = dependencies.Vonage;")
    .replace('import { Auth } from "@vonage/auth";', "const Auth = dependencies.Auth;")
    .replace('import { addDays, addMinutes, format, endOfDay } from "date-fns";', "const { addDays, addMinutes, format, endOfDay } = dependencies;")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { resolveDoctorPublicNames } from "@/lib/doctor-name";', "const { resolveDoctorPublicNames } = dependencies;")
    .replace('import { getVideoJoinWindowError } from "@/lib/appointment-time.mjs";', "const { getVideoJoinWindowError } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { bookAppointment };");
  return { bookAppointment: new Function("dependencies", transformed)(dependencies).bookAppointment, state, startTime, endTime };
}

test("booking deducts two patient credits and records the matching doctor credit", async () => {
  const priorAppId = process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
  const priorPrivateKey = process.env.VONAGE_PRIVATE_KEY;
  process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = "test-application";
  process.env.VONAGE_PRIVATE_KEY = "test-private-key";
  try {
    const { bookAppointment, state, startTime, endTime } = await loadBookingAction();
    const result = await bookAppointment(new Map([
      ["doctorId", "doctor-1"],
      ["patientId", "patient-other"], // Must be ignored in favor of the authenticated Clerk identity.
      ["startTime", startTime.toISOString()],
      ["endTime", endTime.toISOString()],
      ["description", "Test booking"],
      ["aiSummary", null],
      ["aiSpecialtySuggestion", null],
    ]));

    assert.equal(result.success, true);
    assert.equal(state.appointment.patientId, "patient-1");
    assert.equal(state.appointment.doctorId, "doctor-1");
    assert.equal(state.appointment.startTime.toISOString(), startTime.toISOString());
    assert.equal(state.appointment.endTime.toISOString(), endTime.toISOString());
    assert.equal(state.appointment.status, "SCHEDULED");
    assert.equal(state.appointments.length, 1);
    assert.equal(state.users.find((user) => user.id === "patient-1").credits, 0);
    assert.equal(state.users.find((user) => user.id === "doctor-1").credits, 6);
    assert.deepEqual(state.transactions.map(({ userId, amount, type }) => ({ userId, amount, type })), [
      { userId: "patient-1", amount: -2, type: "APPOINTMENT_DEDUCTION" },
      { userId: "doctor-1", amount: 2, type: "APPOINTMENT_DEDUCTION" },
    ]);
    assert.equal(state.appointment.videoSessionId, "test-session");
    assert.equal(state.notifications.length, 2);
    assert.ok(state.notifications.every((notification) => notification.appointmentId === state.appointment.id && notification.type === "APPOINTMENT_BOOKED"));
    assert.deepEqual(state.reminders, []); // Reminder rows are created later by the scheduled reminder worker.
    assert.deepEqual(state.isolationLevels, ["Serializable"]);
    assert.ok(state.revalidated.includes("/appointments"));
  } finally {
    if (priorAppId === undefined) delete process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
    else process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = priorAppId;
    if (priorPrivateKey === undefined) delete process.env.VONAGE_PRIVATE_KEY;
    else process.env.VONAGE_PRIVATE_KEY = priorPrivateKey;
  }
});

test("patient with 10 credits can book and is charged exactly two credits", async () => {
  const priorAppId = process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
  const priorPrivateKey = process.env.VONAGE_PRIVATE_KEY;
  process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = "test-application";
  process.env.VONAGE_PRIVATE_KEY = "test-private-key";
  try {
    const { bookAppointment, state, startTime, endTime } = await loadBookingAction({ patientCredits: 10 });
    const result = await bookAppointment(new Map([
      ["doctorId", "doctor-1"], ["startTime", startTime.toISOString()], ["endTime", endTime.toISOString()],
      ["aiSummary", null], ["aiSpecialtySuggestion", null],
    ]));
    assert.equal(result.success, true);
    assert.equal(state.users.find((user) => user.id === "patient-1").credits, 8);
    assert.equal(state.transactions.find((transaction) => transaction.userId === "patient-1").amount, -2);
  } finally {
    if (priorAppId === undefined) delete process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
    else process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = priorAppId;
    if (priorPrivateKey === undefined) delete process.env.VONAGE_PRIVATE_KEY;
    else process.env.VONAGE_PRIVATE_KEY = priorPrivateKey;
  }
});

for (const availableCredits of [0, 1]) {
  test(`booking with ${availableCredits} credit${availableCredits === 1 ? "" : "s"} returns a structured insufficient-credit result without writes`, async () => {
    const priorAppId = process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
    const priorPrivateKey = process.env.VONAGE_PRIVATE_KEY;
    process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = "test-application";
    process.env.VONAGE_PRIVATE_KEY = "test-private-key";
    try {
      const { bookAppointment, state, startTime, endTime } = await loadBookingAction({ patientCredits: availableCredits });
      const result = await bookAppointment(new Map([
        ["doctorId", "doctor-1"], ["startTime", startTime.toISOString()], ["endTime", endTime.toISOString()],
        ["aiSummary", null], ["aiSpecialtySuggestion", null],
      ]));
      assert.deepEqual(result, {
        success: false,
        code: "INSUFFICIENT_CREDITS",
        message: `Insufficient credits. You have ${availableCredits} credits, but this appointment requires 2 credits.`,
      });
      assert.equal(state.appointment, null);
      assert.equal(state.transactions.length, 0);
      assert.equal(state.users.find((user) => user.id === "patient-1").credits, availableCredits);
      assert.equal(state.users.find((user) => user.id === "doctor-1").credits, 4);
    } finally {
      if (priorAppId === undefined) delete process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
      else process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = priorAppId;
      if (priorPrivateKey === undefined) delete process.env.VONAGE_PRIVATE_KEY;
      else process.env.VONAGE_PRIVATE_KEY = priorPrivateKey;
    }
  });
}

test("concurrent bookings cannot spend the same two patient credits twice", async () => {
  const priorAppId = process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
  const priorPrivateKey = process.env.VONAGE_PRIVATE_KEY;
  process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = "test-application";
  process.env.VONAGE_PRIVATE_KEY = "test-private-key";
  try {
    const { bookAppointment, state, startTime, endTime } = await loadBookingAction({ patientCredits: 2 });
    const form = (slotStart = startTime, slotEnd = endTime) => new Map([
      ["doctorId", "doctor-1"], ["startTime", slotStart.toISOString()], ["endTime", slotEnd.toISOString()],
      ["aiSummary", null], ["aiSpecialtySuggestion", null],
    ]);
    const results = await Promise.all([bookAppointment(form()), bookAppointment(form(new Date(endTime), new Date(endTime.getTime() + 30 * 60 * 1000)))]);
    assert.equal(results.filter((result) => result.success).length, 1, JSON.stringify({ results, appointments: state.appointments, queries: state.conflictQueries }));
    assert.equal(results.filter((result) => result.code === "INSUFFICIENT_CREDITS").length, 1);
    assert.equal(state.users.find((user) => user.id === "patient-1").credits, 0);
    assert.equal(state.users.find((user) => user.id === "doctor-1").credits, 6);
    assert.equal(state.transactions.length, 2);
  } finally {
    if (priorAppId === undefined) delete process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
    else process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = priorAppId;
    if (priorPrivateKey === undefined) delete process.env.VONAGE_PRIVATE_KEY;
    else process.env.VONAGE_PRIVATE_KEY = priorPrivateKey;
  }
});

test("a same-slot race with sufficient credits creates only one appointment", async () => {
  const priorAppId = process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
  const priorPrivateKey = process.env.VONAGE_PRIVATE_KEY;
  process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = "test-application";
  process.env.VONAGE_PRIVATE_KEY = "test-private-key";
  try {
    const { bookAppointment, state, startTime, endTime } = await loadBookingAction({ patientCredits: 10 });
    const form = () => new Map([
      ["doctorId", "doctor-1"], ["startTime", startTime.toISOString()], ["endTime", endTime.toISOString()],
      ["aiSummary", null], ["aiSpecialtySuggestion", null],
    ]);
    const results = await Promise.all([bookAppointment(form()), bookAppointment(form())]);
    assert.equal(results.filter((result) => result.success).length, 1, JSON.stringify({ results, appointments: state.appointments, queries: state.conflictQueries }));
    assert.equal(results.filter((result) => result.code === "SLOT_UNAVAILABLE").length, 1);
    assert.equal(state.appointments.length, 1);
    assert.equal(state.users.find((user) => user.id === "patient-1").credits, 8);
    assert.equal(state.users.find((user) => user.id === "doctor-1").credits, 6);
    assert.equal(state.transactions.length, 2);
    assert.equal(state.notifications.length, 2);
  } finally {
    if (priorAppId === undefined) delete process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
    else process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = priorAppId;
    if (priorPrivateKey === undefined) delete process.env.VONAGE_PRIVATE_KEY;
    else process.env.VONAGE_PRIVATE_KEY = priorPrivateKey;
  }
});

test("unauthenticated caller cannot book an appointment", async () => {
  const { bookAppointment, startTime, endTime, state } = await loadBookingAction({ userId: null });
  await assert.rejects(bookAppointment(new Map([
    ["doctorId", "doctor-1"], ["startTime", startTime.toISOString()], ["endTime", endTime.toISOString()],
  ])), /Unauthorized/);
  assert.equal(state.appointments.length, 0);
  assert.equal(state.transactions.length, 0);
});

test("unverified doctor cannot receive a booking", async () => {
  const { bookAppointment, startTime, endTime, state } = await loadBookingAction({ doctorVerificationStatus: "PENDING" });
  const result = await bookAppointment(new Map([
    ["doctorId", "doctor-1"], ["startTime", startTime.toISOString()], ["endTime", endTime.toISOString()],
    ["aiSummary", null], ["aiSpecialtySuggestion", null],
  ]));
  assert.deepEqual(result, {
    success: false,
    code: "DOCTOR_UNAVAILABLE",
    message: "This doctor is not currently available for booking.",
  });
  assert.equal(state.appointments.length, 0);
  assert.equal(state.transactions.length, 0);
});

test("booking rejects a time outside the doctor's availability without side effects", async () => {
  const { bookAppointment, startTime, endTime, state } = await loadBookingAction({ available: false });
  const result = await bookAppointment(new Map([
    ["doctorId", "doctor-1"], ["startTime", startTime.toISOString()], ["endTime", endTime.toISOString()],
    ["aiSummary", null], ["aiSpecialtySuggestion", null],
  ]));
  assert.equal(result.success, false);
  assert.equal(result.code, "SLOT_UNAVAILABLE");
  assert.equal(state.appointments.length, 0);
  assert.equal(state.transactions.length, 0);
});
