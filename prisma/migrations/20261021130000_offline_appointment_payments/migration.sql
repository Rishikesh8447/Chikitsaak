-- Persist consultation mode and the selected payment method.
-- Existing appointments remain online by default; cash selection is explicitly unpaid.
BEGIN;

CREATE TYPE "AppointmentMode" AS ENUM ('ONLINE', 'OFFLINE');
CREATE TYPE "AppointmentPaymentMethod" AS ENUM ('ONLINE', 'CASH', 'UPI_QR');
ALTER TYPE "AppointmentPaymentStatus" ADD VALUE 'CASH_DUE';
ALTER TYPE "AppointmentPaymentStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "PaymentOrderStatus" ADD VALUE 'NOT_APPLICABLE';

ALTER TABLE "Appointment"
  ADD COLUMN "consultationMode" "AppointmentMode" NOT NULL DEFAULT 'ONLINE';

ALTER TABLE "AppointmentPayment"
  ADD COLUMN "method" "AppointmentPaymentMethod" NOT NULL DEFAULT 'ONLINE';

COMMIT;
