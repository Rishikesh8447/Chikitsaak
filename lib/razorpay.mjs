import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_CONSULTATION_PRICE_RUPEES = 100000;

export function parseConsultationPriceRupees(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value)) return null;
  const rupees = Number(value);
  return Number.isSafeInteger(rupees) && rupees <= MAX_CONSULTATION_PRICE_RUPEES ? rupees : null;
}

export function rupeesToPaise(rupees) {
  if (!Number.isSafeInteger(rupees) || rupees < 1 || rupees > MAX_CONSULTATION_PRICE_RUPEES) {
    throw new RangeError("Invalid consultation price");
  }
  return rupees * 100;
}

export function verifyRazorpayPaymentSignature(orderId, paymentId, signature, secret) {
  if ([orderId, paymentId, signature, secret].some((value) => typeof value !== "string" || !value)) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  let provided;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    return false;
  }
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function verifyRazorpayWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== "string" || !/^[a-f\d]{64}$/i.test(signature) || typeof secret !== "string" || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(signature, "hex");
  return timingSafeEqual(provided, expected);
}
