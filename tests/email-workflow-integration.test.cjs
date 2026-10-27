const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const { pathToFileURL } = require("node:url");

/**
 * 1. Test Prescription Email Integration in actions/medical.js
 */
test("createPrescription dispatches privacy-conscious email post-commit and handles failures gracefully", async () => {
  const source = await readFile(join(cwd(), "actions", "medical.js"), "utf8");
  const state = {
    dispatches: [],
    committed: false,
    dispatchOrder: [],
  };

  const user = { id: "doc-1", clerkUserId: "clerk-doc-1", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Dr. A Sharma" };
  const appointment = {
    id: "appt-1",
    patientId: "patient-1",
    doctorId: "doc-1",
    status: "COMPLETED",
    patient: { id: "patient-1", name: "Rohan Verma", email: "rohan@example.com" },
    doctor: { id: "doc-1", name: "Dr. A Sharma", email: "sharma@example.com" },
  };

  const tx = {
    appointment: { findUnique: async () => appointment },
    prescription: {
      findUnique: async () => null,
      create: async (query) => {
        state.prescriptionCreated = query.data;
        return { id: "presc-1", ...query.data, medicines: query.data.medicines.create };
      },
    },
    notification: { createMany: async () => ({ count: 1 }) },
  };

  const dependencies = {
    auth: async () => ({ userId: user.clerkUserId }),
    revalidatePath() {},
    createNotification: async () => {},
    db: {
      user: {
        findUnique: async () => user,
      },
      $transaction: async (cb) => {
        const res = await cb(tx);
        state.committed = true;
        state.dispatchOrder.push("commit");
        return res;
      },
    },
    sendPrescriptionAvailableEmail: async (params) => {
      state.dispatchOrder.push("email");
      state.dispatches.push(params);
      return { success: true };
    },
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { createNotification } from "@/lib/notifications";', "const { createNotification } = dependencies;")
    .replace('import { sendPrescriptionAvailableEmail } from "@/lib/email";', "const { sendPrescriptionAvailableEmail } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { createPrescription };");

  const { createPrescription } = new Function("dependencies", transformed)(dependencies);

  const formData = new Map([
    ["appointmentId", "appt-1"],
    ["diagnosis", "Acute Viral Pharyngitis"],
    ["generalInstructions", "Drink warm fluids and rest"],
    ["medicines", JSON.stringify([{ name: "Amoxicillin", dosage: "500mg", frequency: "TDS", duration: "5 days" }])],
    ["followUpRequired", "true"],
    ["followUpDays", "7"],
  ]);

  const result = await createPrescription(formData);
  assert.equal(result.success, true);
  assert.equal(state.committed, true);
  assert.deepEqual(state.dispatchOrder, ["commit", "email"], "Email dispatch must happen strictly after transaction commits");
  assert.equal(state.dispatches.length, 1);
  assert.equal(state.dispatches[0].to, "rohan@example.com");
  assert.equal(state.dispatches[0].patientName, "Rohan Verma");
  assert.equal(state.dispatches[0].doctorName, "Dr. A Sharma");
  assert.equal(state.dispatches[0].followUpRequired, true);
  assert.equal(state.dispatches[0].followUpDays, 7);

  // Failure tolerance: email error does not fail createPrescription
  dependencies.sendPrescriptionAvailableEmail = async () => {
    throw new Error("Resend network timeout");
  };
  const failResult = await createPrescription(formData);
  assert.equal(failResult.success, true, "Prescription must succeed even if email transport throws");
});

/**
 * 2. Test Follow-Up Booking Email Integration in actions/appointments.js
 */
test("scheduleFollowUpAppointment dispatches post-commit emails with ₹0 follow-up flag", async () => {
  const source = await readFile(join(cwd(), "actions", "appointments.js"), "utf8");
  const state = {
    dispatches: [],
    dispatchOrder: [],
  };

  const patient = { id: "pat-1", clerkUserId: "clerk-pat", role: "PATIENT", name: "Ananya", email: "ananya@example.com" };
  const doctor = { id: "doc-1", name: "Dr. Bose", role: "DOCTOR", verificationStatus: "VERIFIED", email: "bose@example.com" };
  const original = {
    id: "orig-1",
    patientId: "pat-1",
    doctorId: "doc-1",
    status: "COMPLETED",
    consultationMode: "ONLINE",
    originalAppointmentId: null,
    doctor,
    prescription: { id: "presc-1", followUpRequired: true, followUpDays: 14 },
    payment: { method: "ONLINE", status: "PAID", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED" },
    followUpAppointment: null,
  };

  const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 20 * 60 * 1000);

  const tx = {
    user: {
      findUnique: async (q) => {
        if (q.where.clerkUserId === "clerk-pat") return patient;
        return null;
      },
    },
    appointment: {
      findUnique: async (q) => (q.where.id === "orig-1" ? original : null),
      findFirst: async () => null,
      create: async ({ data }) => {
        state.dispatchOrder.push("commit");
        return { id: "follow-up-1", ...data };
      },
    },
    availability: {
      findMany: async () => [{ dayOfWeek: null, blockedDate: null, startTime: new Date(2000, 0, 1, 9), endTime: new Date(2000, 0, 1, 18) }],
    },
  };

  const dependencies = {
    auth: async () => ({ userId: "clerk-pat" }),
    db: {
      $transaction: async (cb) => cb(tx),
    },
    revalidatePath() {},
    createAppointmentNotificationPair: async () => {},
    withSerializableRetries: async (fn) => fn(),
    isOriginalAppointmentPaymentVerified: () => true,
    sendAppointmentBookedEmail: async (params) => {
      state.dispatchOrder.push("email");
      state.dispatches.push(params);
      return { success: true };
    },
    sendAppointmentRescheduledEmail: async () => ({ success: true }),
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { Vonage } from "@vonage/server-sdk";', "const Vonage = class {};")
    .replace('import { addDays, addMinutes, format, endOfDay } from "date-fns";', "const addDays=()=>{}; const addMinutes=()=>{}; const format=(d)=>d.toISOString(); const endOfDay=()=>{};")
    .replace('import { Auth } from "@vonage/auth";', "const Auth = class {};")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { resolveDoctorPublicNames } from "@/lib/doctor-name";', "const resolveDoctorPublicNames = async () => [];")
    .replace('import { getVideoJoinWindowError } from "@/lib/appointment-time.mjs";', "const getVideoJoinWindowError = () => null;")
    .replace('import { measureServerTiming } from "@/lib/server-timing.mjs";', "const measureServerTiming = async (_l, cb) => cb();")
    .replace('import { withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";', "const { withSerializableRetries } = dependencies;")
    .replace('import { isOriginalAppointmentPaymentVerified } from "@/lib/follow-up-appointment.mjs";', "const { isOriginalAppointmentPaymentVerified } = dependencies;")
    .replace('import { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } from "@/lib/email";', "const { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { scheduleFollowUpAppointment };");

  const { scheduleFollowUpAppointment } = new Function("dependencies", transformed)(dependencies);

  const formData = new Map([
    ["originalAppointmentId", "orig-1"],
    ["startTime", start.toISOString()],
    ["endTime", end.toISOString()],
    ["consultationMode", "ONLINE"],
  ]);

  const res = await scheduleFollowUpAppointment(formData);
  assert.equal(res.success, true);
  assert.equal(state.dispatches.length, 2, "Both patient and doctor must receive follow-up booking email");
  assert.equal(state.dispatches[0].to, "ananya@example.com");
  assert.equal(state.dispatches[0].recipientRole, "PATIENT");
  assert.equal(state.dispatches[0].isFollowUp, true);
  assert.equal(state.dispatches[1].to, "bose@example.com");
  assert.equal(state.dispatches[1].recipientRole, "DOCTOR");
  assert.equal(state.dispatches[1].isFollowUp, true);
  assert.deepEqual(state.dispatchOrder, ["commit", "email", "email"], "Emails must be dispatched post-commit");
});

/**
 * 3. Test Reschedule Email Integration in actions/appointments.js
 */
test("rescheduleAppointment dispatches post-commit emails with new appointment time", async () => {
  const source = await readFile(join(cwd(), "actions", "appointments.js"), "utf8");
  const state = {
    dispatches: [],
    dispatchOrder: [],
  };

  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  start.setHours(14, 0, 0, 0);
  const end = new Date(start.getTime() + 20 * 60 * 1000);

  const patient = { id: "pat-1", clerkUserId: "clerk-pat", role: "PATIENT", name: "Patient One", email: "pat1@example.com" };
  const doctor = { id: "doc-1", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Dr. One", email: "doc1@example.com" };
  const appt = {
    id: "appt-1",
    patientId: "pat-1",
    doctorId: "doc-1",
    status: "CONFIRMED",
    consultationMode: "ONLINE",
    payment: { status: "PAID", method: "ONLINE", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED" },
  };

  const tx = {
    user: {
      findUnique: async (q) => {
        if (q.where.clerkUserId) return patient;
        if (q.where.id === "doc-1") return doctor;
        return null;
      },
    },
    appointment: {
      findUnique: async () => appt,
      findFirst: async () => null,
      update: async ({ data }) => {
        state.dispatchOrder.push("commit");
        return { ...appt, ...data };
      },
    },
    availability: {
      findMany: async () => [{ dayOfWeek: null, blockedDate: null, startTime: new Date(2000, 0, 1, 9), endTime: new Date(2000, 0, 1, 18) }],
    },
    appointmentReminder: { deleteMany: async () => ({ count: 1 }) },
  };

  const dependencies = {
    auth: async () => ({ userId: "clerk-pat" }),
    db: {
      $transaction: async (cb) => cb(tx),
    },
    revalidatePath() {},
    createAppointmentNotificationPair: async () => {},
    sendAppointmentBookedEmail: async () => ({ success: true }),
    sendAppointmentRescheduledEmail: async (params) => {
      state.dispatchOrder.push("email");
      state.dispatches.push(params);
      return { success: true };
    },
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { Vonage } from "@vonage/server-sdk";', "const Vonage = class {};")
    .replace('import { addDays, addMinutes, format, endOfDay } from "date-fns";', "const addDays=()=>{}; const addMinutes=()=>{}; const format=()=>{}; const endOfDay=()=>{};")
    .replace('import { Auth } from "@vonage/auth";', "const Auth = class {};")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { resolveDoctorPublicNames } from "@/lib/doctor-name";', "const resolveDoctorPublicNames = async () => [];")
    .replace('import { getVideoJoinWindowError } from "@/lib/appointment-time.mjs";', "const getVideoJoinWindowError = () => null;")
    .replace('import { measureServerTiming } from "@/lib/server-timing.mjs";', "const measureServerTiming = async (_l, cb) => cb();")
    .replace('import { withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";', "const withSerializableRetries = (fn) => fn();")
    .replace('import { isOriginalAppointmentPaymentVerified } from "@/lib/follow-up-appointment.mjs";', "const isOriginalAppointmentPaymentVerified = () => true;")
    .replace('import { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } from "@/lib/email";', "const { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { rescheduleAppointment };");

  const { rescheduleAppointment } = new Function("dependencies", transformed)(dependencies);

  const formData = new Map([
    ["appointmentId", "appt-1"],
    ["startTime", start.toISOString()],
    ["endTime", end.toISOString()],
  ]);

  const res = await rescheduleAppointment(formData);
  assert.equal(res.success, true);
  assert.equal(state.dispatches.length, 2);
  assert.equal(state.dispatches[0].to, "pat1@example.com");
  assert.equal(state.dispatches[0].recipientRole, "PATIENT");
  assert.equal(state.dispatches[1].to, "doc1@example.com");
  assert.equal(state.dispatches[1].recipientRole, "DOCTOR");
  assert.deepEqual(state.dispatchOrder, ["commit", "email", "email"]);
});

/**
 * 4. Test Doctor Confirmation & Cancellation Email Integration in actions/doctor.js
 */
test("doctor status confirmation and cancellation dispatch post-commit emails", async () => {
  const source = await readFile(join(cwd(), "actions", "doctor.js"), "utf8");
  const state = {
    confirmDispatches: [],
    cancelDispatches: [],
    dispatchOrder: [],
  };

  const doctor = { id: "doc-1", clerkUserId: "clerk-doc", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Dr. Mehta", email: "mehta@example.com" };
  const patient = { id: "pat-1", name: "Meena", email: "meena@example.com" };
  const appt = {
    id: "appt-1",
    doctorId: "doc-1",
    patientId: "pat-1",
    status: "SCHEDULED",
    consultationMode: "ONLINE",
    startTime: new Date(Date.now() + 86400000),
    endTime: new Date(Date.now() + 86400000 + 1200000),
    patient,
    payment: { method: "ONLINE", status: "PAID", verifiedAt: new Date() },
  };

  const tx = {
    appointment: {
      updateMany: async () => {
        state.dispatchOrder.push("commit");
        return { count: 1 };
      },
      findUnique: async () => ({ ...appt, patient, doctor }),
    },
    appointmentPayment: {
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => ({ id: "pay-1", status: "PAID", refundStatus: "NOT_REQUIRED" }),
    },
  };

  const dependencies = {
    auth: async () => ({ userId: "clerk-doc" }),
    db: {
      user: { findUnique: async () => doctor },
      appointment: { findUnique: async () => appt },
      $transaction: async (cb) => cb(tx),
    },
    revalidatePath() {},
    createAppointmentNotificationPair: async () => {},
    canTransitionAppointment: () => true,
    cancelAppointmentInTransaction: async (t, { notify }) => {
      state.dispatchOrder.push("cancel_commit");
      await notify(t, appt);
      return appt;
    },
    CANCELLATION_ERRORS: {},
    parseConsultationPriceRupees: () => null,
    sendAppointmentConfirmedEmail: async (params) => {
      state.dispatchOrder.push("confirm_email");
      state.confirmDispatches.push(params);
      return { success: true };
    },
    sendAppointmentCancelledEmail: async (params) => {
      state.dispatchOrder.push("cancel_email");
      state.cancelDispatches.push(params);
      return { success: true };
    },
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { canTransitionAppointment } from "@/lib/appointment-lifecycle.mjs";', "const { canTransitionAppointment } = dependencies;")
    .replace('import { cancelAppointmentInTransaction, CANCELLATION_ERRORS } from "@/lib/appointment-cancellation.mjs";', "const { cancelAppointmentInTransaction, CANCELLATION_ERRORS } = dependencies;")
    .replace('import { parseConsultationPriceRupees } from "@/lib/razorpay.mjs";', "const { parseConsultationPriceRupees } = dependencies;")
    .replace('import { sendAppointmentConfirmedEmail, sendAppointmentCancelledEmail } from "@/lib/email";', "const { sendAppointmentConfirmedEmail, sendAppointmentCancelledEmail } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { updateAppointmentStatus, cancelAppointment };");

  const { updateAppointmentStatus, cancelAppointment } = new Function("dependencies", transformed)(dependencies);

  // 1. Confirm appointment
  const confirmRes = await updateAppointmentStatus(new Map([["appointmentId", "appt-1"], ["status", "CONFIRMED"]]));
  assert.equal(confirmRes.success, true);
  assert.equal(state.confirmDispatches.length, 1);
  assert.equal(state.confirmDispatches[0].to, "meena@example.com");
  assert.equal(state.confirmDispatches[0].doctorName, "Dr. Mehta");
  assert.deepEqual(state.dispatchOrder, ["commit", "confirm_email"]);

  // 2. Cancel appointment
  state.dispatchOrder = [];
  const cancelRes = await cancelAppointment(new Map([["appointmentId", "appt-1"]]));
  assert.equal(cancelRes.success, true);
  assert.equal(state.cancelDispatches.length, 2);
  assert.equal(state.cancelDispatches[0].to, "meena@example.com");
  assert.equal(state.cancelDispatches[0].recipientRole, "PATIENT");
  assert.equal(state.cancelDispatches[1].to, "mehta@example.com");
  assert.equal(state.cancelDispatches[1].recipientRole, "DOCTOR");
  assert.deepEqual(state.dispatchOrder, ["cancel_commit", "cancel_email", "cancel_email"]);
});

/**
 * 5. Test Reminder Post-Commit Dispatch and Deduplication in lib/reminders.js
 */
test("processDueAppointmentReminders dispatches emails post-commit and deduplicates repeats", async () => {
  const source = await readFile(join(cwd(), "lib", "reminders.js"), "utf8");
  const state = {
    reminderKeys: new Set(),
    dispatches: [],
  };

  const start = new Date(Date.now() + 25 * 60 * 1000); // 25 minutes ahead (THIRTY_MINUTES reminder)
  const candidate = {
    id: "appt-remind-1",
    status: "CONFIRMED",
    startTime: start,
    consultationMode: "ONLINE",
    patient: { id: "pat-1", name: "Kiran", email: "kiran@example.com" },
    doctor: { id: "doc-1", name: "Dr. Roy", email: "roy@example.com" },
  };

  const tx = {
    appointment: { findUnique: async () => candidate },
    appointmentReminder: {
      createMany: async ({ data }) => {
        let count = 0;
        for (const item of data) {
          const key = `${item.appointmentId}:${item.type}`;
          if (!state.reminderKeys.has(key)) {
            state.reminderKeys.add(key);
            count += 1;
          }
        }
        return { count };
      },
    },
    notification: { createMany: async () => ({ count: 2 }) },
  };

  const dependencies = {
    db: {
      appointment: { findMany: async () => [candidate] },
      $transaction: async (cb) => cb(tx),
    },
    createAppointmentNotificationPair: async () => {},
    appointmentReminderKey: (id, type) => `${id}:${type}`,
    sendAppointmentReminderEmail: async (params) => {
      state.dispatches.push(params);
      return { success: true };
    },
  };

  const transformed = source
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { appointmentReminderKey } from "@/lib/reminder-key.mjs";', "const { appointmentReminderKey } = dependencies;")
    .replace('import { sendAppointmentReminderEmail } from "@/lib/email";', "const { sendAppointmentReminderEmail } = dependencies;")
    .replace("export async function processDueAppointmentReminders", "async function processDueAppointmentReminders")
    .concat("\nreturn { processDueAppointmentReminders };");

  const { processDueAppointmentReminders } = new Function("dependencies", transformed)(dependencies);

  // First run: claims reminder and dispatches emails
  const run1 = await processDueAppointmentReminders();
  assert.equal(run1.processed, 1);
  assert.equal(state.dispatches.length, 2);
  assert.equal(state.dispatches[0].to, "kiran@example.com");
  assert.equal(state.dispatches[0].reminderType, "THIRTY_MINUTES");
  assert.equal(state.dispatches[1].to, "roy@example.com");

  // Second run (duplicate/retry): claimed.count is 0 -> skips email dispatch
  const run2 = await processDueAppointmentReminders();
  assert.equal(run2.processed, 0);
  assert.equal(state.dispatches.length, 2, "Duplicate reminder execution must not send another email");
});
