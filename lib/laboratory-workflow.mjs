export const LAB_ORDER_TRANSITIONS = {
  AWAITING_LAB_SELECTION: ["REQUESTED", "CANCELLED"],
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["COLLECTION_SCHEDULED"],
  COLLECTION_SCHEDULED: ["COLLECTED"],
  REJECTED: ["AWAITING_LAB_SELECTION"],
  COLLECTED: [],
  CANCELLED: [],
};

export const LABORATORY_TRANSITIONS = {
  PENDING: ["VERIFIED", "REJECTED"],
  VERIFIED: ["SUSPENDED"],
  SUSPENDED: ["VERIFIED"],
  REJECTED: [],
};

export function canTransitionLabOrder(from, to) {
  return LAB_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canTransitionLaboratory(from, to) {
  return LABORATORY_TRANSITIONS[from]?.includes(to) ?? false;
}

export function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

export function normalizeCatalogKey(value) {
  // Match PostgreSQL lower(btrim(value)), whose default trim removes ASCII spaces.
  return typeof value === "string" ? value.replace(/^ +| +$/g, "").toLowerCase() : "";
}

export function parseMoney(value) {
  if (typeof value !== "string" || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null;
}

export function getLabOrderBookingTotalCents(items) {
  if (!Array.isArray(items) || !items.length || items.some((item) => item.priceAtBooking == null)) return null;
  const prices = items.map(({ priceAtBooking }) => {
    const match = String(priceAtBooking).match(/^(\d{1,8})(?:\.(\d{1,2}))?$/);
    return match ? Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0")) : null;
  });
  if (prices.some((price) => price === null)) return null;
  const total = prices.reduce((sum, price) => sum + price, 0);
  return Number.isSafeInteger(total) ? total : null;
}

export function getEligibleLaboratories(laboratories, labTestIds) {
  const required = new Set(labTestIds);
  if (!required.size) return [];
  return laboratories.flatMap((laboratory) => {
    const offerings = (laboratory.offerings || []).filter((offering) => offering.isAvailable && required.has(offering.labTestId));
    const byTest = new Map(offerings.map((offering) => [offering.labTestId, offering]));
    if (byTest.size !== required.size) return [];
    return [{ id: laboratory.id, name: laboratory.name, offerings: [...byTest.values()] }];
  });
}
