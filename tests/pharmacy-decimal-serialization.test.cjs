const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { serializePharmacyProduct } = require("../lib/pharmacy-workflow.mjs");

test("serializePharmacyProduct converts Prisma Decimal to plain serializable string with preserved precision", () => {
  // Simulated Prisma Decimal instance (which has a custom prototype and .toFixed)
  class FakePrismaDecimal {
    constructor(val) {
      this.val = val;
    }
    toFixed(digits) {
      return Number(this.val).toFixed(digits);
    }
    toString() {
      return String(this.val);
    }
  }

  const rawProduct = {
    id: "prod-123",
    pharmacyId: "pharm-456",
    name: "Amoxicillin 500mg",
    description: "Broad-spectrum antibiotic",
    price: new FakePrismaDecimal("149.99"),
    isAvailable: true,
    manufactureDate: new Date("2026-01-15T00:00:00.000Z"),
    expiryDate: new Date("2027-01-15T00:00:00.000Z"),
    createdAt: new Date("2026-02-01T12:00:00.000Z"),
    updatedAt: new Date("2026-02-01T12:00:00.000Z"),
  };

  const serialized = serializePharmacyProduct(rawProduct);

  // 1. Must be a plain object
  assert.equal(Object.getPrototypeOf(serialized), Object.prototype);
  assert.equal(typeof serialized, "object");
  assert.notEqual(serialized, null);

  // 2. Price must be a string and preserve monetary precision
  assert.equal(typeof serialized.price, "string");
  assert.equal(serialized.price, "149.99");

  // 3. Must not contain the custom FakePrismaDecimal class
  assert.equal(serialized.price instanceof FakePrismaDecimal, false);

  // 4. Dates must be serialized to ISO strings
  assert.equal(serialized.manufactureDate, "2026-01-15T00:00:00.000Z");
  assert.equal(serialized.expiryDate, "2027-01-15T00:00:00.000Z");
  assert.equal(serialized.createdAt, "2026-02-01T12:00:00.000Z");
  assert.equal(serialized.updatedAt, "2026-02-01T12:00:00.000Z");

  // 5. Plain object check matches Next.js Client Component boundary check
  const jsonRoundtrip = JSON.parse(JSON.stringify(serialized));
  assert.deepEqual(jsonRoundtrip, serialized);
});

test("serializePharmacyProduct handles number and string prices safely", () => {
  const prodWithNum = serializePharmacyProduct({
    id: "p1",
    name: "Paracetamol",
    price: 25.5,
  });
  assert.equal(prodWithNum.price, "25.50");

  const prodWithZero = serializePharmacyProduct({
    id: "p2",
    name: "Free Sample",
    price: 0,
  });
  assert.equal(prodWithZero.price, "0.00");

  const prodWithNull = serializePharmacyProduct({
    id: "p3",
    name: "Unknown Price",
    price: null,
  });
  assert.equal(prodWithNull.price, "0.00");

  assert.equal(serializePharmacyProduct(null), null);
  assert.equal(serializePharmacyProduct(undefined), null);
});

test("pharmacy workspace page serializes products before passing to Client Components", () => {
  const pagePath = path.join(__dirname, "../app/(main)/pharmacy/workspace/page.jsx");
  const pageSrc = fs.readFileSync(pagePath, "utf8");

  assert.match(pageSrc, /serializePharmacyProduct/);
  assert.match(pageSrc, /products\s*=\s*\(rawProducts\s*\|\|\s*\[\]\)\.map\(serializePharmacyProduct\)/);
  assert.match(pageSrc, /<PharmacyProductAvailabilityForm\s+pharmacyId=\{selected\.id\}\s+product=\{product\}\s*\/>/);
});

test("lib/prisma.js tunes connect_timeout and pool_timeout for serverless databases", () => {
  const prismaPath = path.join(__dirname, "../lib/prisma.js");
  const prismaSrc = fs.readFileSync(prismaPath, "utf8");

  assert.match(prismaSrc, /connect_timeout/);
  assert.match(prismaSrc, /pool_timeout/);
  assert.match(prismaSrc, /15/);
});
