import { addDays } from "date-fns";

export const SUPPORTED_FOLLOW_UP_INTERVALS = Object.freeze([
  { days: 3, label: "3 days (acute review)" },
  { days: 7, label: "7 days (1 week)" },
  { days: 14, label: "14 days (2 weeks)" },
  { days: 21, label: "21 days (3 weeks)" },
  { days: 30, label: "30 days (1 month)" },
  { days: 60, label: "60 days (2 months)" },
  { days: 90, label: "90 days (3 months)" },
]);

export const SUPPORTED_FOLLOW_UP_DAYS = Object.freeze(
  SUPPORTED_FOLLOW_UP_INTERVALS.map((item) => item.days)
);

/**
 * Validates follow-up requirement and interval.
 * Returns { followUpRequired: boolean, followUpDays: number | null }.
 */
export function validateFollowUpRecommendation(followUpRequiredRaw, followUpDaysRaw) {
  const followUpRequired =
    followUpRequiredRaw === true ||
    followUpRequiredRaw === "true" ||
    followUpRequiredRaw === "on" ||
    followUpRequiredRaw === 1 ||
    followUpRequiredRaw === "1";

  if (!followUpRequired) {
    return { followUpRequired: false, followUpDays: null };
  }

  const days = Number.parseInt(followUpDaysRaw, 10);
  if (!Number.isInteger(days) || !SUPPORTED_FOLLOW_UP_DAYS.includes(days)) {
    throw new Error(
      `Please select a supported follow-up interval (${SUPPORTED_FOLLOW_UP_DAYS.join(", ")} days)`
    );
  }

  return { followUpRequired: true, followUpDays: days };
}

/**
 * Calculates recommended follow-up date from consultation date.
 */
export function calculateRecommendedFollowUpDate(consultationDate, followUpDays) {
  if (!consultationDate || !Number.isInteger(followUpDays) || followUpDays <= 0) {
    return null;
  }
  const base = new Date(consultationDate);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  return addDays(base, followUpDays);
}

/**
 * Validates whether an original appointment payment is verified and paid.
 */
export function isOriginalAppointmentPaymentVerified(payment, consultationMode) {
  if (!payment) return false;
  if (payment.refundStatus !== "NOT_REQUIRED") return false;

  if (consultationMode === "ONLINE" || payment.method === "ONLINE" || payment.method === "UPI_QR") {
    return payment.status === "PAID" && Boolean(payment.verifiedAt);
  }

  if (consultationMode === "OFFLINE" && payment.method === "CASH") {
    return (
      (payment.status === "PAID" && Boolean(payment.cashCollection?.collectedAt)) ||
      (payment.status === "PAID" && Boolean(payment.cashCollection?.paymentId))
    );
  }

  return false;
}

/**
 * Checks if original appointment is eligible for booking an included follow-up.
 */
export function isOriginalAppointmentEligibleForFollowUp(appointment) {
  if (!appointment) return { eligible: false, reason: "Appointment not found" };
  if (appointment.status !== "COMPLETED") {
    return { eligible: false, reason: "A follow-up can only be booked for a completed consultation" };
  }
  if (appointment.originalAppointmentId) {
    return { eligible: false, reason: "A follow-up appointment cannot have another follow-up" };
  }
  if (!appointment.prescription?.followUpRequired) {
    return { eligible: false, reason: "The doctor did not recommend a follow-up for this consultation" };
  }
  if (!isOriginalAppointmentPaymentVerified(appointment.payment, appointment.consultationMode)) {
    return { eligible: false, reason: "A verified paid consultation is required to book an included follow-up" };
  }
  if (appointment.followUpAppointment && appointment.followUpAppointment.status !== "CANCELLED") {
    return { eligible: false, reason: "A follow-up consultation has already been scheduled for this appointment" };
  }
  return { eligible: true };
}

/**
 * Returns the consultation modes supported by the doctor.
 */
export function getDoctorSupportedModes(doctor) {
  if (Array.isArray(doctor?.supportedModes) && doctor.supportedModes.length > 0) {
    const valid = doctor.supportedModes.filter((m) => ["ONLINE", "OFFLINE"].includes(m));
    if (valid.length > 0) return valid;
  }
  return ["ONLINE", "OFFLINE"];
}
