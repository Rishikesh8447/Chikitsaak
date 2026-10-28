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

export function serializePharmacyProduct(product) {
  if (!product || typeof product !== "object") return null;

  let priceStr = "0.00";
  if (product.price !== null && product.price !== undefined) {
    if (typeof product.price?.toFixed === "function") {
      priceStr = product.price.toFixed(2);
    } else if (typeof product.price === "number") {
      priceStr = product.price.toFixed(2);
    } else {
      priceStr = String(product.price);
    }
  }

  return {
    ...product,
    price: priceStr,
    manufactureDate: product.manufactureDate
      ? (product.manufactureDate instanceof Date ? product.manufactureDate.toISOString() : String(product.manufactureDate))
      : null,
    expiryDate: product.expiryDate
      ? (product.expiryDate instanceof Date ? product.expiryDate.toISOString() : String(product.expiryDate))
      : null,
    createdAt: product.createdAt instanceof Date ? product.createdAt.toISOString() : product.createdAt,
    updatedAt: product.updatedAt instanceof Date ? product.updatedAt.toISOString() : product.updatedAt,
  };
}
