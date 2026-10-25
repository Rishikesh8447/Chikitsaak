const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "appointments.js"), "utf8");
const initialStart = new Date("2035-06-01T10:00:00.000Z");
const initialEnd = new Date("2035-06-01T10:20:00.000Z");
const newStart = new Date("2035-06-01T11:00:00.000Z");
const newEnd = new Date("2035-06-01T11:20:00.000Z");

async function loadAction({ verificationStatus = "VERIFIED", ownerId = "patient-1", available = true, consultationMode = "ONLINE", payment = null } = {}) {
  const source = await sourcePromise;
  const appointmentTime = await import("../lib/appointment-time.mjs");
  const state = {
    appointment: { id: "appointment-1", patientId: ownerId, doctorId: "doctor-1", status: "CONFIRMED", startTime: initialStart, endTime: initialEnd, consultationMode, payment },
    reminders: [{ appointmentId: "appointment-1" }],
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
    measureServerTiming: async (_label, operation) => operation(),
    db: {
      $transaction: (work) => work(tx),
      user: { findUnique: async () => ({ id: "patient-1", role: "PATIENT" }) },
      appointment: { findUnique: async () => structuredClone(state.appointment) },
    },
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
    .replace('import { measureServerTiming } from "@/lib/server-timing.mjs";', "const { measureServerTiming } = dependencies;")
    .replace("export async function bookAppointment", "async function bookAppointment")
    .replace("export async function authorizeVideoCall", "async function authorizeVideoCall")
    .replace("export async function getVideoCallCredentials", "async function getVideoCallCredentials")
    .replace("export async function getDoctorById", "async function getDoctorById")
    .replace("export async function getAvailableTimeSlots", "async function getAvailableTimeSlots")
    .replace("export async function rescheduleAppointment", "async function rescheduleAppointment")
    .concat("\nreturn { authorizeVideoCall, rescheduleAppointment };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function form({ patientId = "patient-1", startTime = newStart, endTime = newEnd } = {}) {
  return new Map([['appointmentId', 'appointment-1'], ['startTime', startTime.toISOString()], ['endTime', endTime.toISOString()], ['patientId', patientId]]);
}

test("offline appointments cannot authorize a video call", async () => {
  const { authorizeVideoCall } = await loadAction({ consultationMode: "OFFLINE" });
  await assert.rejects(authorizeVideoCall(new Map([["appointmentId", "appointment-1"]])), /This is an in-person appointment/);
});

test("verified doctor and appointment owner can reschedule to a valid available slot", async () => {
  const { rescheduleAppointment, state } = await loadAction();
  const result = await rescheduleAppointment(form());
  assert.equal(result.success, true);
  assert.equal(state.appointment.startTime.toISOString(), newStart.toISOString());
  assert.equal(state.appointment.endTime.toISOString(), newEnd.toISOString());
  assert.equal(state.reminderDeletes, 1);
  assert.deepEqual(state.doctorQueries[0], { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" });
});

for (const [label, consultationMode, payment] of [
  ["verified online payment", "ONLINE", { method: "ONLINE", status: "PAID", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED", cashCollection: null }],
  ["verified offline UPI payment", "OFFLINE", { method: "UPI_QR", status: "PAID", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED", cashCollection: null }],
  ["cash due", "OFFLINE", { method: "CASH", status: "CASH_DUE", verifiedAt: null, refundStatus: "NOT_REQUIRED", cashCollection: null }],
  ["audited cash collection", "OFFLINE", { method: "CASH", status: "PAID", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED", cashCollection: { paymentId: "payment-1" } }],
]) {
  test(`${label} appointment remains eligible for rescheduling`, async () => {
    const { rescheduleAppointment, state } = await loadAction({ consultationMode, payment });
    const result = await rescheduleAppointment(form());
    assert.equal(result.success, true);
    assert.equal(state.appointment.payment.status, payment.status);
    assert.equal(state.appointment.payment.cashCollection?.paymentId, payment.cashCollection?.paymentId);
  });
}

for (const [label, consultationMode, payment] of [
  ["unpaid online", "ONLINE", { method: "ONLINE", status: "PENDING", verifiedAt: null, refundStatus: "NOT_REQUIRED", cashCollection: null }],
  ["pending offline UPI", "OFFLINE", { method: "UPI_QR", status: "PENDING", verifiedAt: null, refundStatus: "NOT_REQUIRED", cashCollection: null }],
  ["refund-review", "ONLINE", { method: "ONLINE", status: "PAID", verifiedAt: new Date(), refundStatus: "REVIEW_REQUIRED", cashCollection: null }],
]) {
  test(`${label} payment blocks rescheduling without side effects`, async () => {
    const { rescheduleAppointment, state } = await loadAction({ consultationMode, payment });
    const before = structuredClone(state.appointment);
    await assert.rejects(rescheduleAppointment(form()), /payment state does not permit rescheduling/);
    assert.deepEqual(state.appointment, before);
    assert.equal(state.reminderDeletes, 0);
  });
}

for (const verificationStatus of ["PENDING", "REJECTED"]) {
  test(`${verificationStatus} doctor blocks rescheduling without side effects`, async () => {
    const { rescheduleAppointment, state } = await loadAction({ verificationStatus });
    const before = structuredClone({ appointment: state.appointment, reminders: state.reminders, ledger: state.ledger });
    await assert.rejects(rescheduleAppointment(form()), /Doctor not found or not verified/);
    assert.deepEqual({ appointment: state.appointment, reminders: state.reminders, ledger: state.ledger }, before);
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
