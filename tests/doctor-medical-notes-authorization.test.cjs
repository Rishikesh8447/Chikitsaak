const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "doctor.js"), "utf8");

async function loadAction({ user = { id: "doctor-a", role: "DOCTOR", verificationStatus: "VERIFIED" }, appointmentOwner = "doctor-a" } = {}) {
  const source = await sourcePromise;
  const state = { appointmentQueries: [], updates: [] };
  const dependencies = {
    auth: async () => ({ userId: "clerk-a" }),
    revalidatePath() {},
    createAppointmentNotificationPair: async () => {},
    canTransitionAppointment: () => false,
    cancelAppointmentInTransaction: async () => {},
    CANCELLATION_ERRORS: {},
    db: {
      user: {
        findUnique: async ({ where }) => user
          && (!where.role || where.role === user.role)
          && (!where.verificationStatus || where.verificationStatus === user.verificationStatus)
          ? user
          : null,
      },
      appointment: {
        findUnique: async (query) => {
          state.appointmentQueries.push(query);
          return query.where.doctorId === appointmentOwner ? { id: "appointment-a" } : null;
        },
        update: async (query) => { state.updates.push(query); return { id: "appointment-a", ...query.data }; },
      },
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
    .replaceAll("export async function", "async function")
    .concat("\nreturn { addAppointmentNotes };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

test("verified doctor can update notes for their assigned appointment", async () => {
  const { addAppointmentNotes, state } = await loadAction();
  const result = await addAppointmentNotes(new Map([["appointmentId", "appointment-a"], ["notes", "Clinical notes"]]));
  assert.deepEqual(result, { success: true });
  assert.deepEqual(state.appointmentQueries[0].where, { id: "appointment-a", doctorId: "doctor-a" });
  assert.deepEqual(state.updates[0].where, { id: "appointment-a" });
  assert.equal(state.updates[0].data.notes, "Clinical notes");
});

test("patient cannot update doctor notes", async () => {
  const { addAppointmentNotes, state } = await loadAction({ user: { id: "patient-a", role: "PATIENT", verificationStatus: null } });
  await assert.rejects(addAppointmentNotes(new Map([["appointmentId", "appointment-a"], ["notes", "Injected"]])), /Failed to update notes/);
  assert.equal(state.appointmentQueries.length, 0);
  assert.equal(state.updates.length, 0);
});

test("verified doctor cannot update another doctor's notes", async () => {
  const { addAppointmentNotes, state } = await loadAction({ appointmentOwner: "doctor-b" });
  await assert.rejects(addAppointmentNotes(new Map([["appointmentId", "appointment-a"], ["notes", "Injected"]])), /Failed to update notes/);
  assert.deepEqual(state.appointmentQueries[0].where, { id: "appointment-a", doctorId: "doctor-a" });
  assert.equal(state.updates.length, 0);
});

test("unverified doctor cannot update notes", async () => {
  const { addAppointmentNotes, state } = await loadAction({ user: { id: "doctor-a", role: "DOCTOR", verificationStatus: "PENDING" } });
  await assert.rejects(addAppointmentNotes(new Map([["appointmentId", "appointment-a"], ["notes", "Injected"]])), /Failed to update notes/);
  assert.equal(state.appointmentQueries.length, 0);
  assert.equal(state.updates.length, 0);
});
