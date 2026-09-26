const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const lifecycleModule = import("../lib/appointment-lifecycle.mjs");
const cancellationModule = import("../lib/appointment-cancellation.mjs");

const sourcePromise = readFile(join(cwd(), "actions", "doctor.js"), "utf8");

async function loadStatusAction() {
  const source = await sourcePromise;
  const state = { appointmentReads: 0, transactions: 0 };
  const dependencies = {
    db: {
      user: { findUnique: async () => ({ id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" }) },
      appointment: { findUnique: async () => { state.appointmentReads += 1; return null; } },
      $transaction: async () => { state.transactions += 1; },
    },
    auth: async () => ({ userId: "clerk-doctor" }),
    revalidatePath: () => {},
    createAppointmentNotificationPair: async () => {},
    ...(await lifecycleModule),
    ...(await cancellationModule),
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
