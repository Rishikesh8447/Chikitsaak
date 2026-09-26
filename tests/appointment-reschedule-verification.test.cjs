const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "appointments.js"), "utf8");
const initialStart = new Date("2035-06-01T10:00:00.000Z");
const initialEnd = new Date("2035-06-01T10:30:00.000Z");
const newStart = new Date("2035-06-01T11:00:00.000Z");
const newEnd = new Date("2035-06-01T11:30:00.000Z");

async function loadAction({ verificationStatus = "VERIFIED", ownerId = "patient-1", available = true } = {}) {
  const source = await sourcePromise;
  const appointmentTime = await import("../lib/appointment-time.mjs");
  const state = {
    appointment: { id: "appointment-1", patientId: ownerId, doctorId: "doctor-1", status: "CONFIRMED", startTime: initialStart, endTime: initialEnd },
    reminders: [{ appointmentId: "appointment-1" }],
    credits: { patient: 8, doctor: 10 },
    ledger: [{ userId: "patient-1", amount: -2 }, { userId: "doctor-1", amount: 2 }],
    doctorQueries: [], reminderDeletes: 0,
  };
  const tx = {
    user: {
      findUnique: async ({ where }) => {
        if (where.clerkUserId) return { id: "patient-1" };
        state.doctorQueries.push(where);
        if (where.id !== "doctor-1" || where.role !== "DOCTOR" || where.verificationStatus !== verificationStatus) return null;
        return { id: "doctor-1" };
      },
    },
    appointment: {
      findUnique: async ({ where }) => where.id === state.appointment.id ? structuredClone(state.appointment) : null,
      findFirst: async () => null,
      update: async ({ data }) => {
        Object.assign(state.appointment, data);
        return structuredClone(state.appointment);
      },
    },
    availability: {
      findMany: async () => available ? [{ dayOfWeek: null, blockedDate: null, startTime: new Date("2035-06-01T09:00:00.000Z"), endTime: new Date("2035-06-01T13:00:00.000Z") }] : [],
    },
    appointmentReminder: {
      deleteMany: async () => { state.reminderDeletes += 1; state.reminders = []; return { count: 1 }; },
    },
  };
  const dependencies = {
    auth: async () => ({ userId: "clerk-user" }),
    db: { $transaction: (work) => work(tx) },
    revalidatePath: () => {},
    createAppointmentNotificationPair: async () => {},
    ...appointmentTime,
  };
  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { Vonage } from "@vonage/server-sdk";', "const Vonage = class {};")
    .replace('import { addDays, addMinutes, format, endOfDay } from "date-fns";', "const addDays = () => {}; const addMinutes = () => {}; const format = () => {}; const endOfDay = () => {};")
    .replace('import { Auth } from "@vonage/auth";', "const Auth = class {};")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { resolveDoctorPublicNames } from "@/lib/doctor-name";', "const resolveDoctorPublicNames = async () => [];")
    .replace('import { getVideoJoinWindowError } from "@/lib/appointment-time.mjs";', "const { getVideoJoinWindowError } = dependencies;")
    .replace("export async function bookAppointment", "async function bookAppointment")
    .replace("export async function authorizeVideoCall", "async function authorizeVideoCall")
    .replace("export async function getVideoCallCredentials", "async function getVideoCallCredentials")
    .replace("export async function getDoctorById", "async function getDoctorById")
    .replace("export async function getAvailableTimeSlots", "async function getAvailableTimeSlots")
    .replace("export async function rescheduleAppointment", "async function rescheduleAppointment")
    .concat("\nreturn { rescheduleAppointment };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function form({ patientId = "patient-1", startTime = newStart, endTime = newEnd } = {}) {
  return new Map([['appointmentId', 'appointment-1'], ['startTime', startTime.toISOString()], ['endTime', endTime.toISOString()], ['patientId', patientId]]);
}

test("verified doctor and appointment owner can reschedule to a valid available slot", async () => {
  const { rescheduleAppointment, state } = await loadAction();
  const result = await rescheduleAppointment(form());
  assert.equal(result.success, true);
  assert.equal(state.appointment.startTime.toISOString(), newStart.toISOString());
  assert.equal(state.appointment.endTime.toISOString(), newEnd.toISOString());
  assert.equal(state.reminderDeletes, 1);
  assert.deepEqual(state.doctorQueries[0], { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" });
});

for (const verificationStatus of ["PENDING", "REJECTED"]) {
  test(`${verificationStatus} doctor blocks rescheduling without side effects`, async () => {
    const { rescheduleAppointment, state } = await loadAction({ verificationStatus });
    const before = structuredClone({ appointment: state.appointment, reminders: state.reminders, credits: state.credits, ledger: state.ledger });
    await assert.rejects(rescheduleAppointment(form()), /Doctor not found or not verified/);
    assert.deepEqual({ appointment: state.appointment, reminders: state.reminders, credits: state.credits, ledger: state.ledger }, before);
    assert.equal(state.reminderDeletes, 0);
  });
}

test("patient who does not own the appointment keeps the existing authorization rejection", async () => {
  const { rescheduleAppointment, state } = await loadAction({ ownerId: "other-patient" });
  await assert.rejects(rescheduleAppointment(form()), /Appointment not found or not authorized/);
  assert.equal(state.doctorQueries.length, 0);
  assert.equal(state.reminderDeletes, 0);
});

test("unavailable slot keeps the existing validation rejection", async () => {
  const { rescheduleAppointment, state } = await loadAction({ available: false });
  await assert.rejects(rescheduleAppointment(form()), /outside the doctor's availability/);
  assert.equal(state.reminderDeletes, 0);
  assert.equal(state.appointment.startTime.toISOString(), initialStart.toISOString());
});
