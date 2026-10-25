-- Separate INR collection payouts from the historical credit payout ledger.
-- Existing Payout rows receive LEGACY_CREDIT; no legacy amounts are converted.
BEGIN;

CREATE TYPE "PayoutKind" AS ENUM ('LEGACY_CREDIT', 'PAYMENT_COLLECTION');
CREATE TYPE "PayoutAllocationStatus" AS ENUM ('RESERVED', 'RELEASED', 'PAID');

ALTER TABLE "Payout"
  ADD COLUMN "payoutKind" "PayoutKind" NOT NULL DEFAULT 'LEGACY_CREDIT',
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "amountPaise" BIGINT,
  ADD COLUMN "platformFeePaise" BIGINT,
  ADD COLUMN "netAmountPaise" BIGINT,
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "transferReference" TEXT,
  ADD COLUMN "reviewRequiredAt" TIMESTAMP(3),
  ADD COLUMN "reviewReason" TEXT;

ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_payment_collection_amounts_check" CHECK (
    ("payoutKind" = 'LEGACY_CREDIT'
      AND "currency" IS NULL
      AND "amountPaise" IS NULL
      AND "platformFeePaise" IS NULL
      AND "netAmountPaise" IS NULL
      AND "requestKey" IS NULL
      AND "transferReference" IS NULL
      AND "reviewRequiredAt" IS NULL
      AND "reviewReason" IS NULL)
    OR
    ("payoutKind" = 'PAYMENT_COLLECTION'
      AND "currency" IS NOT NULL
      AND "currency" = 'INR'
      AND "amount" = 0
      AND "credits" = 0
      AND "platformFee" = 0
      AND "netAmount" = 0
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
      ))
  );

CREATE UNIQUE INDEX "Payout_requestKey_key" ON "Payout"("requestKey");
CREATE UNIQUE INDEX "Payout_transferReference_key" ON "Payout"("transferReference");
CREATE INDEX "Payout_doctorId_payoutKind_status_idx" ON "Payout"("doctorId", "payoutKind", "status");

CREATE TABLE "PayoutPaymentAllocation" (
  "id" TEXT NOT NULL,
  "payoutId" TEXT NOT NULL,
  "appointmentPaymentId" TEXT NOT NULL,
  "activePaymentId" TEXT,
  "amountPaise" BIGINT NOT NULL,
  "status" "PayoutAllocationStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "PayoutPaymentAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayoutPaymentAllocation_amountPaise_check" CHECK ("amountPaise" > 0),
  CONSTRAINT "PayoutPaymentAllocation_active_state_check" CHECK (
    ("status" = 'RESERVED'
      AND "activePaymentId" IS NOT NULL
      AND "activePaymentId" = "appointmentPaymentId"
      AND "releasedAt" IS NULL
      AND "paidAt" IS NULL)
    OR
    ("status" = 'RELEASED'
      AND "activePaymentId" IS NULL
      AND "releasedAt" IS NOT NULL
      AND "paidAt" IS NULL)
    OR
    ("status" = 'PAID'
      AND "activePaymentId" IS NOT NULL
      AND "activePaymentId" = "appointmentPaymentId"
      AND "releasedAt" IS NULL
      AND "paidAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "PayoutPaymentAllocation_activePaymentId_key"
  ON "PayoutPaymentAllocation"("activePaymentId");
CREATE INDEX "PayoutPaymentAllocation_payoutId_status_idx"
  ON "PayoutPaymentAllocation"("payoutId", "status");
CREATE INDEX "PayoutPaymentAllocation_appointmentPaymentId_createdAt_idx"
  ON "PayoutPaymentAllocation"("appointmentPaymentId", "createdAt");
CREATE UNIQUE INDEX "PayoutPaymentAllocation_payoutId_appointmentPaymentId_key"
  ON "PayoutPaymentAllocation"("payoutId", "appointmentPaymentId");

ALTER TABLE "PayoutPaymentAllocation"
  ADD CONSTRAINT "PayoutPaymentAllocation_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "Payout"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutPaymentAllocation"
  ADD CONSTRAINT "PayoutPaymentAllocation_appointmentPaymentId_fkey"
  FOREIGN KEY ("appointmentPaymentId") REFERENCES "AppointmentPayment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
