const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const migrationPath = join(process.cwd(), "prisma", "migrations", "20261016000000_pharmacy_partners", "migration.sql");
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");

test("pharmacy migration creates organization, scoped membership, catalog, and actor audit records", async () => {
  const [sql, schema] = await Promise.all([readFile(migrationPath, "utf8"), readFile(schemaPath, "utf8")]);
  for (const model of ["Pharmacy", "PharmacyMembership", "PharmacyProduct", "PharmacyAuditEvent"]) {
    assert.match(sql, new RegExp(`CREATE TABLE "${model}"`));
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(sql, /UNIQUE INDEX "PharmacyMembership_pharmacyId_userId_key"/);
  assert.match(sql, /"actorUserId" TEXT/);
  assert.match(sql, /"createdAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
  assert.match(sql, /"PharmacyProduct_price_nonnegative_check" CHECK \("price" >= 0\)/);
  assert.match(sql, /^--[^\n]*\nBEGIN;[\s\S]*COMMIT;\s*$/);
});

test("partner membership roles do not grant users a global account role", async () => {
  const schema = await readFile(schemaPath, "utf8");
  const userRole = schema.match(/enum UserRole \{([\s\S]*?)\}/)?.[1] || "";
  assert.doesNotMatch(userRole, /PHARMACY|CHEMIST|LABORATORY/);
  assert.match(schema, /model PharmacyMembership[\s\S]*?role\s+PharmacyRole/);
});
