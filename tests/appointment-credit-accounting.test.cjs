const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "appointments.js"), "utf8");

async function loadBookingAction() {
  const source = await sourcePromise;
  const appointmentTime = await import("../lib/appointment-time.mjs");
  const appointmentDate = "2099-06-01";
  const startTime = new Date(`${appointmentDate}T08:00:00.000Z`);
  const endTime = new Date(`${appointmentDate}T08:30:00.000Z`);
  const state = {
    users: [
      { id: "patient-1", clerkUserId: "clerk-patient", role: "PATIENT", credits: 6 },
      { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED", credits: 4 },
    ],
    appointment: null,
    transactions: [],
  };
  const tx = {
    user: {
      findUnique: async ({ where }) => structuredClone(state.users.find((user) =>
        where.clerkUserId ? user.clerkUserId === where.clerkUserId && user.role === where.role
          : user.id === where.id && user.role === where.role && user.verificationStatus === where.verificationStatus
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
      findMany: async () => [{
        dayOfWeek: null,
        blockedDate: null,
        startTime: new Date(`${appointmentDate}T07:00:00.000Z`),
        endTime: new Date(`${appointmentDate}T09:00:00.000Z`),
      }],
    },
    appointment: {
      findFirst: async () => null,
      create: async ({ data }) => {
        state.appointment = { id: "appointment-1", ...structuredClone(data) };
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
    $transaction: async (work) => work(tx),
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
    auth: async () => ({ userId: "clerk-patient" }),
    db,
    revalidatePath: () => {},
    Vonage: FakeVonage,
    Auth: FakeAuth,
    createAppointmentNotificationPair: async () => {},
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
      ["startTime", startTime.toISOString()],
      ["endTime", endTime.toISOString()],
      ["description", "Test booking"],
      ["aiSummary", null],
      ["aiSpecialtySuggestion", null],
    ]));

    assert.equal(result.success, true);
    assert.equal(state.users.find((user) => user.id === "patient-1").credits, 4);
    assert.equal(state.users.find((user) => user.id === "doctor-1").credits, 6);
    assert.deepEqual(state.transactions.map(({ userId, amount, type }) => ({ userId, amount, type })), [
      { userId: "patient-1", amount: -2, type: "APPOINTMENT_DEDUCTION" },
      { userId: "doctor-1", amount: 2, type: "APPOINTMENT_DEDUCTION" },
    ]);
    assert.equal(state.appointment.videoSessionId, "test-session");
  } finally {
    if (priorAppId === undefined) delete process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID;
    else process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID = priorAppId;
    if (priorPrivateKey === undefined) delete process.env.VONAGE_PRIVATE_KEY;
    else process.env.VONAGE_PRIVATE_KEY = priorPrivateKey;
  }
});
