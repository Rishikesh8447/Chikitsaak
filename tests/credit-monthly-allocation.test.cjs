const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile, access, readdir } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const read = (file) => readFile(join(cwd(), file), "utf8");

test("application routes and actions no longer expose the legacy credit product", async () => {
  const [proxy, payoutActions, adminActions, schema, seed, pricing] = await Promise.all([
    read("proxy.js"), read("actions/payout.js"), read("actions/admin.js"),
    read("prisma/schema.prisma"), read("prisma/seed.js"), read("components/pricing.jsx"),
  ]);
  const [creditsRoute, creditAction, eligibilityHelper] = await Promise.all([
    access(join(cwd(), "app/(main)/credits/page.jsx")).then(() => true, () => false),
    access(join(cwd(), "actions/credits.js")).then(() => true, () => false),
    access(join(cwd(), "lib/payout-eligibility.mjs")).then(() => true, () => false),
  ]);
  assert.equal(creditsRoute, false);
  assert.equal(creditAction, false);
  assert.equal(eligibilityHelper, false);
  assert.doesNotMatch(proxy, /\/credits/);
  assert.doesNotMatch(payoutActions, /credits|paypal|requestPayout|payoutKind|LEGACY_CREDIT/i);
  assert.doesNotMatch(adminActions, /creditTransaction|approvePayout|rejectPayout|paypal|payoutKind|LEGACY_CREDIT/i);
  assert.doesNotMatch(schema, /credits\s+Int|CreditTransaction|TransactionType|PayoutKind|paypalEmail|platformFee\s+Int|netAmount\s+Int/);
  assert.doesNotMatch(seed, /credits:|CREDIT_TRANSACTIONS|creditTransaction/);
  assert.doesNotMatch(pricing, /credits?|subscription/i);
});

test("retirement migration aborts on legacy data and preserves payment payout allocations", async () => {
  const migration = await read("prisma/migrations/20261024130000_remove_legacy_credit_system/migration.sql");
  assert.match(migration.trim(), /^--[\s\S]*BEGIN;[\s\S]*COMMIT;$/);
  assert.match(migration, /WHERE "credits" <> 0/);
  assert.match(migration, /FROM "CreditTransaction"/);
  assert.match(migration, /WHERE "payoutKind" = 'LEGACY_CREDIT'/);
  assert.match(migration, /WHERE "type" = 'CREDIT_TRANSACTION'/);
  assert.doesNotMatch(migration, /IF NOT EXISTS/);
  assert.match(migration, /DROP CONSTRAINT "Payout_payment_collection_amounts_check"/);
  assert.match(migration, /ADD CONSTRAINT "Payout_payment_amounts_check" CHECK/);
  assert.match(migration, /"platformFeePaise" = 0/);
  assert.match(migration, /"netAmountPaise" = "amountPaise"/);
  assert.match(migration, /"status" = 'PROCESSED'.*"transferReference" IS NOT NULL/s);
  assert.match(migration, /DROP TABLE "CreditTransaction"/);
  assert.match(migration, /ALTER TABLE "Notification" ALTER COLUMN "type" TYPE/);
  assert.doesNotMatch(migration, /DROP TABLE "PayoutPaymentAllocation"|DROP TYPE "PayoutAllocationStatus"/);
  assert.ok(migration.indexOf("DO $$") < migration.indexOf("ALTER TABLE \"Payout\" DROP CONSTRAINT"));
  assert.ok(migration.indexOf("DROP TYPE \"NotificationType\"") < migration.indexOf("ALTER TYPE \"NotificationType_new\" RENAME"));
});

test("credit retirement migration follows all current payment migrations", async () => {
  const migrations = (await readdir(join(cwd(), "prisma/migrations"))).filter((entry) => /^\d{14}_/.test(entry)).sort();
  const payoutIndex = migrations.indexOf("20261024120000_payment_backed_doctor_payouts");
  const cleanupIndex = migrations.indexOf("20261024130000_remove_legacy_credit_system");
  assert.notEqual(payoutIndex, -1, "payment-backed payouts migration must exist");
  assert.equal(cleanupIndex, payoutIndex + 1, "cleanup migration must immediately follow payment-backed payouts");
});

test("payment-backed payout cancellation, reservation and admin transfer resolution remain wired", async () => {
  const [payout, admin, paymentUi] = await Promise.all([
    read("actions/payout.js"), read("actions/admin.js"), read("lib/payment-payouts.mjs"),
  ]);
  assert.match(payout, /requestPaymentPayout/);
  assert.match(payout, /reservePaymentCollections/);
  assert.match(payout, /cancelPaymentPayoutRequest/);
  assert.match(admin, /resolvePaymentPayoutOutcomeAction/);
  assert.match(admin, /recordPaymentPayoutTransferAction/);
  assert.match(paymentUi, /payoutPaymentAllocation/);
});
