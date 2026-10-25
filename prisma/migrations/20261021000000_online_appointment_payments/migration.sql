-- Add online appointment checkout records and persisted 15-minute holds.
BEGIN;

CREATE TYPE "AppointmentPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'PAID', 'EXPIRED');
CREATE TYPE "PaymentRefundStatus" AS ENUM ('NOT_REQUIRED', 'REVIEW_REQUIRED', 'APPROVED', 'REFUNDED', 'REJECTED');

ALTER TABLE "User"
  ADD COLUMN "consultationPriceRupees" INTEGER,
  ADD CONSTRAINT "User_consultationPriceRupees_check"
    CHECK ("consultationPriceRupees" IS NULL OR "consultationPriceRupees" BETWEEN 1 AND 100000);

ALTER TABLE "Appointment" ADD COLUMN "checkoutExpiresAt" TIMESTAMP(3);
CREATE INDEX "Appointment_doctorId_checkoutExpiresAt_idx" ON "Appointment"("doctorId", "checkoutExpiresAt");

CREATE TABLE "AppointmentPayment" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "amountRupees" INTEGER NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "AppointmentPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "orderStatus" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
  "refundStatus" "PaymentRefundStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  "razorpayOrderId" TEXT,
  "razorpayPaymentId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppointmentPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentPayment_amount_check" CHECK ("amountRupees" BETWEEN 1 AND 100000 AND "amountPaise" = "amountRupees" * 100 AND "currency" = 'INR')
);

CREATE UNIQUE INDEX "AppointmentPayment_appointmentId_key" ON "AppointmentPayment"("appointmentId");
CREATE UNIQUE INDEX "AppointmentPayment_razorpayOrderId_key" ON "AppointmentPayment"("razorpayOrderId");
CREATE UNIQUE INDEX "AppointmentPayment_razorpayPaymentId_key" ON "AppointmentPayment"("razorpayPaymentId");
CREATE INDEX "AppointmentPayment_status_createdAt_idx" ON "AppointmentPayment"("status", "createdAt");
CREATE INDEX "AppointmentPayment_refundStatus_createdAt_idx" ON "AppointmentPayment"("refundStatus", "createdAt");
ALTER TABLE "AppointmentPayment" ADD CONSTRAINT "AppointmentPayment_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
