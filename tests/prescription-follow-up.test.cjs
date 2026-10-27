const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadActions({
  user = { id: "doctor-1", clerkUserId: "clerk-doc-1", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Sharma" },
  appointment = { id: "appt-1", patientId: "pat-1", doctorId: "doctor-1", status: "COMPLETED", patient: {}, doctor: { name: "Dr. Sharma" } },
  existingPrescription = null,
} = {}) {
  const source = await readFile(join(process.cwd(), "actions", "medical.js"), "utf8");
  const state = {
    creates: [],
    notifications: [],
  };

  const tx = {
    appointment: { findUnique: async () => appointment },
    prescription: {
      findUnique: async () => existingPrescription,
      create: async (query) => {
        state.creates.push(query);
        return { ...query.data, id: "created-prescription", medicines: query.data.medicines.create };
      },
    },
    notification: {
      createMany: async (query) => {
        state.notifications.push(query);
        return { count: query.data.length };
      },
    },
  };

  const dependencies = {
    auth: async () => ({ userId: user?.clerkUserId || null }),
    revalidatePath() {},
    createNotification: async (transaction, data) => transaction.notification.createMany({ data: [data] }),
    db: {
      user: {
        findUnique: async (query) => {
          if (query.where.clerkUserId) return user;
          return query.where.id === user?.id ? user : null;
        },
      },
      $transaction: async (callback) => callback(tx),
    },
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { createNotification } from "@/lib/notifications";', "const { createNotification } = dependencies;")
    .replace('import { sendPrescriptionAvailableEmail } from "@/lib/email";', "const sendPrescriptionAvailableEmail = dependencies.sendPrescriptionAvailableEmail || (async () => {});")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { createPrescription };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function makePrescriptionForm(extra = []) {
  return new Map([
    ["appointmentId", "appt-1"],
    ["diagnosis", "Viral fever"],
    ["generalInstructions", "Hydrate well and rest"],
    ["medicines", JSON.stringify([{ name: "Paracetamol", dosage: "500mg", frequency: "TID", duration: "3 days", instructions: "After food" }])],
    ...extra,
  ]);
}

test("createPrescription persists followUpRequired false and followUpDays null when toggle is off", async () => {
  const { createPrescription, state } = await loadActions();
  const result = await createPrescription(makePrescriptionForm());
  assert.equal(result.success, true);
  assert.equal(state.creates[0].data.followUpRequired, false);
  assert.equal(state.creates[0].data.followUpDays, null);
  assert.equal(state.notifications[0].data[0].title, "New prescription available");
  assert.doesNotMatch(state.notifications[0].data[0].message, /Recommended follow-up/);
});

test("createPrescription persists followUpRequired true and supported interval when toggle is on", async () => {
  const { createPrescription, state } = await loadActions();
  const result = await createPrescription(makePrescriptionForm([
    ["followUpRequired", "true"],
    ["followUpDays", "14"],
  ]));
  assert.equal(result.success, true);
  assert.equal(state.creates[0].data.followUpRequired, true);
  assert.equal(state.creates[0].data.followUpDays, 14);
  assert.equal(state.notifications[0].data[0].title, "Prescription & Follow-up recommended");
  assert.match(state.notifications[0].data[0].message, /Recommended follow-up within 14 days \(included at ₹0\)/);
});

test("createPrescription supports all standard intervals: 3, 7, 14, 21, 30, 60, 90", async () => {
  const supported = [3, 7, 14, 21, 30, 60, 90];
  for (const days of supported) {
    const { createPrescription, state } = await loadActions();
    const result = await createPrescription(makePrescriptionForm([
      ["followUpRequired", "on"],
      ["followUpDays", String(days)],
    ]));
    assert.equal(result.success, true);
    assert.equal(state.creates[0].data.followUpRequired, true);
    assert.equal(state.creates[0].data.followUpDays, days);
  }
});

test("createPrescription rejects invalid interval when follow-up is enabled", async () => {
  const { createPrescription, state } = await loadActions();
  await assert.rejects(
    createPrescription(makePrescriptionForm([
      ["followUpRequired", "true"],
      ["followUpDays", "45"], // 45 is not in supported list [3, 7, 14, 21, 30, 60, 90]
    ])),
    /Please select a valid follow-up interval/
  );
  assert.equal(state.creates.length, 0);
});

test("createPrescription rejects non-integer or missing interval when follow-up is enabled", async () => {
  const { createPrescription, state } = await loadActions();
  await assert.rejects(
    createPrescription(makePrescriptionForm([
      ["followUpRequired", "true"],
      ["followUpDays", "abc"],
    ])),
    /Please select a valid follow-up interval/
  );
  assert.equal(state.creates.length, 0);
});
