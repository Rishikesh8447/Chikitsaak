const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadMedicalActions({
  user = { id: "pat-1", clerkUserId: "clerk-pat-1", role: "PATIENT", verificationStatus: null, name: "Patient One" },
  appointment = { id: "appt-1", patientId: "pat-1", doctorId: "doc-1", status: "COMPLETED", patient: { name: "Patient One" }, doctor: { name: "Dr. Sharma" } },
  existingPrescription = null,
  existingReview = null,
} = {}) {
  const source = await readFile(join(process.cwd(), "actions", "medical.js"), "utf8");
  const state = {
    prescriptionCreates: [],
    reviewCreates: [],
    notifications: [],
  };

  const tx = {
    appointment: { findUnique: async () => appointment },
    prescription: {
      findUnique: async () => existingPrescription,
      create: async (query) => {
        state.prescriptionCreates.push(query);
        return { ...query.data, id: "created-prescription", medicines: query.data.medicines.create };
      },
    },
    review: {
      findUnique: async () => existingReview,
      create: async (query) => {
        if (existingReview) {
          const err = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        state.reviewCreates.push(query);
        return { ...query.data, id: "created-review" };
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
    .concat("\nreturn { createPrescription, createReview, getAppointmentPrescription };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function makeReviewForm(extra = []) {
  return new Map([
    ["appointmentId", "appt-1"],
    ["rating", "5"],
    ["comment", "Excellent and thorough consultation."],
    ...extra,
  ]);
}

function makePrescriptionForm(extra = []) {
  return new Map([
    ["appointmentId", "appt-1"],
    ["diagnosis", "Acute pharyngitis"],
    ["generalInstructions", "Drink warm fluids and avoid cold exposure."],
    ["medicines", JSON.stringify([{ name: "Azithromycin 500mg", dosage: "1 tablet", frequency: "OD", duration: "3 days", instructions: "After food" }])],
    ...extra,
  ]);
}

test("createReview: patient can review completed consultation with rating and feedback", async () => {
  const { createReview, state } = await loadMedicalActions();
  const result = await createReview(makeReviewForm());
  assert.equal(result.success, true);
  assert.equal(state.reviewCreates.length, 1);
  assert.equal(state.reviewCreates[0].data.rating, 5);
  assert.equal(state.reviewCreates[0].data.comment, "Excellent and thorough consultation.");
  assert.equal(state.reviewCreates[0].data.doctorId, "doc-1");
  assert.equal(state.reviewCreates[0].data.patientId, "pat-1");
});

test("createReview: non-patient cannot create reviews", async () => {
  const doctorUser = { id: "doc-1", clerkUserId: "clerk-doc-1", role: "DOCTOR", verificationStatus: "VERIFIED" };
  const { createReview, state } = await loadMedicalActions({ user: doctorUser });
  await assert.rejects(createReview(makeReviewForm()), /Only patients can leave reviews/);
  assert.equal(state.reviewCreates.length, 0);
});

test("createReview: uncompleted consultation cannot be reviewed", async () => {
  const inProgressAppt = { id: "appt-1", patientId: "pat-1", doctorId: "doc-1", status: "IN_PROGRESS" };
  const { createReview, state } = await loadMedicalActions({ appointment: inProgressAppt });
  await assert.rejects(createReview(makeReviewForm()), /Only completed consultations can be reviewed/);
  assert.equal(state.reviewCreates.length, 0);
});

test("createReview: patient cannot review another patient's appointment", async () => {
  const differentPatientAppt = { id: "appt-1", patientId: "pat-other", doctorId: "doc-1", status: "COMPLETED" };
  const { createReview, state } = await loadMedicalActions({ appointment: differentPatientAppt });
  await assert.rejects(createReview(makeReviewForm()), /You are not authorized to review this appointment/);
  assert.equal(state.reviewCreates.length, 0);
});

test("createReview: duplicate review for the same appointment is rejected with clear message", async () => {
  const { createReview, state } = await loadMedicalActions({ existingReview: { id: "existing-rev-1" } });
  await assert.rejects(createReview(makeReviewForm()), /You have already reviewed this consultation/);
  assert.equal(state.reviewCreates.length, 0);
});

test("createReview: invalid rating rejected", async () => {
  const { createReview } = await loadMedicalActions();
  await assert.rejects(createReview(makeReviewForm([["rating", "6"]])), /Choose an integer rating from 1 to 5/);
  await assert.rejects(createReview(makeReviewForm([["rating", "0"]])), /Choose an integer rating from 1 to 5/);
  await assert.rejects(createReview(makeReviewForm([["rating", "abc"]])), /Choose an integer rating from 1 to 5/);
});

test("createPrescription: includes recommended tests in instructions without placing paid lab orders", async () => {
  const doctorUser = { id: "doc-1", clerkUserId: "clerk-doc-1", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Dr. Sharma" };
  const { createPrescription, state } = await loadMedicalActions({ user: doctorUser });

  const result = await createPrescription(makePrescriptionForm([
    ["testsAdvised", "Complete Blood Count (CBC), Fasting Blood Sugar"],
    ["followUpRequired", "true"],
    ["followUpDays", "2"],
  ]));

  assert.equal(result.success, true);
  assert.equal(state.prescriptionCreates.length, 1);
  const created = state.prescriptionCreates[0].data;
  assert.match(created.generalInstructions, /Recommended Laboratory Tests:\s*Complete Blood Count \(CBC\), Fasting Blood Sugar/);
  assert.equal(created.followUpRequired, true);
  assert.equal(created.followUpDays, 2);
  assert.equal(created.medicines.create.length, 1);
  assert.equal(created.medicines.create[0].name, "Azithromycin 500mg");
});

test("createPrescription: supports acute 2-day and 3-day follow-up recommendations", async () => {
  const doctorUser = { id: "doc-1", clerkUserId: "clerk-doc-1", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Dr. Sharma" };

  for (const interval of [2, 3]) {
    const { createPrescription, state } = await loadMedicalActions({ user: doctorUser });
    const result = await createPrescription(makePrescriptionForm([
      ["followUpRequired", "true"],
      ["followUpDays", String(interval)],
    ]));
    assert.equal(result.success, true);
    assert.equal(state.prescriptionCreates[0].data.followUpDays, interval);
  }
});
