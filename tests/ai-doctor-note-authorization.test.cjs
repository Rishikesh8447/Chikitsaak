const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "ai.js"), "utf8");

async function loadAction({ authenticated = true, user, appointment }) {
  const source = await sourcePromise;
  const state = { userQueries: [], appointmentQueries: [], aiCalls: 0 };
  const dependencies = {
    auth: async () => ({ userId: authenticated ? "clerk-user" : null }),
    db: {
      user: { findUnique: async (query) => { state.userQueries.push(query); return user || null; } },
      appointment: { findUnique: async (query) => { state.appointmentQueries.push(query); return appointment || null; } },
    },
    z: { array: () => chain(), string: () => chain(), object: (value) => ({ shape: value }) },
    requestStructuredAi: async () => { state.aiCalls += 1; return { consultationSummary: "Draft" }; },
  };
  function chain() {
    const result = {
      trim: () => result, min: () => result, max: () => result, nullable: () => result,
      default: () => result,
    };
    return result;
  }
  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { z } from "zod";', "const { z } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { requestStructuredAi } from "@/lib/ai";', "const { requestStructuredAi } = dependencies;")
    .replace("export async function generatePatientAiSummary", "async function generatePatientAiSummary")
    .replace("export async function generateDoctorNoteDraft", "async function generateDoctorNoteDraft")
    .concat("\nreturn { generateDoctorNoteDraft };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function form(appointmentId = "appointment-1") {
  return new Map([['appointmentId', appointmentId], ['consultationInformation', 'Patient reports improvement']]);
}

const authorizedAppointment = { patientDescription: "Headache", aiSummary: "Prior symptoms", notes: null };

test("verified doctor can generate a draft for their assigned appointment", async () => {
  const { generateDoctorNoteDraft, state } = await loadAction({
    user: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
    appointment: authorizedAppointment,
  });
  const result = await generateDoctorNoteDraft(form());
  assert.equal(result.success, true);
  assert.equal(state.userQueries[0].select.verificationStatus, true);
  assert.deepEqual(state.appointmentQueries[0].where, { id: "appointment-1", doctorId: "doctor-1" });
  assert.equal(state.aiCalls, 1);
});

for (const verificationStatus of ["PENDING", "REJECTED"]) {
  test(`${verificationStatus} doctor cannot generate a draft`, async () => {
    const { generateDoctorNoteDraft, state } = await loadAction({
      user: { id: "doctor-1", role: "DOCTOR", verificationStatus },
      appointment: authorizedAppointment,
    });
    assert.deepEqual(await generateDoctorNoteDraft(form()), { error: "Unauthorized" });
    assert.equal(state.appointmentQueries.length, 0);
    assert.equal(state.aiCalls, 0);
  });
}

test("patient cannot generate a doctor note draft", async () => {
  const { generateDoctorNoteDraft, state } = await loadAction({
    user: { id: "patient-1", role: "PATIENT", verificationStatus: null },
    appointment: authorizedAppointment,
  });
  assert.deepEqual(await generateDoctorNoteDraft(form()), { error: "Unauthorized" });
  assert.equal(state.appointmentQueries.length, 0);
  assert.equal(state.aiCalls, 0);
});

test("unauthenticated caller cannot generate a doctor note draft", async () => {
  const { generateDoctorNoteDraft, state } = await loadAction({
    authenticated: false,
    user: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
    appointment: authorizedAppointment,
  });
  assert.deepEqual(await generateDoctorNoteDraft(form()), { error: "Unauthorized" });
  assert.equal(state.userQueries.length, 0);
  assert.equal(state.appointmentQueries.length, 0);
  assert.equal(state.aiCalls, 0);
});

test("verified doctor cannot generate a draft for another doctor's appointment", async () => {
  const { generateDoctorNoteDraft, state } = await loadAction({
    user: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
    appointment: null,
  });
  assert.deepEqual(await generateDoctorNoteDraft(form()), { error: "Appointment not found or not authorized" });
  assert.deepEqual(state.appointmentQueries[0].where, { id: "appointment-1", doctorId: "doctor-1" });
  assert.equal(state.aiCalls, 0);
});
