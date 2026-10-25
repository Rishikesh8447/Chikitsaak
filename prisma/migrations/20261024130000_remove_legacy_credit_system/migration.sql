-- Retire legacy credit accounting only when no historical credit balances,
-- ledger entries, legacy payouts, or credit notifications remain.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "credits" <> 0) THEN
    RAISE EXCEPTION 'Cannot remove legacy credits: nonzero user balances remain';
  END IF;
  IF EXISTS (SELECT 1 FROM "CreditTransaction") THEN
    RAISE EXCEPTION 'Cannot remove legacy credits: credit transaction history remains';
  END IF;
  IF EXISTS (SELECT 1 FROM "Payout" WHERE "payoutKind" = 'LEGACY_CREDIT') THEN
    RAISE EXCEPTION 'Cannot remove legacy payouts: legacy payout records remain';
  END IF;
  IF EXISTS (SELECT 1 FROM "Notification" WHERE "type" = 'CREDIT_TRANSACTION') THEN
    RAISE EXCEPTION 'Cannot remove legacy credit notification type: notifications remain';
  END IF;
END $$;

ALTER TABLE "Payout" DROP CONSTRAINT "Payout_payment_collection_amounts_check";
ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_payment_amounts_check" CHECK (
    "currency" IS NOT NULL
    AND "currency" = 'INR'
    AND "amountPaise" IS NOT NULL
    AND "amountPaise" > 0
    AND "platformFeePaise" IS NOT NULL
    AND "platformFeePaise" = 0
    AND "netAmountPaise" IS NOT NULL
    AND "netAmountPaise" = "amountPaise"
    AND "requestKey" IS NOT NULL
    AND (("reviewRequiredAt" IS NULL AND "reviewReason" IS NULL)
      OR ("reviewRequiredAt" IS NOT NULL AND "reviewReason" IS NOT NULL))
    AND (
      ("status" = 'PROCESSING' AND "transferReference" IS NULL AND "processedAt" IS NULL AND "processedBy" IS NULL)
      OR ("status" = 'FAILED' AND "transferReference" IS NULL AND "processedAt" IS NOT NULL AND "processedBy" IS NOT NULL)
      OR ("status" = 'PROCESSED' AND "transferReference" IS NOT NULL AND "processedAt" IS NOT NULL AND "processedBy" IS NOT NULL)
    )
  );
DROP INDEX "Payout_doctorId_payoutKind_status_idx";
ALTER TABLE "Payout"
  DROP COLUMN "amount",
  DROP COLUMN "credits",
  DROP COLUMN "platformFee",
  DROP COLUMN "netAmount",
  DROP COLUMN "paypalEmail",
  DROP COLUMN "payoutKind";
DROP TYPE "PayoutKind";
DROP TABLE "CreditTransaction";
ALTER TABLE "User" DROP COLUMN "credits";
DROP TYPE "TransactionType";

CREATE TYPE "NotificationType_new" AS ENUM (
  'APPOINTMENT_BOOKED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_REMINDER',
  'NO_SHOW',
  'DOCTOR_VERIFICATION',
  'PAYOUT_STATUS',
  'PRESCRIPTION_AVAILABLE',
  'LAB_ORDER_UPDATE'
);
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new"
  USING ("type"::text::"NotificationType_new");
DROP TYPE "NotificationType";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";

CREATE INDEX "Payout_doctorId_status_idx" ON "Payout"("doctorId", "status");

COMMIT;
