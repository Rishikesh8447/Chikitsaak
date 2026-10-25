-- Record who collected offline cash and when, with one immutable record per payment.
BEGIN;

CREATE TABLE "AppointmentCashCollection" (
    "paymentId" TEXT NOT NULL,
    "collectorUserId" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentCashCollection_pkey" PRIMARY KEY ("paymentId")
);

CREATE INDEX "AppointmentCashCollection_collectorUserId_collectedAt_idx"
    ON "AppointmentCashCollection"("collectorUserId", "collectedAt");

ALTER TABLE "AppointmentCashCollection"
    ADD CONSTRAINT "AppointmentCashCollection_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "AppointmentPayment"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppointmentCashCollection"
    ADD CONSTRAINT "AppointmentCashCollection_collectorUserId_fkey"
    FOREIGN KEY ("collectorUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
