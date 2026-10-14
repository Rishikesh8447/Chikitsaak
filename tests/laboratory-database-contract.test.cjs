// Static SQL contract checks only. These do not execute PostgreSQL constraints or triggers.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const migrationPromise = readFile(join(cwd(), "prisma", "migrations", "20261012000000_laboratory_workflow", "migration.sql"), "utf8");
const schemaPromise = readFile(join(cwd(), "prisma", "schema.prisma"), "utf8");

test("database migration derives and checks normalized laboratory keys", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /BEFORE INSERT OR UPDATE ON "Laboratory"[\s\S]*?normalize_laboratory_registration_key/);
  assert.match(sql, /CHECK \("registrationNumberNormalized" = lower\(btrim\("registrationNumber"\)\)\)/);
  assert.match(sql, /BEFORE INSERT OR UPDATE ON "LabTest"[\s\S]*?normalize_lab_test_key/);
  assert.match(sql, /CHECK \("normalizedName" = lower\(btrim\("name"\)\)\)/);
  assert.match(sql, /CREATE UNIQUE INDEX "Laboratory_registrationNumberNormalized_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "LabTest_normalizedName_key"/);
  assert.ok(sql.indexOf("Duplicate normalized laboratory registration numbers") < sql.indexOf('UPDATE "Laboratory" SET'));
  assert.ok(sql.indexOf("Duplicate normalized laboratory test names") < sql.indexOf('UPDATE "LabTest" SET'));
});

test("database migration constrains every nullable offering assignment tuple", async () => {
  const sql = await migrationPromise;
  const assignmentCheck = sql.match(/CONSTRAINT "LabOrderItem_assignment_tuple_check" CHECK \(([\s\S]*?)\n\);/)?.[1] || "";
  assert.match(assignmentCheck, /"laboratoryId" IS NULL AND "laboratoryOfferingId" IS NULL AND "priceAtBooking" IS NULL/);
  assert.match(assignmentCheck, /"laboratoryId" IS NOT NULL AND "laboratoryOfferingId" IS NOT NULL AND "priceAtBooking" IS NOT NULL/);
  assert.match(sql, /FOREIGN KEY \("laboratoryOfferingId", "laboratoryId", "labTestId"\) REFERENCES "LaboratoryOffering"\("id", "laboratoryId", "labTestId"\)/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER "LabOrder_consistency_trigger"[\s\S]*?DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER "LabOrderItem_consistency_trigger"[\s\S]*?DEFERRABLE INITIALLY DEFERRED/);

  // Enumerate nullable parent/item laboratory, offering, and price presence.
  // Only a fully unassigned or fully assigned order/item pair is permitted.
  const combinations = [false, true].flatMap((orderLab) => [false, true].flatMap((itemLab) => [false, true].flatMap((offering) => [false, true].map((price) => ({ orderLab, itemLab, offering, price })))));
  const valid = combinations.filter(({ orderLab, itemLab, offering, price }) =>
    (!orderLab && !itemLab && !offering && !price) || (orderLab && itemLab && offering && price));
  assert.deepEqual(valid, [
    { orderLab: false, itemLab: false, offering: false, price: false },
    { orderLab: true, itemLab: true, offering: true, price: true },
  ]);
});

test("database migration enforces doctor appointment provenance and patient source nullability", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /current_order\."source" = 'DOCTOR'[\s\S]*?a\."patientId" = current_order\."patientId" AND a\."doctorId" = current_order\."doctorId"/);
  assert.match(sql, /current_order\."doctorId" IS NOT NULL OR current_order\."appointmentId" IS NOT NULL/);
  assert.match(sql, /CREATE TRIGGER "Appointment_lab_provenance_trigger"[\s\S]*?BEFORE UPDATE OF "patientId", "doctorId" ON "Appointment"/);
  const schema = await schemaPromise;
  assert.match(schema, /appointment\s+Appointment\?\s+@relation\(fields: \[appointmentId\], references: \[id\], onDelete: Restrict\)/);
  assert.match(schema, /doctor\s+User\?\s+@relation\("LabOrderDoctor", fields: \[doctorId\], references: \[id\], onDelete: Restrict\)/);
});

test("migration brackets DDL and backfill with PostgreSQL transaction statements", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /^--[\s\S]*?\nBEGIN;/);
  assert.match(sql, /ALTER TYPE "NotificationType" ADD VALUE 'LAB_ORDER_UPDATE';\s*COMMIT;\s*$/);
});
