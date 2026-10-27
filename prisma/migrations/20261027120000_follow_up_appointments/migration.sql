-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "originalAppointmentId" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN "followUpDays" INTEGER,
ADD COLUMN "followUpRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_originalAppointmentId_key" ON "Appointment"("originalAppointmentId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_originalAppointmentId_fkey" FOREIGN KEY ("originalAppointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
