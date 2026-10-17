export function normalizeLicenseKey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function canTransitionPharmacy(from, to) {
  return (from === "PENDING" && ["VERIFIED", "REJECTED"].includes(to)) ||
    (from === "VERIFIED" && to === "SUSPENDED") ||
    (from === "SUSPENDED" && to === "VERIFIED");
}

export function canManagePharmacy({ userId, pharmacyId, membership, requireVerified = true, roles = ["OWNER", "MANAGER"] }) {
  return Boolean(userId && membership && membership.userId === userId &&
    (!pharmacyId || membership.pharmacyId === pharmacyId) &&
    membership.status === "ACTIVE" && roles.includes(membership.role) &&
    (!requireVerified || membership.pharmacy?.status === "VERIFIED"));
}
