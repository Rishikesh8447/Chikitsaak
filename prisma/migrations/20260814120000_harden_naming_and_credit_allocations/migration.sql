ALTER TABLE "User" RENAME COLUMN "UpdatedAt" TO "updatedAt";
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "videoSessionToken";
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_REFUND';
ALTER TABLE "CreditTransaction" ADD COLUMN "allocationKey" TEXT;
CREATE UNIQUE INDEX "CreditTransaction_allocationKey_key" ON "CreditTransaction"("allocationKey");
