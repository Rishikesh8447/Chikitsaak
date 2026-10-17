-- Add organization-scoped pharmacy partner onboarding and catalog management.
BEGIN;

CREATE TYPE "PharmacyStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "PharmacyRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
CREATE TYPE "PharmacyMembershipStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "Pharmacy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "licenseNumberNormalized" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "status" "PharmacyStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Pharmacy_licenseNumberNormalized_check" CHECK ("licenseNumberNormalized" = lower(btrim("licenseNumber")))
);

CREATE TABLE "PharmacyMembership" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PharmacyRole" NOT NULL DEFAULT 'STAFF',
    "status" "PharmacyMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PharmacyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PharmacyProduct" (
    "id" TEXT NOT NULL,
    "pharmacyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PharmacyProduct_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PharmacyProduct_price_nonnegative_check" CHECK ("price" >= 0)
);

CREATE TABLE "PharmacyAuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "pharmacyId" TEXT,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PharmacyAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Pharmacy_licenseNumberNormalized_key" ON "Pharmacy"("licenseNumberNormalized");
CREATE INDEX "Pharmacy_status_createdAt_idx" ON "Pharmacy"("status", "createdAt");
CREATE INDEX "Pharmacy_country_state_city_idx" ON "Pharmacy"("country", "state", "city");
CREATE UNIQUE INDEX "PharmacyMembership_pharmacyId_userId_key" ON "PharmacyMembership"("pharmacyId", "userId");
CREATE INDEX "PharmacyMembership_userId_status_idx" ON "PharmacyMembership"("userId", "status");
CREATE INDEX "PharmacyMembership_pharmacyId_status_role_idx" ON "PharmacyMembership"("pharmacyId", "status", "role");
CREATE INDEX "PharmacyProduct_pharmacyId_isAvailable_name_idx" ON "PharmacyProduct"("pharmacyId", "isAvailable", "name");
CREATE INDEX "PharmacyAuditEvent_pharmacyId_createdAt_idx" ON "PharmacyAuditEvent"("pharmacyId", "createdAt");
CREATE INDEX "PharmacyAuditEvent_actorUserId_createdAt_idx" ON "PharmacyAuditEvent"("actorUserId", "createdAt");

ALTER TABLE "PharmacyMembership" ADD CONSTRAINT "PharmacyMembership_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyMembership" ADD CONSTRAINT "PharmacyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyProduct" ADD CONSTRAINT "PharmacyProduct_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PharmacyAuditEvent" ADD CONSTRAINT "PharmacyAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PharmacyAuditEvent" ADD CONSTRAINT "PharmacyAuditEvent_pharmacyId_fkey" FOREIGN KEY ("pharmacyId") REFERENCES "Pharmacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
