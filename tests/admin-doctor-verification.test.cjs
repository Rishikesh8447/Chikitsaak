const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "admin.js"), "utf8");

async function loadActions({ callerRole = "ADMIN", targetRole = "DOCTOR", targetStatus = "PENDING", failNotifications = false } = {}) {
  const source = await sourcePromise;
  const state = { updates: [], attempts: [], notifications: [], revalidated: [] };
  const dependencies = {
    auth: async () => ({ userId: "clerk-caller" }),
    clerkClient: async () => ({}),
    revalidatePath: (path) => state.revalidated.push(path),
    db: {
      $transaction: async (work) => {
        const previousStatus = targetStatus;
        const updateCount = state.updates.length;
        const notificationCount = state.notifications.length;
        try {
          return await work(dependencies.db);
        } catch (error) {
          targetStatus = previousStatus;
          state.updates.length = updateCount;
          state.notifications.length = notificationCount;
          throw error;
        }
      },
      user: {
        findUnique: async ({ where }) => where.clerkUserId === "clerk-caller"
          ? { id: "caller", role: callerRole }
          : { id: "target", role: targetRole, verificationStatus: targetStatus },
        updateMany: async (query) => {
          state.attempts.push(query);
          state.updates.push(query);
          const matches = query.where.id === "target"
            && query.where.role === targetRole
            && query.where.verificationStatus === targetStatus;
          if (matches) targetStatus = query.data.verificationStatus;
          return { count: matches ? 1 : 0 };
        },
      },
      notification: {
        createMany: async (query) => {
          if (failNotifications) throw new Error("sensitive database error detail");
          state.notifications.push(query);
        },
      },
    },
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replaceAll("export async function", "async function")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { clerkClient } from "@clerk/nextjs/server";', "const { clerkClient } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .concat("\nreturn { updateDoctorStatus, updateDoctorActiveStatus };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

function form(entries) {
  return new Map(entries);
}

test("admin can approve a pending doctor and records the notification", async () => {
  const { updateDoctorStatus, state } = await loadActions();
  assert.deepEqual(await updateDoctorStatus(form([["doctorId", "target"], ["status", "VERIFIED"]])), { success: true });
  assert.deepEqual(state.updates[0].where, { id: "target", role: "DOCTOR", verificationStatus: "PENDING" });
  assert.deepEqual(state.updates[0].data, { verificationStatus: "VERIFIED" });
  assert.equal(state.notifications.length, 1);
});

test("admin can reject a pending doctor", async () => {
  const { updateDoctorStatus, state } = await loadActions();
  assert.deepEqual(await updateDoctorStatus(form([["doctorId", "target"], ["status", "REJECTED"]])), { success: true });
  assert.deepEqual(state.updates[0].data, { verificationStatus: "REJECTED" });
  assert.match(state.notifications[0].data[0].message, /update your profile and resubmit/i);
});

test("verification status rolls back if its notification cannot be recorded", async () => {
  const { updateDoctorStatus, state } = await loadActions({ failNotifications: true });
  await assert.rejects(
    updateDoctorStatus(form([["doctorId", "target"], ["status", "VERIFIED"]])),
    /Failed to update doctor status/
  );
  assert.equal(state.updates.length, 0);
  assert.equal(state.attempts.length, 1);
  assert.equal(state.notifications.length, 0);
});

for (const [targetRole, targetStatus, requestedStatus] of [
  ["PATIENT", "PENDING", "VERIFIED"],
  ["ADMIN", "PENDING", "VERIFIED"],
  ["DOCTOR", "REJECTED", "VERIFIED"],
  ["DOCTOR", "VERIFIED", "REJECTED"],
]) {
  test(`admin verification cannot change ${targetRole}/${targetStatus} directly to ${requestedStatus}`, async () => {
    const { updateDoctorStatus, state } = await loadActions({ targetRole, targetStatus });
    await assert.rejects(
      updateDoctorStatus(form([["doctorId", "target"], ["status", requestedStatus]])),
      /Doctor is not awaiting verification/
    );
    assert.equal(state.updates.length, 0);
    assert.deepEqual(state.attempts[0].where, { id: "target", role: "DOCTOR", verificationStatus: "PENDING" });
    assert.equal(state.notifications.length, 0);
  });
}

test("non-admin cannot approve or reject a doctor", async () => {
  for (const callerRole of ["PATIENT", "DOCTOR", "UNASSIGNED"]) {
    const { updateDoctorStatus, state } = await loadActions({ callerRole });
    await assert.rejects(updateDoctorStatus(form([["doctorId", "target"], ["status", "VERIFIED"]])), /Unauthorized/);
    assert.equal(state.updates.length, 0);
    assert.equal(state.notifications.length, 0);
  }
});

test("admin verification rejects invalid status values before updating a target", async () => {
  const { updateDoctorStatus, state } = await loadActions();
  await assert.rejects(updateDoctorStatus(form([["doctorId", "target"], ["status", "PENDING"]])), /Invalid input/);
  assert.equal(state.updates.length, 0);
});

test("active-status action cannot suspend a patient", async () => {
  const { updateDoctorActiveStatus, state } = await loadActions({ targetRole: "PATIENT", targetStatus: "VERIFIED" });
  await assert.rejects(updateDoctorActiveStatus(form([["doctorId", "target"], ["suspend", "true"]])), /Failed to update doctor status/);
  assert.deepEqual(state.updates[0].where, { id: "target", role: "DOCTOR", verificationStatus: "VERIFIED" });
});

test("active-status action cannot reinstate a non-doctor", async () => {
  const { updateDoctorActiveStatus, state } = await loadActions({ targetRole: "PATIENT", targetStatus: "PENDING" });
  await assert.rejects(updateDoctorActiveStatus(form([["doctorId", "target"], ["suspend", "false"]])), /Failed to update doctor status/);
  assert.deepEqual(state.updates[0].where, { id: "target", role: "DOCTOR", verificationStatus: "PENDING" });
});

test("suspension and reinstatement require the expected current doctor states", async () => {
  const suspended = await loadActions({ targetRole: "DOCTOR", targetStatus: "VERIFIED" });
  assert.deepEqual(
    await suspended.updateDoctorActiveStatus(form([["doctorId", "target"], ["suspend", "true"]])),
    { success: true }
  );
  assert.deepEqual(suspended.state.updates[0].where, { id: "target", role: "DOCTOR", verificationStatus: "VERIFIED" });

  const cannotSuspendPending = await loadActions({ targetRole: "DOCTOR", targetStatus: "PENDING" });
  await assert.rejects(
    cannotSuspendPending.updateDoctorActiveStatus(form([["doctorId", "target"], ["suspend", "true"]])),
    /Failed to update doctor status/
  );

  const cannotReinstateVerified = await loadActions({ targetRole: "DOCTOR", targetStatus: "VERIFIED" });
  await assert.rejects(
    cannotReinstateVerified.updateDoctorActiveStatus(form([["doctorId", "target"], ["suspend", "false"]])),
    /Failed to update doctor status/
  );
});
