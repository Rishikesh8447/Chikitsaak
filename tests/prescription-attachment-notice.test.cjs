const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadMedicalActions({
  user = { id: "pat-1", clerkUserId: "clerk-pat-1", role: "PATIENT", verificationStatus: null, name: "Patient One" },
  appointment = { id: "appt-1", patientId: "pat-1", doctorId: "doc-1", status: "COMPLETED", patient: { name: "Patient One" }, doctor: { name: "Dr. Sharma" } },
  existingPrescription = null,
} = {}) {
  const source = await readFile(join(process.cwd(), "actions", "medical.js"), "utf8");
  const state = {
    prescriptionCreates: [],
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
    .concat("\nreturn { createPrescription, getAppointmentPrescription };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function makePrescriptionForm(extra = []) {
  return new Map([
    ["appointmentId", "appt-1"],
    ["diagnosis", "Seasonal Allergic Rhinitis"],
    ["generalInstructions", "Avoid allergen triggers and stay hydrated."],
    ["testsAdvised", "Absolute Eosinophil Count (AEC)"],
    ["medicines", JSON.stringify([{ name: "Levocetirizine 5mg", dosage: "1 tablet", frequency: "OD at bedtime", duration: "7 days", instructions: "After dinner" }])],
    ["followUpRequired", "true"],
    ["followUpDays", "7"],
    ...extra,
  ]);
}

test("PrescriptionForm UI contract: non-functional upload and optimistic attachments are removed", async () => {
  const source = await readFile(join(process.cwd(), "components", "prescription-form.jsx"), "utf8");

  // 1. Must NOT contain file input element
  assert.doesNotMatch(source, /type=["']file["']/i, "PrescriptionForm must not render a file input element");

  // 2. Must NOT contain optimistic attached document UI or state
  assert.doesNotMatch(source, /attachedFileName/, "PrescriptionForm must not define or read attachedFileName");
  assert.doesNotMatch(source, /Attached Document:/, "PrescriptionForm must not render deceptive Attached Document badge");
  assert.doesNotMatch(source, /selectedFile/, "PrescriptionForm must not manage selectedFile state");

  // 3. Must contain professional notice explaining attachments are unavailable
  assert.match(source, /Prescription Document Attachments \(Unavailable\)/, "Must render unavailable title");
  assert.match(source, /secure storage integration has not been implemented/, "Must explain reason for unavailability");
  assert.match(source, /Please record all clinical findings, prescribed medicines, and test recommendations in the structured fields above/, "Must guide clinician to use structured fields");

  // 4. Must preserve core clinical form fields
  assert.match(source, /name="diagnosis"/, "Diagnosis field must be present");
  assert.match(source, /name="generalInstructions"/, "General instructions must be present");
  assert.match(source, /name="testsAdvised"/, "Tests advised must be present");
  assert.match(source, /name="followUpRequired"/, "Follow-up required checkbox must be present");
  assert.match(source, /name="followUpDays"/, "Follow-up days selector must be present");
});

test("createPrescription server action: creates digital prescription cleanly without attachments", async () => {
  const doctorUser = { id: "doc-1", clerkUserId: "clerk-doc-1", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Dr. Sharma" };
  const { createPrescription, state } = await loadMedicalActions({ user: doctorUser });

  const result = await createPrescription(makePrescriptionForm());

  assert.equal(result.success, true);
  assert.equal(state.prescriptionCreates.length, 1);
  const created = state.prescriptionCreates[0].data;
  assert.equal(created.diagnosis, "Seasonal Allergic Rhinitis");
  assert.match(created.generalInstructions, /Recommended Laboratory Tests:\s*Absolute Eosinophil Count \(AEC\)/);
  assert.equal(created.followUpRequired, true);
  assert.equal(created.followUpDays, 7);
  assert.equal(created.medicines.create.length, 1);
  assert.equal(created.medicines.create[0].name, "Levocetirizine 5mg");
});

test("createPrescription server action: enforces doctor authorization and verification", async () => {
  // Non-doctor
  const patientUser = { id: "pat-1", clerkUserId: "clerk-pat-1", role: "PATIENT", verificationStatus: null };
  const { createPrescription: createAsPatient } = await loadMedicalActions({ user: patientUser });
  await assert.rejects(createAsPatient(makePrescriptionForm()), /Only doctors can create prescriptions/);

  // Unverified doctor
  const pendingDoctor = { id: "doc-1", clerkUserId: "clerk-doc-1", role: "DOCTOR", verificationStatus: "PENDING" };
  const { createPrescription: createAsPending } = await loadMedicalActions({ user: pendingDoctor });
  await assert.rejects(createAsPending(makePrescriptionForm()), /Doctor verification is required to create prescriptions/);

  // Doctor not assigned to appointment
  const verifiedDoctor = { id: "doc-other", clerkUserId: "clerk-doc-other", role: "DOCTOR", verificationStatus: "VERIFIED" };
  const { createPrescription: createAsOtherDoctor } = await loadMedicalActions({ user: verifiedDoctor });
  await assert.rejects(createAsOtherDoctor(makePrescriptionForm()), /Failed to create prescription/);
});

