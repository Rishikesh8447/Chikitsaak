const { test } = require("node:test");
const assert = require("node:assert/strict");
const roleAssignment = import("../lib/onboarding-role-assignment.mjs");

async function attemptAssignment({ accountRole = "UNASSIGNED", selectedRole, userId = "clerk-user-1" }) {
  const { assignInitialUserRole } = await roleAssignment;
  const user = { clerkUserId: userId, role: accountRole, verificationStatus: "PENDING" };
  const data = selectedRole === "DOCTOR"
    ? { role: "DOCTOR", verificationStatus: "PENDING", specialty: "Cardiology" }
    : { role: selectedRole };

  const result = await assignInitialUserRole({
    userId,
    user,
    role: selectedRole,
    data,
    updateUser: async ({ where, data: updateData }) => {
      assert.equal(where.clerkUserId, userId);
      assert.equal(where.role, "UNASSIGNED");
      if (user.role !== where.role) return { count: 0 };
      Object.assign(user, updateData);
      return { count: 1 };
    },
  });
  return { user, result };
}

test("an unassigned user can select PATIENT", async () => {
  const { user, result } = await attemptAssignment({ selectedRole: "PATIENT" });

  assert.equal(result.count, 1);
  assert.equal(user.role, "PATIENT");
});

test("an unassigned user can select DOCTOR and remains pending verification", async () => {
  const { user, result } = await attemptAssignment({ selectedRole: "DOCTOR" });

  assert.equal(result.count, 1);
  assert.equal(user.role, "DOCTOR");
  assert.equal(user.verificationStatus, "PENDING");
  assert.equal(user.specialty, "Cardiology");
});

test("an established PATIENT cannot select DOCTOR", async () => {
  const { ROLE_ALREADY_ASSIGNED } = await roleAssignment;

  await assert.rejects(
    attemptAssignment({ accountRole: "PATIENT", selectedRole: "DOCTOR" }),
    new Error(ROLE_ALREADY_ASSIGNED)
  );
});

test("an established DOCTOR cannot select PATIENT", async () => {
  const { ROLE_ALREADY_ASSIGNED } = await roleAssignment;

  await assert.rejects(
    attemptAssignment({ accountRole: "DOCTOR", selectedRole: "PATIENT" }),
    new Error(ROLE_ALREADY_ASSIGNED)
  );
});

test("an ADMIN cannot change to PATIENT or DOCTOR", async () => {
  const { ROLE_ALREADY_ASSIGNED } = await roleAssignment;

  for (const selectedRole of ["PATIENT", "DOCTOR"]) {
    await assert.rejects(
      attemptAssignment({ accountRole: "ADMIN", selectedRole }),
      new Error(ROLE_ALREADY_ASSIGNED)
    );
  }
});

test("an unauthenticated caller is rejected before a role update", async () => {
  const { assignInitialUserRole } = await roleAssignment;
  let updateCalled = false;

  await assert.rejects(assignInitialUserRole({
    userId: null,
    user: null,
    role: "PATIENT",
    data: { role: "PATIENT" },
    updateUser: async () => { updateCalled = true; return { count: 1 }; },
  }), new Error("Unauthorized"));
  assert.equal(updateCalled, false);
});

test("a race that establishes the role before the conditional update is rejected", async () => {
  const { ROLE_ALREADY_ASSIGNED, assignInitialUserRole } = await roleAssignment;
  const staleUser = { clerkUserId: "clerk-user-1", role: "UNASSIGNED" };

  await assert.rejects(assignInitialUserRole({
    userId: "clerk-user-1",
    user: staleUser,
    role: "PATIENT",
    data: { role: "PATIENT" },
    updateUser: async ({ where }) => {
      assert.equal(where.role, "UNASSIGNED");
      return { count: 0 };
    },
  }), new Error(ROLE_ALREADY_ASSIGNED));
});
