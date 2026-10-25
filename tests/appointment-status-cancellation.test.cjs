const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const lifecycleModule = import("../lib/appointment-lifecycle.mjs");
const cancellationModule = import("../lib/appointment-cancellation.mjs");
const pricingModule = import("../lib/razorpay.mjs");

const sourcePromise = readFile(join(cwd(), "actions", "doctor.js"), "utf8");

async function loadStatusAction() {
  const source = await sourcePromise;
  const state = { appointmentReads: 0, transactions: 0, appointment: null };
  const dependencies = {
    db: {
      user: { findUnique: async () => ({ id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" }) },
      appointment: { findUnique: async () => { state.appointmentReads += 1; return state.appointment; } },
      $transaction: async (work) => {
        state.transactions += 1;
        return work({
          appointment: {
            updateMany: async ({ where, data }) => {
              if (!state.appointment || state.appointment.id !== where.id || state.appointment.status !== where.status) return { count: 0 };
              Object.assign(state.appointment, data);
              return { count: 1 };
            },
            findUnique: async () => structuredClone(state.appointment),
          },
        });
      },
    },
    auth: async () => ({ userId: "clerk-doctor" }),
    revalidatePath: () => {},
    createAppointmentNotificationPair: async () => {},
    ...(await lifecycleModule),
    ...(await cancellationModule),
    ...(await pricingModule),
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
    .replaceAll("export async function", "async function")
    .concat("\nreturn { updateAppointmentStatus };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

test("generic doctor status action cannot cancel without transactional refund accounting", async () => {
  const { updateAppointmentStatus, state } = await loadStatusAction();
  const formData = new Map([["appointmentId", "appointment-1"], ["status", "CANCELLED"]]);

  await assert.rejects(updateAppointmentStatus(formData), /Invalid appointment status/);
  assert.equal(state.appointmentReads, 0);
  assert.equal(state.transactions, 0);
});

for (const appointment of [
  {
    consultationMode: "ONLINE",
    payment: null,
  },
  {
    consultationMode: "ONLINE",
    payment: { method: "ONLINE", status: "PENDING", verifiedAt: null },
  },
  {
    consultationMode: "OFFLINE",
    payment: { method: "UPI_QR", status: "PENDING", verifiedAt: null },
  },
]) {
  test(`${appointment.consultationMode} ${appointment.payment?.method || "missing payment"} appointment cannot be confirmed without payment`, async () => {
    const { updateAppointmentStatus, state } = await loadStatusAction();
    state.appointment = {
      id: "appointment-1",
      doctorId: "doctor-1",
      status: "SCHEDULED",
      startTime: new Date(Date.now() + 60 * 60 * 1000),
      endTime: new Date(Date.now() + 80 * 60 * 1000),
      ...appointment,
    };
    const formData = new Map([ ["appointmentId", "appointment-1"], ["status", "CONFIRMED"] ]);

    await assert.rejects(updateAppointmentStatus(formData), /payment (record is required|is required)/);
    assert.equal(state.transactions, 0);
  });
}

test("doctor can confirm a paid online appointment and cash-due offline appointment", async () => {
  for (const appointment of [
    {
      consultationMode: "ONLINE",
      payment: { method: "ONLINE", status: "PAID", verifiedAt: new Date() },
    },
    {
      consultationMode: "OFFLINE",
      payment: { method: "CASH", status: "CASH_DUE", verifiedAt: null },
    },
  ]) {
    const { updateAppointmentStatus, state } = await loadStatusAction();
    state.appointment = {
      id: "appointment-1",
      doctorId: "doctor-1",
      status: "SCHEDULED",
      startTime: new Date(Date.now() + 60 * 60 * 1000),
      endTime: new Date(Date.now() + 80 * 60 * 1000),
      ...appointment,
    };
    const formData = new Map([ ["appointmentId", "appointment-1"], ["status", "CONFIRMED"] ]);

    await updateAppointmentStatus(formData);
    assert.equal(state.transactions, 1);
    if (appointment.payment.method === "CASH") assert.equal(state.appointment.payment.status, "CASH_DUE");
  }
});
