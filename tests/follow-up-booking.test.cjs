const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
baseDate.setHours(10, 0, 0, 0);
const slotStart = new Date(baseDate);
const slotEnd = new Date(baseDate.getTime() + 20 * 60 * 1000);

async function loadFollowUpAction({
  patientUser = { id: "patient-1", clerkUserId: "clerk-patient-1", role: "PATIENT", name: "Rohan" },
  doctorUser = { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Dr. Sharma" },
  originalAppointment = {
    id: "orig-appt-1",
    patientId: "patient-1",
    doctorId: "doctor-1",
    status: "COMPLETED",
    consultationMode: "ONLINE",
    originalAppointmentId: null,
    doctor: { id: "doctor-1", name: "Dr. Sharma", role: "DOCTOR", verificationStatus: "VERIFIED" },
    prescription: { id: "presc-1", followUpRequired: true, followUpDays: 14 },
    payment: {
      status: "PAID",
      method: "ONLINE",
      verifiedAt: new Date(),
      refundStatus: "NOT_REQUIRED",
      cashCollection: null,
    },
    followUpAppointment: null,
  },
  availabilityWindows = [
    {
      doctorId: "doctor-1",
      status: "AVAILABLE",
      dayOfWeek: null,
      blockedDate: null,
      startTime: new Date(2000, 0, 1, 8, 0, 0),
      endTime: new Date(2000, 0, 1, 20, 0, 0),
    },
  ],
  conflicts = { doctor: null, patient: null },
} = {}) {
  const source = await readFile(join(process.cwd(), "actions", "appointments.js"), "utf8");

  const state = {
    createdAppointments: [],
    updatedAppointments: [],
    deletedReminders: [],
    notifications: [],
    paymentCreated: [],
  };

  let currentFollowUp = originalAppointment?.followUpAppointment;

  const tx = {
    user: {
      findUnique: async (query) => {
        if (query.where.clerkUserId === patientUser?.clerkUserId) return patientUser;
        return null;
      },
    },
    appointment: {
      findUnique: async (query) => {
        if (query.where.id === originalAppointment?.id) {
          return {
            ...originalAppointment,
            doctor: doctorUser,
            followUpAppointment: currentFollowUp,
          };
        }
        if (query.where.id === currentFollowUp?.id) {
          return currentFollowUp;
        }
        return null;
      },
      findFirst: async (query) => {
        if (query.where.doctorId === doctorUser?.id && conflicts.doctor) {
          return conflicts.doctor;
        }
        if (query.where.patientId === patientUser?.id && conflicts.patient) {
          return conflicts.patient;
        }
        return null;
      },
      create: async (query) => {
        state.createdAppointments.push(query.data);
        const appt = { ...query.data, id: "new-follow-up-id" };
        currentFollowUp = appt;
        return appt;
      },
      updateMany: async (query) => {
        state.updatedAppointments.push(query);
        if (currentFollowUp && query.where.id === currentFollowUp.id && currentFollowUp.status === query.where.status) {
          Object.assign(currentFollowUp, query.data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    availability: {
      findMany: async () => availabilityWindows,
    },
    appointmentReminder: {
      deleteMany: async (query) => {
        state.deletedReminders.push(query);
        return { count: 1 };
      },
    },
    appointmentPayment: {
      create: async (query) => {
        state.paymentCreated.push(query);
        return { id: "should-not-be-created" };
      },
    },
    notification: {
      createMany: async (query) => {
        state.notifications.push(query);
        return { count: query.data.length };
      },
    },
  };

  const followUpLib = await import("../lib/follow-up-appointment.mjs");

  const dependencies = {
    auth: async () => ({ userId: patientUser?.clerkUserId || null }),
    db: {
      $transaction: async (cb) => cb(tx),
    },
    revalidatePath: () => {},
    createAppointmentNotificationPair: async (_tx, appt, details) => {
      state.notifications.push({ appt, details });
    },
    isOriginalAppointmentPaymentVerified: followUpLib.isOriginalAppointmentPaymentVerified,
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { Vonage } from "@vonage/server-sdk";', "const Vonage = class {};")
    .replace('import { addDays, addMinutes, format, endOfDay } from "date-fns";', "const addDays = () => {}; const addMinutes = () => {}; const format = (d, f) => d.toISOString(); const endOfDay = () => {};")
    .replace('import { Auth } from "@vonage/auth";', "const Auth = class {};")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { resolveDoctorPublicNames } from "@/lib/doctor-name";', "const resolveDoctorPublicNames = async () => [];")
    .replace('import { getVideoJoinWindowError } from "@/lib/appointment-time.mjs";', "const getVideoJoinWindowError = () => null;")
    .replace('import { measureServerTiming } from "@/lib/server-timing.mjs";', "const measureServerTiming = async (_l, cb) => cb();")
    .replace('import { withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";', "const withSerializableRetries = (fn) => fn();")
    .replace('import { isOriginalAppointmentPaymentVerified } from "@/lib/follow-up-appointment.mjs";', "const { isOriginalAppointmentPaymentVerified } = dependencies;")
    .replace('import { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } from "@/lib/email";', "const sendAppointmentBookedEmail = dependencies.sendAppointmentBookedEmail || (async () => {}); const sendAppointmentRescheduledEmail = dependencies.sendAppointmentRescheduledEmail || (async () => {});")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { scheduleFollowUpAppointment };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function makeFollowUpFormData(extra = []) {
  return new Map([
    ["originalAppointmentId", "orig-appt-1"],
    ["startTime", slotStart.toISOString()],
    ["endTime", slotEnd.toISOString()],
    ["consultationMode", "ONLINE"],
    ["patientDescription", "Follow-up on fever recovery"],
    ...extra,
  ]);
}

test("patient can successfully schedule an included follow-up appointment at ₹0", async () => {
  const { scheduleFollowUpAppointment, state } = await loadFollowUpAction();
  const result = await scheduleFollowUpAppointment(makeFollowUpFormData());

  assert.equal(result.success, true);
  assert.equal(state.createdAppointments.length, 1);
  const created = state.createdAppointments[0];
  assert.equal(created.originalAppointmentId, "orig-appt-1");
  assert.equal(created.patientId, "patient-1");
  assert.equal(created.doctorId, "doctor-1");
  assert.equal(created.status, "SCHEDULED");
  assert.equal(created.consultationMode, "ONLINE");

  // ₹0 payment isolation: No payment record created
  assert.equal(state.paymentCreated.length, 0);

  // Notification sent to both patient and doctor
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].details.type, "APPOINTMENT_BOOKED");
  assert.match(state.notifications[0].details.patientMessage, /included at ₹0/);
});

test("supports OFFLINE consultation mode", async () => {
  const { scheduleFollowUpAppointment, state } = await loadFollowUpAction();
  const result = await scheduleFollowUpAppointment(makeFollowUpFormData([["consultationMode", "OFFLINE"]]));

  assert.equal(result.success, true);
  assert.equal(state.createdAppointments[0].consultationMode, "OFFLINE");
  assert.equal(state.paymentCreated.length, 0);
});

test("rejects invalid consultation mode", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction();
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData([["consultationMode", "TELEPATHY"]])),
    /Invalid consultation mode/
  );
});

test("rejects if patient does not own the original appointment", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    patientUser: { id: "patient-impostor", clerkUserId: "clerk-impostor", role: "PATIENT" },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /Original appointment not found or not owned by you/
  );
});

test("rejects if original appointment is not completed", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    originalAppointment: {
      id: "orig-appt-1",
      patientId: "patient-1",
      doctorId: "doctor-1",
      status: "CONFIRMED", // Not completed
      consultationMode: "ONLINE",
      doctor: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
      prescription: { id: "presc-1", followUpRequired: true },
      payment: { status: "PAID", method: "ONLINE", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED" },
      followUpAppointment: null,
    },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /A follow-up can only be scheduled for a completed consultation/
  );
});

test("rejects if original appointment was itself a follow-up (no chaining)", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    originalAppointment: {
      id: "orig-appt-1",
      patientId: "patient-1",
      doctorId: "doctor-1",
      status: "COMPLETED",
      originalAppointmentId: "earlier-orig-id", // Is already a follow-up!
      consultationMode: "ONLINE",
      doctor: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
      prescription: { id: "presc-1", followUpRequired: true },
      payment: { status: "PAID", method: "ONLINE", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED" },
      followUpAppointment: null,
    },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /A follow-up consultation cannot have another follow-up/
  );
});

test("rejects if doctor did not recommend follow-up", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    originalAppointment: {
      id: "orig-appt-1",
      patientId: "patient-1",
      doctorId: "doctor-1",
      status: "COMPLETED",
      consultationMode: "ONLINE",
      doctor: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
      prescription: { id: "presc-1", followUpRequired: false }, // Not recommended
      payment: { status: "PAID", method: "ONLINE", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED" },
      followUpAppointment: null,
    },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /The doctor did not recommend a follow-up for this consultation/
  );
});

test("rejects if original appointment was not paid", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    originalAppointment: {
      id: "orig-appt-1",
      patientId: "patient-1",
      doctorId: "doctor-1",
      status: "COMPLETED",
      consultationMode: "ONLINE",
      doctor: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
      prescription: { id: "presc-1", followUpRequired: true },
      payment: { status: "PENDING", method: "ONLINE", verifiedAt: null, refundStatus: "NOT_REQUIRED" }, // Unpaid!
      followUpAppointment: null,
    },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /A verified paid consultation is required to schedule an included follow-up/
  );
});

test("rejects if original appointment payment was refunded", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    originalAppointment: {
      id: "orig-appt-1",
      patientId: "patient-1",
      doctorId: "doctor-1",
      status: "COMPLETED",
      consultationMode: "ONLINE",
      doctor: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
      prescription: { id: "presc-1", followUpRequired: true },
      payment: { status: "PAID", method: "ONLINE", verifiedAt: new Date(), refundStatus: "REFUNDED" }, // Refunded!
      followUpAppointment: null,
    },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /A verified paid consultation is required to schedule an included follow-up/
  );
});

test("rejects if doctor is not verified", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    doctorUser: { id: "doctor-1", role: "DOCTOR", verificationStatus: "PENDING" },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /Doctor is not currently verified/
  );
});

test("rejects if slot is outside doctor availability", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    availabilityWindows: [
      {
        doctorId: "doctor-1",
        status: "AVAILABLE",
        dayOfWeek: null,
        blockedDate: null,
        startTime: new Date("1970-01-01T15:00:00Z"), // Only 15:00-17:00
        endTime: new Date("1970-01-01T17:00:00Z"),
      },
    ],
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /The selected time is outside the doctor's availability/
  );
});

test("rejects if slot conflicts with doctor's existing schedule", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    conflicts: { doctor: { id: "conflict-appt-doc" }, patient: null },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /This slot is no longer available/
  );
});

test("rejects if slot conflicts with patient's existing schedule", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    conflicts: { doctor: null, patient: { id: "conflict-appt-pat" } },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /This slot is no longer available/
  );
});

test("enforces single entitlement: duplicate booking rejected when follow-up is already active", async () => {
  const { scheduleFollowUpAppointment } = await loadFollowUpAction({
    originalAppointment: {
      id: "orig-appt-1",
      patientId: "patient-1",
      doctorId: "doctor-1",
      status: "COMPLETED",
      consultationMode: "ONLINE",
      doctor: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
      prescription: { id: "presc-1", followUpRequired: true },
      payment: { status: "PAID", method: "ONLINE", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED" },
      followUpAppointment: { id: "existing-follow-up-1", status: "SCHEDULED" }, // Already scheduled!
    },
  });
  await assert.rejects(
    scheduleFollowUpAppointment(makeFollowUpFormData()),
    /A follow-up consultation has already been scheduled for this appointment/
  );
});

test("rebooking after cancellation reuses existing record, cleans reminders, and resets video session", async () => {
  const { scheduleFollowUpAppointment, state } = await loadFollowUpAction({
    originalAppointment: {
      id: "orig-appt-1",
      patientId: "patient-1",
      doctorId: "doctor-1",
      status: "COMPLETED",
      consultationMode: "ONLINE",
      doctor: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
      prescription: { id: "presc-1", followUpRequired: true },
      payment: { status: "PAID", method: "ONLINE", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED" },
      followUpAppointment: {
        id: "existing-follow-up-1",
        status: "CANCELLED",
        videoSessionId: "stale-session-token",
      },
    },
  });

  const result = await scheduleFollowUpAppointment(makeFollowUpFormData());
  assert.equal(result.success, true);

  // Does NOT create a second appointment row!
  assert.equal(state.createdAppointments.length, 0);

  // Updates the existing record
  assert.equal(state.updatedAppointments.length, 1);
  assert.equal(state.updatedAppointments[0].where.id, "existing-follow-up-1");
  assert.equal(state.updatedAppointments[0].where.status, "CANCELLED");
  assert.equal(state.updatedAppointments[0].data.status, "SCHEDULED");
  assert.equal(state.updatedAppointments[0].data.videoSessionId, null); // Reset credentials

  // Clears stale reminders
  assert.equal(state.deletedReminders.length, 1);
  assert.equal(state.deletedReminders[0].where.appointmentId, "existing-follow-up-1");

  // Still ₹0 cost
  assert.equal(state.paymentCreated.length, 0);
});
