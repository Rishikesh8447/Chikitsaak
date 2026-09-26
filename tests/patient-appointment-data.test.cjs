const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "patient.js"), "utf8");

async function loadAction({ userId = "clerk-a", user = { id: "patient-a" } } = {}) {
  const source = await sourcePromise;
  const state = { userQueries: [], appointmentQueries: [] };
  const dependencies = {
    auth: async () => ({ userId }),
    db: {
      user: { findUnique: async (query) => { state.userQueries.push(query); return user; } },
      appointment: { findMany: async (query) => { state.appointmentQueries.push(query); return []; } },
    },
  };
  const transformed = source
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace("export async function getPatientAppointments", "async function getPatientAppointments")
    .concat("\nreturn { getPatientAppointments };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

test("patient appointment records are scoped to the authenticated persisted patient", async () => {
  const { getPatientAppointments, state } = await loadAction();
  await getPatientAppointments("patient-b");
  assert.deepEqual(state.userQueries[0].where, { clerkUserId: "clerk-a", role: "PATIENT" });
  const query = state.appointmentQueries[0];
  assert.deepEqual(query.where, { patientId: "patient-a" });
  assert.equal(query.select.videoSessionId, undefined);
  assert.equal(query.select.aiSummary, undefined);
  assert.equal(query.select.aiSpecialtySuggestion, undefined);
  assert.equal(query.select.patientId, undefined);
  assert.deepEqual(query.select.review, { select: { id: true, rating: true, comment: true } });
  assert.equal(query.select.prescription, undefined);
});

test("unauthenticated patient appointment request is rejected", async () => {
  const { getPatientAppointments, state } = await loadAction({ userId: null });
  await assert.rejects(getPatientAppointments(), /Unauthorized/);
  assert.equal(state.userQueries.length, 0);
  assert.equal(state.appointmentQueries.length, 0);
});
