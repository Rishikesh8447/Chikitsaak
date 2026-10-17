-- Add laboratory partner management and test ordering to the consolidated baseline.
-- Explicit transaction contains DDL, preflight, and data backfill atomically on PostgreSQL.
BEGIN;
CREATE TYPE "LaboratoryStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "LaboratoryRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
CREATE TYPE "LaboratoryMembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "LabOrderSource" AS ENUM ('DOCTOR', 'PATIENT');
CREATE TYPE "LabOrderStatus" AS ENUM ('AWAITING_LAB_SELECTION', 'REQUESTED', 'ACCEPTED', 'REJECTED', 'COLLECTION_SCHEDULED', 'COLLECTED', 'CANCELLED');

CREATE TABLE "Laboratory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "registrationNumberNormalized" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "status" "LaboratoryStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Laboratory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaboratoryMembership" (
    "id" TEXT NOT NULL,
    "laboratoryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LaboratoryRole" NOT NULL DEFAULT 'STAFF',
    "status" "LaboratoryMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaboratoryMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "code" TEXT,
    "category" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaboratoryOffering" (
    "id" TEXT NOT NULL,
    "laboratoryId" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "preparationInstructions" TEXT,
    "estimatedHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaboratoryOffering_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT,
    "appointmentId" TEXT,
    "laboratoryId" TEXT,
    "source" "LabOrderSource" NOT NULL,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'AWAITING_LAB_SELECTION',
    "clinicalInstructions" TEXT,
    "collectionAt" TIMESTAMP(3),
    "collectionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LabOrderItem" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "labTestId" TEXT NOT NULL,
    "laboratoryOfferingId" TEXT,
    "laboratoryId" TEXT,
    "testName" TEXT NOT NULL,
    "testCategory" TEXT,
    "testDescription" TEXT,
    "priceAtBooking" DECIMAL(10,2),
    CONSTRAINT "LabOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LabOrderStatusHistory" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "membershipId" TEXT,
    "fromStatus" "LabOrderStatus",
    "toStatus" "LabOrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaboratoryAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "laboratoryId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaboratoryAuditEvent_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    IF EXISTS (SELECT lower(btrim("registrationNumber")) FROM "Laboratory" GROUP BY lower(btrim("registrationNumber")) HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Duplicate normalized laboratory registration numbers exist; resolve them before applying this migration';
    END IF;
END $$;
UPDATE "Laboratory" SET "registrationNumberNormalized" = lower(btrim("registrationNumber"));
ALTER TABLE "Laboratory" ALTER COLUMN "registrationNumberNormalized" SET NOT NULL;
ALTER TABLE "Laboratory" ADD CONSTRAINT "Laboratory_registrationNumberNormalized_check" CHECK ("registrationNumberNormalized" = lower(btrim("registrationNumber")));
CREATE FUNCTION normalize_laboratory_registration_key() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW."registrationNumberNormalized" := lower(btrim(NEW."registrationNumber"));
    RETURN NEW;
END;
$$;
CREATE TRIGGER "Laboratory_normalize_registration_key_trigger"
BEFORE INSERT OR UPDATE ON "Laboratory"
FOR EACH ROW EXECUTE FUNCTION normalize_laboratory_registration_key();
CREATE UNIQUE INDEX "Laboratory_registrationNumberNormalized_key" ON "Laboratory"("registrationNumberNormalized");
CREATE INDEX "Laboratory_status_createdAt_idx" ON "Laboratory"("status", "createdAt");
CREATE INDEX "Laboratory_country_state_city_idx" ON "Laboratory"("country", "state", "city");
CREATE UNIQUE INDEX "LaboratoryMembership_laboratoryId_userId_key" ON "LaboratoryMembership"("laboratoryId", "userId");
CREATE INDEX "LaboratoryMembership_userId_status_idx" ON "LaboratoryMembership"("userId", "status");
CREATE INDEX "LaboratoryMembership_laboratoryId_status_role_idx" ON "LaboratoryMembership"("laboratoryId", "status", "role");
DO $$ BEGIN
    IF EXISTS (SELECT lower(btrim("name")) FROM "LabTest" GROUP BY lower(btrim("name")) HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Duplicate normalized laboratory test names exist; resolve them before applying this migration';
    END IF;
END $$;
UPDATE "LabTest" SET "normalizedName" = lower(btrim("name"));
ALTER TABLE "LabTest" ALTER COLUMN "normalizedName" SET NOT NULL;
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_normalizedName_check" CHECK ("normalizedName" = lower(btrim("name")));
CREATE UNIQUE INDEX "LabTest_normalizedName_key" ON "LabTest"("normalizedName");
CREATE FUNCTION normalize_lab_test_key() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW."normalizedName" := lower(btrim(NEW."name"));
    RETURN NEW;
END;
$$;
CREATE TRIGGER "LabTest_normalize_name_key_trigger"
BEFORE INSERT OR UPDATE ON "LabTest"
FOR EACH ROW EXECUTE FUNCTION normalize_lab_test_key();
DO $$ BEGIN
    IF EXISTS (SELECT "code" FROM "LabTest" WHERE "code" IS NOT NULL GROUP BY "code" HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Duplicate laboratory test codes exist; resolve them before applying this migration';
    END IF;
END $$;
CREATE UNIQUE INDEX "LabTest_code_key" ON "LabTest"("code");
CREATE INDEX "LabTest_isActive_name_idx" ON "LabTest"("isActive", "name");
CREATE UNIQUE INDEX "LaboratoryOffering_laboratoryId_labTestId_key" ON "LaboratoryOffering"("laboratoryId", "labTestId");
CREATE UNIQUE INDEX "LaboratoryOffering_id_laboratoryId_labTestId_key" ON "LaboratoryOffering"("id", "laboratoryId", "labTestId");
CREATE INDEX "LaboratoryOffering_labTestId_isAvailable_idx" ON "LaboratoryOffering"("labTestId", "isAvailable");
CREATE INDEX "LaboratoryOffering_laboratoryId_isAvailable_idx" ON "LaboratoryOffering"("laboratoryId", "isAvailable");
CREATE INDEX "LabOrder_patientId_createdAt_idx" ON "LabOrder"("patientId", "createdAt");
CREATE INDEX "LabOrder_doctorId_createdAt_idx" ON "LabOrder"("doctorId", "createdAt");
CREATE INDEX "LabOrder_laboratoryId_status_createdAt_idx" ON "LabOrder"("laboratoryId", "status", "createdAt");
CREATE INDEX "LabOrder_appointmentId_idx" ON "LabOrder"("appointmentId");
CREATE UNIQUE INDEX "LabOrderItem_labOrderId_labTestId_key" ON "LabOrderItem"("labOrderId", "labTestId");
CREATE INDEX "LabOrderItem_labTestId_idx" ON "LabOrderItem"("labTestId");
CREATE INDEX "LabOrderStatusHistory_labOrderId_createdAt_idx" ON "LabOrderStatusHistory"("labOrderId", "createdAt");
CREATE INDEX "LabOrderStatusHistory_actorUserId_createdAt_idx" ON "LabOrderStatusHistory"("actorUserId", "createdAt");
CREATE INDEX "LaboratoryAuditEvent_laboratoryId_createdAt_idx" ON "LaboratoryAuditEvent"("laboratoryId", "createdAt");
CREATE INDEX "LaboratoryAuditEvent_entityType_entityId_createdAt_idx" ON "LaboratoryAuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "LaboratoryAuditEvent_actorUserId_createdAt_idx" ON "LaboratoryAuditEvent"("actorUserId", "createdAt");

ALTER TABLE "LaboratoryMembership" ADD CONSTRAINT "LaboratoryMembership_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaboratoryMembership" ADD CONSTRAINT "LaboratoryMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaboratoryOffering" ADD CONSTRAINT "LaboratoryOffering_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaboratoryOffering" ADD CONSTRAINT "LaboratoryOffering_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_laboratoryOfferingId_laboratoryId_labTestId_fkey" FOREIGN KEY ("laboratoryOfferingId", "laboratoryId", "labTestId") REFERENCES "LaboratoryOffering"("id", "laboratoryId", "labTestId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_assignment_tuple_check" CHECK (
    ("laboratoryId" IS NULL AND "laboratoryOfferingId" IS NULL AND "priceAtBooking" IS NULL)
    OR ("laboratoryId" IS NOT NULL AND "laboratoryOfferingId" IS NOT NULL AND "priceAtBooking" IS NOT NULL)
);
ALTER TABLE "LabOrderItem" ADD CONSTRAINT "LabOrderItem_price_nonnegative_check" CHECK ("priceAtBooking" IS NULL OR "priceAtBooking" >= 0);
ALTER TABLE "LabOrderStatusHistory" ADD CONSTRAINT "LabOrderStatusHistory_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LabOrderStatusHistory" ADD CONSTRAINT "LabOrderStatusHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabOrderStatusHistory" ADD CONSTRAINT "LabOrderStatusHistory_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "LaboratoryMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LaboratoryAuditEvent" ADD CONSTRAINT "LaboratoryAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LaboratoryAuditEvent" ADD CONSTRAINT "LaboratoryAuditEvent_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "LabOrderItem" i
SET "laboratoryId" = o."laboratoryId"
FROM "LabOrder" o
WHERE o."id" = i."labOrderId" AND o."laboratoryId" IS NOT NULL;

CREATE FUNCTION enforce_lab_order_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_order "LabOrder"%ROWTYPE;
BEGIN
    SELECT * INTO current_order FROM "LabOrder" WHERE "id" = NEW."id";
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    IF current_order."source" = 'DOCTOR' THEN
        IF current_order."doctorId" IS NULL OR current_order."appointmentId" IS NULL OR NOT EXISTS (
            SELECT 1 FROM "Appointment" a WHERE a."id" = current_order."appointmentId"
              AND a."patientId" = current_order."patientId" AND a."doctorId" = current_order."doctorId"
        ) THEN
            RAISE EXCEPTION 'Doctor laboratory orders must match their originating appointment patient and doctor';
        END IF;
    ELSIF current_order."doctorId" IS NOT NULL OR current_order."appointmentId" IS NOT NULL THEN
        RAISE EXCEPTION 'Patient laboratory orders cannot claim doctor or appointment provenance';
    END IF;
    IF EXISTS (SELECT 1 FROM "LabOrderItem" i WHERE i."labOrderId" = current_order."id" AND i."laboratoryId" IS DISTINCT FROM current_order."laboratoryId") THEN
        RAISE EXCEPTION 'Laboratory order items must match the parent order assignment';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "LabOrder_consistency_trigger"
AFTER INSERT OR UPDATE ON "LabOrder" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_lab_order_consistency();

CREATE FUNCTION enforce_lab_order_item_consistency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_item "LabOrderItem"%ROWTYPE;
DECLARE parent_laboratory_id TEXT;
BEGIN
    SELECT * INTO current_item FROM "LabOrderItem" WHERE "id" = NEW."id";
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    SELECT "laboratoryId" INTO parent_laboratory_id FROM "LabOrder" WHERE "id" = current_item."labOrderId";
    IF NOT FOUND OR current_item."laboratoryId" IS DISTINCT FROM parent_laboratory_id THEN
        RAISE EXCEPTION 'Laboratory order item assignment must match its parent order';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "LabOrderItem_consistency_trigger"
AFTER INSERT OR UPDATE ON "LabOrderItem" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_lab_order_item_consistency();

CREATE FUNCTION protect_lab_appointment_provenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW."patientId", NEW."doctorId") IS DISTINCT FROM (OLD."patientId", OLD."doctorId")
       AND EXISTS (SELECT 1 FROM "LabOrder" o WHERE o."appointmentId" = OLD."id") THEN
        RAISE EXCEPTION 'An appointment linked to a laboratory order cannot change its patient or doctor';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "Appointment_lab_provenance_trigger"
BEFORE UPDATE OF "patientId", "doctorId" ON "Appointment"
FOR EACH ROW EXECUTE FUNCTION protect_lab_appointment_provenance();

-- Keep this enum extension after all DDL; PostgreSQL makes a new enum label
-- available only after the current migration transaction commits.
ALTER TYPE "NotificationType" ADD VALUE 'LAB_ORDER_UPDATE';
COMMIT;
