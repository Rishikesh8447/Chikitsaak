const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "medical.js"), "utf8");

async function loadActions({
  user = { id: "patient-a", clerkUserId: "clerk-a", role: "PATIENT", verificationStatus: null },
  appointment = { id: "appointment-a", patientId: "patient-a", doctorId: "doctor-a", status: "COMPLETED", patient: { id: "patient-a" }, doctor: { id: "doctor-a", name: "Dr A" } },
  existingPrescription = null,
  storedPrescription = { id: "prescription-a", appointmentId: "appointment-a", patientId: "patient-a", doctorId: "doctor-a", diagnosis: "Diagnosis", medicines: [] },
} = {}) {
  const source = await sourcePromise;
  const state = { userQueries: [], appointmentQueries: [], prescriptionQueries: [], updates: [], creates: [], notifications: [] };
  const ownsPrescription = (where) => storedPrescription
    && where.appointmentId === storedPrescription.appointmentId
    && (where.patientId === storedPrescription.patientId || where.doctorId === storedPrescription.doctorId);
  const tx = {
    appointment: { findUnique: async (query) => { state.appointmentQueries.push(query); return query.where.id === appointment?.id ? appointment : null; } },
    prescription: {
      findUnique: async () => existingPrescription,
      create: async (query) => { state.creates.push(query); return { ...query.data, id: "created-prescription", medicines: query.data.medicines.create }; },
    },
    notification: { createMany: async (query) => { state.notifications.push(query); return { count: query.data.length }; } },
  };
  const dependencies = {
    auth: async () => ({ userId: user?.clerkUserId || null }),
    revalidatePath() {},
    createNotification: async (transaction, data) => transaction.notification.createMany({ data: [data] }),
    db: {
      user: {
        findUnique: async (query) => {
          state.userQueries.push(query);
          if (query.where.clerkUserId) return user;
          return query.where.id === user?.id ? { bloodGroup: null, allergies: null, existingConditions: null, currentMedications: null } : null;
        },
        update: async (query) => { state.updates.push(query); return { id: user.id }; },
      },
      appointment: { findMany: async (query) => { state.appointmentQueries.push(query); return [{ id: "appointment-a" }]; } },
      prescription: {
        findMany: async (query) => { state.prescriptionQueries.push(query); return [storedPrescription]; },
        findFirst: async (query) => { state.prescriptionQueries.push(query); return ownsPrescription(query.where) ? storedPrescription : null; },
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
    .replaceAll("export async function", "async function")
    .concat("\nreturn { createPrescription, getMyMedicalRecords, updateMedicalProfile, getAppointmentPrescription };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function prescriptionForm(extra = []) {
  return new Map([
    ["appointmentId", "appointment-a"],
    ["diagnosis", "Consultation diagnosis"],
    ["generalInstructions", "Follow up"],
    ["medicines", JSON.stringify([{ name: "Medicine", dosage: "1 tablet", frequency: "daily", duration: "5 days", instructions: "After meals" }])],
    ...extra,
  ]);
}

test("patient medical history is scoped to persisted patient identity and returns only page fields", async () => {
  const { getMyMedicalRecords, state } = await loadActions();
  await getMyMedicalRecords("patient-b");
  const appointmentQuery = state.appointmentQueries[0];
  assert.deepEqual(appointmentQuery.where, { patientId: "patient-a" });
  assert.deepEqual(appointmentQuery.select, {
    id: true,
    startTime: true,
    status: true,
    notes: true,
    doctor: { select: { name: true, specialty: true } },
  });
  assert.equal(appointmentQuery.select.videoSessionId, undefined);
  assert.deepEqual(state.prescriptionQueries[0].where, { patientId: "patient-a" });
});

test("non-patient cannot read patient medical history", async () => {
  const { getMyMedicalRecords, state } = await loadActions({ user: { id: "doctor-a", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "VERIFIED" } });
  await assert.rejects(getMyMedicalRecords(), /Only patients can access medical records/);
  assert.equal(state.appointmentQueries.length, 0);
});

test("patient can update only their own medical profile regardless of submitted IDs", async () => {
  const { updateMedicalProfile, state } = await loadActions();
  await updateMedicalProfile(new Map([["patientId", "patient-b"], ["allergies", "Pollen"]]));
  assert.deepEqual(state.updates[0].where, { id: "patient-a" });
  assert.equal(state.updates[0].data.allergies, "Pollen");
  assert.equal(state.updates[0].data.bloodGroup, null);
});

test("doctor cannot update a patient's medical profile", async () => {
  const { updateMedicalProfile, state } = await loadActions({ user: { id: "doctor-a", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "VERIFIED" } });
  await assert.rejects(updateMedicalProfile(new Map([["allergies", "Pollen"]])), /Only patients can update medical profiles/);
  assert.equal(state.updates.length, 0);
});

test("verified doctor can create a prescription for their own active consultation", async () => {
  const { createPrescription, state } = await loadActions({ user: { id: "doctor-a", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "VERIFIED" }, appointment: { id: "appointment-a", patientId: "patient-a", doctorId: "doctor-a", status: "IN_PROGRESS", patient: {}, doctor: { name: "Dr A" } } });
  const result = await createPrescription(prescriptionForm([["patientId", "patient-b"], ["doctorId", "doctor-b"]]));
  assert.equal(result.success, true);
  assert.equal(state.creates[0].data.patientId, "patient-a");
  assert.equal(state.creates[0].data.doctorId, "doctor-a");
  assert.equal(state.notifications[0].data[0].userId, "patient-a");
});

test("patient cannot create a prescription", async () => {
  const { createPrescription, state } = await loadActions();
  await assert.rejects(createPrescription(prescriptionForm()), /Only doctors can create prescriptions/);
  assert.equal(state.creates.length, 0);
});

test("unverified doctor cannot create a prescription", async () => {
  const { createPrescription, state } = await loadActions({ user: { id: "doctor-a", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "PENDING" } });
  await assert.rejects(createPrescription(prescriptionForm()), /Doctor verification is required/);
  assert.equal(state.creates.length, 0);
});

test("another doctor cannot create a prescription for the assigned doctor's appointment", async () => {
  const { createPrescription, state } = await loadActions({ user: { id: "doctor-b", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "VERIFIED" } });
  await assert.rejects(createPrescription(prescriptionForm()), /Failed to create prescription/);
  assert.equal(state.creates.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("duplicate prescription is not created", async () => {
  const { createPrescription, state } = await loadActions({ user: { id: "doctor-a", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "VERIFIED" }, existingPrescription: { id: "existing" } });
  await assert.rejects(createPrescription(prescriptionForm()), /Failed to create prescription/);
  assert.equal(state.creates.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("patient can retrieve their own prescription", async () => {
  const { getAppointmentPrescription, state } = await loadActions();
  const result = await getAppointmentPrescription("appointment-a");
  assert.equal(result.prescription.id, "prescription-a");
  assert.deepEqual(state.prescriptionQueries[0].where, { appointmentId: "appointment-a", patientId: "patient-a" });
});

test("unrelated patient cannot retrieve another patient's prescription", async () => {
  const { getAppointmentPrescription, state } = await loadActions({ user: { id: "patient-b", clerkUserId: "clerk-b", role: "PATIENT", verificationStatus: null } });
  await assert.rejects(getAppointmentPrescription("appointment-a"), /Prescription not found/);
  assert.deepEqual(state.prescriptionQueries[0].where, { appointmentId: "appointment-a", patientId: "patient-b" });
});

test("verified assigned doctor can retrieve a prescription", async () => {
  const { getAppointmentPrescription, state } = await loadActions({ user: { id: "doctor-a", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "VERIFIED" } });
  const result = await getAppointmentPrescription("appointment-a");
  assert.equal(result.prescription.id, "prescription-a");
  assert.deepEqual(state.prescriptionQueries[0].where, { appointmentId: "appointment-a", doctorId: "doctor-a" });
});

test("unverified or unrelated doctor cannot retrieve a prescription", async (t) => {
  await t.test("unverified assigned doctor", async () => {
    const { getAppointmentPrescription, state } = await loadActions({ user: { id: "doctor-a", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "REJECTED" } });
    await assert.rejects(getAppointmentPrescription("appointment-a"), /Unauthorized/);
    assert.equal(state.prescriptionQueries.length, 0);
  });
  await t.test("different verified doctor", async () => {
    const { getAppointmentPrescription, state } = await loadActions({ user: { id: "doctor-b", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "VERIFIED" } });
    await assert.rejects(getAppointmentPrescription("appointment-a"), /Prescription not found/);
    assert.deepEqual(state.prescriptionQueries[0].where, { appointmentId: "appointment-a", doctorId: "doctor-b" });
  });
});

test("admin and unassigned users cannot retrieve prescriptions", async () => {
  for (const role of ["ADMIN", "UNASSIGNED"]) {
    const { getAppointmentPrescription, state } = await loadActions({ user: { id: `${role.toLowerCase()}-a`, clerkUserId: "clerk-a", role, verificationStatus: null } });
    await assert.rejects(getAppointmentPrescription("appointment-a"), /Unauthorized/);
    assert.equal(state.prescriptionQueries.length, 0);
  }
});
