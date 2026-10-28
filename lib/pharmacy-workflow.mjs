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

export function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDateOnly(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

export function validateProductDates({ manufactureDate, expiryDate }) {
  const mfg = manufactureDate
    ? manufactureDate instanceof Date
      ? manufactureDate
      : parseDateOnly(manufactureDate)
    : null;
  const exp = expiryDate
    ? expiryDate instanceof Date
      ? expiryDate
      : parseDateOnly(expiryDate)
    : null;

  if (manufactureDate && !mfg) {
    return { valid: false, error: "Manufacturing date must be a valid calendar date in YYYY-MM-DD format" };
  }
  if (expiryDate && !exp) {
    return { valid: false, error: "Expiry date must be a valid calendar date in YYYY-MM-DD format" };
  }
  if (mfg && exp && exp < mfg) {
    return { valid: false, error: "Expiry date cannot be before manufacturing date" };
  }
  return { valid: true, manufactureDate: mfg, expiryDate: exp };
}

export function isProductExpired(expiryDate, now = new Date()) {
  if (!expiryDate) return false;
  const exp = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) return false;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expUtc = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
  return expUtc < todayUtc;
}

export function isProductExpiringSoon(expiryDate, daysThreshold = 30, now = new Date()) {
  if (!expiryDate) return false;
  const exp = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) return false;
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expUtc = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
  if (expUtc < todayUtc) return false;
  const diffMs = expUtc - todayUtc;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays <= daysThreshold;
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

