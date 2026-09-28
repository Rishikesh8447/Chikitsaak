ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';

ALTER TABLE "Availability"
ADD COLUMN "dayOfWeek" INTEGER,
ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "blockedDate" TIMESTAMP(3);

CREATE INDEX "Availability_doctorId_dayOfWeek_status_idx"
ON "Availability"("doctorId", "dayOfWeek", "status");
