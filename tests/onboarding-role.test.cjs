const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "onboarding.js"), "utf8");
const roleAssignmentPromise = import("../lib/onboarding-role-assignment.mjs");
const doctorValidationPromise = import("../lib/doctor-onboarding-validation.mjs");

async function loadAction({ role, authenticated = true, updateCount = 1 }) {
  const [source, roleAssignment, doctorValidation] = await Promise.all([sourcePromise, roleAssignmentPromise, doctorValidationPromise]);
  const state = { role, updates: [], revalidated: [] };
  const db = {
    user: {
      updateMany: async (args) => {
        state.updates.push(args);
        if (updateCount) Object.assign(state, args.data);
        return { count: updateCount };
      },
    },
  };
  const auth = async () => ({ userId: authenticated ? "clerk-user" : null });
  const checkUser = async () => ({ clerkUserId: "clerk-user", role: state.role });
  const revalidatePath = (path) => state.revalidated.push(path);
  const transformed = source
    .replaceAll('"use server"', "")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { checkUser } from "@/lib/checkUser";', "const { checkUser } = dependencies;")
    .replace('import { assertInitialRoleAssignment, persistInitialRoleAssignment, ROLE_ALREADY_ASSIGNED } from "@/lib/onboarding-role-assignment.mjs";', "const { assertInitialRoleAssignment, persistInitialRoleAssignment, ROLE_ALREADY_ASSIGNED } = dependencies;")
    .replace('import { validateInitialDoctorProfile } from "@/lib/doctor-onboarding-validation.mjs";', "const { validateInitialDoctorProfile } = dependencies;")
    .replace("export async function setUserRole", "async function setUserRole")
    .replace("export async function resubmitDoctorProfile", "async function resubmitDoctorProfile")
    .replace("export async function getCurrentUser", "async function getCurrentUser")
    .concat("\nreturn { setUserRole };");
  const factory = new Function("dependencies", transformed);
  return { ...(factory({ db, auth, checkUser, revalidatePath, ...roleAssignment, ...doctorValidation })), state };
}

function patientForm() {
  return new Map([['role', 'PATIENT']]);
}

function doctorForm() {
  return new Map([
    ['role', 'DOCTOR'], ['specialty', 'Cardiology'], ['experience', '8'],
    ['credentialUrl', 'https://example.test/credential'], ['description', 'Experienced cardiology care provider'],
    ['city', 'Indore'], ['state', 'Madhya Pradesh'], ['country', 'India'],
  ]);
}

test("unassigned patient can select PATIENT", async () => {
  const { setUserRole, state } = await loadAction({ role: "UNASSIGNED" });
  assert.deepEqual(await setUserRole(patientForm()), { success: true, redirect: "/doctors" });
  assert.equal(state.updates[0].where.role, "UNASSIGNED");
  assert.equal(state.updates[0].data.role, "PATIENT");
});

test("unassigned doctor can select DOCTOR and remains pending verification", async () => {
  const { setUserRole, state } = await loadAction({ role: "UNASSIGNED" });
  assert.deepEqual(await setUserRole(doctorForm()), { success: true, redirect: "/doctor/verification" });
  assert.equal(state.updates[0].where.role, "UNASSIGNED");
  assert.equal(state.updates[0].data.role, "DOCTOR");
  assert.equal(state.updates[0].data.verificationStatus, "PENDING");
});

for (const [existingRole, requestedRole] of [["PATIENT", "DOCTOR"], ["DOCTOR", "PATIENT"], ["ADMIN", "PATIENT"], ["ADMIN", "DOCTOR"]]) {
  test(`${existingRole} cannot change role to ${requestedRole}`, async () => {
    const { setUserRole, state } = await loadAction({ role: existingRole });
    const form = requestedRole === "DOCTOR" ? doctorForm() : patientForm();
    await assert.rejects(setUserRole(form), /Role has already been assigned/);
    assert.equal(state.updates.length, 0);
  });
}

test("doctor role assignment rejects malformed profile data before persistence", async () => {
  for (const [field, value] of [["experience", "8years"], ["experience", "0"], ["experience", "71"], ["credentialUrl", "javascript:alert(1)"], ["description", "too short"]]) {
    const { setUserRole, state } = await loadAction({ role: "UNASSIGNED" });
    const form = doctorForm();
    form.set(field, value);
    await assert.rejects(setUserRole(form), /Failed to update user profile/);
    assert.equal(state.updates.length, 0, field);
  }
});

test("unauthenticated caller retains the existing Unauthorized rejection", async () => {
  const { setUserRole, state } = await loadAction({ role: "UNASSIGNED", authenticated: false });
  await assert.rejects(setUserRole(patientForm()), /Unauthorized/);
  assert.equal(state.updates.length, 0);
});

test("role assignment rejects a lost race after the initial UNASSIGNED read", async () => {
  const { setUserRole, state } = await loadAction({ role: "UNASSIGNED", updateCount: 0 });
  await assert.rejects(setUserRole(patientForm()), /Role has already been assigned/);
  assert.equal(state.updates[0].where.role, "UNASSIGNED");
});
