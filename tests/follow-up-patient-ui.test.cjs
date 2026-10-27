const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const { pathToFileURL } = require("node:url");

const appointmentCardPromise = readFile(join(cwd(), "components", "ui", "appointment-card.jsx"), "utf8");
const followUpModulePromise = import(pathToFileURL(join(cwd(), "lib", "follow-up-appointment.mjs")).href);

test("calculateRecommendedFollowUpDate computes guidance date from consultation start and days", async () => {
  const { calculateRecommendedFollowUpDate } = await followUpModulePromise;
  const base = new Date("2026-10-01T10:00:00.000Z");
  const target = calculateRecommendedFollowUpDate(base, 14);
  assert.equal(target.toISOString(), new Date("2026-10-15T10:00:00.000Z").toISOString());
  assert.equal(calculateRecommendedFollowUpDate(null, 14), null);
  assert.equal(calculateRecommendedFollowUpDate(base, null), null);
  assert.equal(calculateRecommendedFollowUpDate(base, 0), null);
});

test("isOriginalAppointmentEligibleForFollowUp enforces full business rules", async () => {
  const { isOriginalAppointmentEligibleForFollowUp } = await followUpModulePromise;

  const validOriginal = {
    id: "appt-1",
    status: "COMPLETED",
    consultationMode: "ONLINE",
    originalAppointmentId: null,
    prescription: { followUpRequired: true, followUpDays: 14 },
    payment: { status: "PAID", verifiedAt: new Date(), refundStatus: "NOT_REQUIRED", method: "ONLINE" },
    followUpAppointment: null,
  };

  // 1. Fully eligible
  assert.deepEqual(isOriginalAppointmentEligibleForFollowUp(validOriginal), { eligible: true });

  // 2. Ineligible if not completed
  assert.equal(isOriginalAppointmentEligibleForFollowUp({ ...validOriginal, status: "SCHEDULED" }).eligible, false);
  assert.equal(isOriginalAppointmentEligibleForFollowUp({ ...validOriginal, status: "CONFIRMED" }).eligible, false);

  // 3. Ineligible if it is itself a follow-up (no chaining)
  assert.equal(isOriginalAppointmentEligibleForFollowUp({ ...validOriginal, originalAppointmentId: "appt-0" }).eligible, false);

  // 4. Ineligible if doctor did not recommend follow-up
  assert.equal(isOriginalAppointmentEligibleForFollowUp({ ...validOriginal, prescription: null }).eligible, false);
  assert.equal(isOriginalAppointmentEligibleForFollowUp({ ...validOriginal, prescription: { followUpRequired: false } }).eligible, false);

  // 5. Ineligible if payment not verified or refunded
  assert.equal(isOriginalAppointmentEligibleForFollowUp({ ...validOriginal, payment: null }).eligible, false);
  assert.equal(isOriginalAppointmentEligibleForFollowUp({
    ...validOriginal,
    payment: { status: "PENDING", verifiedAt: null, refundStatus: "NOT_REQUIRED", method: "ONLINE" },
  }).eligible, false);
  assert.equal(isOriginalAppointmentEligibleForFollowUp({
    ...validOriginal,
    payment: { status: "PAID", verifiedAt: new Date(), refundStatus: "REFUNDED", method: "ONLINE" },
  }).eligible, false);

  // 6. Ineligible if active follow-up appointment already exists
  assert.equal(isOriginalAppointmentEligibleForFollowUp({
    ...validOriginal,
    followUpAppointment: { id: "follow-1", status: "SCHEDULED" },
  }).eligible, false);
  assert.equal(isOriginalAppointmentEligibleForFollowUp({
    ...validOriginal,
    followUpAppointment: { id: "follow-1", status: "CONFIRMED" },
  }).eligible, false);

  // 7. Re-eligible if existing follow-up was CANCELLED
  assert.deepEqual(isOriginalAppointmentEligibleForFollowUp({
    ...validOriginal,
    followUpAppointment: { id: "follow-1", status: "CANCELLED" },
  }), { eligible: true });

  // 8. Offline cash collection verification
  const offlineCashOriginal = {
    ...validOriginal,
    consultationMode: "OFFLINE",
    payment: { status: "PAID", method: "CASH", refundStatus: "NOT_REQUIRED", cashCollection: { collectedAt: new Date() } },
  };
  assert.deepEqual(isOriginalAppointmentEligibleForFollowUp(offlineCashOriginal), { eligible: true });
});

test("getDoctorSupportedModes respects doctor capabilities and defaults gracefully", async () => {
  const { getDoctorSupportedModes } = await followUpModulePromise;

  // Explicit online only
  assert.deepEqual(getDoctorSupportedModes({ supportedModes: ["ONLINE"] }), ["ONLINE"]);

  // Explicit offline only
  assert.deepEqual(getDoctorSupportedModes({ supportedModes: ["OFFLINE"] }), ["OFFLINE"]);

  // Both modes
  assert.deepEqual(getDoctorSupportedModes({ supportedModes: ["ONLINE", "OFFLINE"] }), ["ONLINE", "OFFLINE"]);

  // Defaults to both when not specified
  assert.deepEqual(getDoctorSupportedModes({}), ["ONLINE", "OFFLINE"]);
  assert.deepEqual(getDoctorSupportedModes(null), ["ONLINE", "OFFLINE"]);
  assert.deepEqual(getDoctorSupportedModes({ supportedModes: [] }), ["ONLINE", "OFFLINE"]);
});

test("AppointmentCard renders follow-up badge and suppresses payment for follow-up appointments", async () => {
  const source = await appointmentCardPromise;

  // Follow-up badge rendering
  assert.match(source, /isFollowUpAppointment && \(\s*<Badge[\s\S]*?>\s*Follow-up \(Included \/ ₹0\)\s*<\/Badge>/);

  // Display ₹0 included cost instead of payment pending charges
  assert.match(source, /isFollowUpAppointment \? \(\s*<div[^>]*?>\s*Follow-up \(Included \/ ₹0\)\s*<\/div>/);

  // Razorpay script suppressed for follow-up appointments
  assert.match(source, /!isFollowUpAppointment && appointment\.status === "PAYMENT_PENDING"/);

  // Payment checkout button guarded against follow-up appointments
  assert.match(source, /!isFollowUpAppointment && appointment\.status === "PAYMENT_PENDING"[\s\S]*?Resume checkout/);
});

test("AppointmentCard renders recommendation and booking action only when eligible", async () => {
  const source = await appointmentCardPromise;

  // Uses centralized eligibility check
  assert.match(source, /isOriginalAppointmentEligibleForFollowUp\(appointment\)/);

  // Recommendation notice in card preview
  assert.match(source, /Recommended follow-up: within \{appointment\.prescription\.followUpDays\} days/);

  // Booking button rendered only when canBookFollowUp
  assert.match(source, /canBookFollowUp && \(\s*<Button[\s\S]*?>\s*Book Follow-up \(Included \/ ₹0\)\s*<\/Button>/);

  // Existing active follow-up displays status badge instead of booking button
  assert.match(source, /appointment\.followUpAppointment && appointment\.followUpAppointment\.status !== "CANCELLED"/);
  assert.match(source, /Follow-up: \{appointment\.followUpAppointment\.status\}/);
});

test("AppointmentCard follow-up modal implements guidance, modes, slots, and server submission", async () => {
  const source = await appointmentCardPromise;

  // Dialog header
  assert.match(source, /<Dialog open=\{followUpOpen\} onOpenChange=\{setFollowUpOpen\}>/);
  assert.match(source, /Book Follow-up Consultation/);
  assert.match(source, /Included at ₹0/);

  // Guidance notice
  assert.match(source, /Target timeframe: around[\s\S]*?Guidance only/);

  // Doctor supported modes
  assert.match(source, /getDoctorSupportedModes\(appointment\.doctor\)/);
  assert.match(source, /name="followUpConsultationMode"/);

  // Slots availability loader and empty state
  assert.match(source, /followUpSlotsLoading \? \([\s\S]*?Loading available slots/);
  assert.match(source, /No available appointments for this doctor right now/);
  assert.match(source, /formatLocalSlotRange\(slot\.startTime, slot\.endTime\)/);

  // Server action invocation with FormData
  assert.match(source, /formData\.append\("originalAppointmentId", appointment\.id\)/);
  assert.match(source, /formData\.append\("startTime", selectedFollowUpSlot\.startTime\)/);
  assert.match(source, /formData\.append\("endTime", selectedFollowUpSlot\.endTime\)/);
  assert.match(source, /formData\.append\("consultationMode", followUpMode\)/);
  assert.match(source, /submitFollowUp\(formData\)/);

  // Server error notice
  assert.match(source, /followUpError && \(\s*<div[^>]*?>\s*\{followUpError\}\s*<\/div>/);

  // Submission disabled during loading or without slot selection
  assert.match(source, /disabled=\{!selectedFollowUpSlot \|\| followUpLoading \|\| followUpSlotsLoading\}/);
  assert.match(source, /Confirm Follow-up \(₹0\)/);

  // Success handling closes modal and triggers toast
  assert.match(source, /toast\.success\("Follow-up appointment scheduled successfully \(included at ₹0\)"\)/);
  assert.match(source, /setFollowUpOpen\(false\)/);
});
