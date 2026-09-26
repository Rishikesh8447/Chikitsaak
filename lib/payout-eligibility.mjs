const CREDITS_PER_COMPLETED_APPOINTMENT = 2;

/**
 * Only completed consultation credits can be paid out. Credits already held by
 * processing requests or consumed by completed payouts are unavailable again.
 */
export function getPayoutEligibleCredits({
  availableCredits,
  completedAppointments,
  payouts = [],
}) {
  const earnedCredits = Math.max(0, completedAppointments) * CREDITS_PER_COMPLETED_APPOINTMENT;
  const reservedOrPaidCredits = payouts.reduce(
    (total, payout) => total + Math.max(0, payout.credits || 0),
    0
  );

  return Math.max(
    0,
    Math.min(availableCredits, earnedCredits - reservedOrPaidCredits)
  );
}
