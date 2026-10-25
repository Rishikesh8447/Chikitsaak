-- Persist Razorpay webhook delivery IDs and audited admin refund-review decisions.
BEGIN;

CREATE TYPE "RazorpayWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'REVIEW_REQUIRED');
CREATE TYPE "RefundReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE "RazorpayWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "appointmentPaymentId" TEXT,
  "razorpayPaymentId" TEXT,
  "razorpayOrderId" TEXT,
  "amountPaise" INTEGER,
  "currency" TEXT,
  "status" "RazorpayWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "RazorpayWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RazorpayWebhookEvent_appointmentPaymentId_status_idx" ON "RazorpayWebhookEvent"("appointmentPaymentId", "status");
CREATE INDEX "RazorpayWebhookEvent_razorpayPaymentId_idx" ON "RazorpayWebhookEvent"("razorpayPaymentId");
CREATE INDEX "RazorpayWebhookEvent_razorpayOrderId_idx" ON "RazorpayWebhookEvent"("razorpayOrderId");
ALTER TABLE "RazorpayWebhookEvent" ADD CONSTRAINT "RazorpayWebhookEvent_appointmentPaymentId_fkey"
  FOREIGN KEY ("appointmentPaymentId") REFERENCES "AppointmentPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AppointmentRefundDecision" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "decision" "RefundReviewDecision" NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentRefundDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentRefundDecision_paymentId_key" ON "AppointmentRefundDecision"("paymentId");
CREATE INDEX "AppointmentRefundDecision_adminUserId_createdAt_idx" ON "AppointmentRefundDecision"("adminUserId", "createdAt");
ALTER TABLE "AppointmentRefundDecision" ADD CONSTRAINT "AppointmentRefundDecision_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "AppointmentPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentRefundDecision" ADD CONSTRAINT "AppointmentRefundDecision_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
