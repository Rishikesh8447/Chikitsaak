-- Add the payment-pending appointment status before online payment DDL.
BEGIN;

ALTER TYPE "AppointmentStatus" ADD VALUE 'PAYMENT_PENDING' BEFORE 'SCHEDULED';

COMMIT;
