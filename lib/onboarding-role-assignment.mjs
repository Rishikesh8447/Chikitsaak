export const ROLE_ALREADY_ASSIGNED = "Role has already been assigned";

export function assertInitialRoleAssignment({ userId, user, role }) {
  if (!userId) throw new Error("Unauthorized");
  if (!user || user.clerkUserId !== userId) throw new Error("User not found in database");
  if (!role || !["PATIENT", "DOCTOR"].includes(role)) throw new Error("Invalid role selection");
  if (user.role !== "UNASSIGNED") throw new Error(ROLE_ALREADY_ASSIGNED);
}

export async function persistInitialRoleAssignment({ userId, data, updateUser }) {
  const result = await updateUser({
    where: { clerkUserId: userId, role: "UNASSIGNED" },
    data,
  });
  if (result.count !== 1) throw new Error(ROLE_ALREADY_ASSIGNED);
  return result;
}

export async function assignInitialUserRole({ userId, user, role, data, updateUser }) {
  assertInitialRoleAssignment({ userId, user, role });
  return persistInitialRoleAssignment({ userId, data, updateUser });
}
