"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const deployment = fs.readFileSync(path.join(root, "DEPLOYMENT.md"), "utf8");
const stageScriptPath = path.join(root, "scripts", "stage-green-frog-release-a.ps1");
const stageScript = fs.existsSync(stageScriptPath) ? fs.readFileSync(stageScriptPath, "utf8") : "";
const releaseA = deployment.split("**Release A:")[1]?.split("**Release B:")[0] || "";
const releaseB = deployment.split("**Release B:")[1]?.split("This staged procedure")[0] || "";

test("deployment keeps cleanup out of Release A and applies it in Release B", () => {
  let stagedNames = [];
  if (stageScript) {
    const baseMatches = stageScript.match(/\$baseMigrations = @\(([\s\S]*?)\)/)?.[1] || "";
    const paymentMatches = stageScript.match(/\$paymentMigrations = @\(([\s\S]*?)\)/)?.[1] || "";
    stagedNames = [...`${baseMatches}\n${paymentMatches}`.matchAll(/['"]([0-9a-z_]+)['"]/g)].map((match) => match[1]);
  }
  if (!stagedNames.length) {
    const list = releaseA.match(/\$releaseAMigrations = @\(([\s\S]*?)\n\)/)?.[1] || "";
    stagedNames = [...list.matchAll(/"([0-9a-z_]+)"/g)].map((match) => match[1]);
  }

  assert.equal(stagedNames.length, 9);
  assert.ok(stagedNames.includes("20261024120000_payment_backed_doctor_payouts"));
  assert.ok(!stagedNames.includes("20261024130000_remove_legacy_credit_system"));
  assert.match(releaseA, /migrate deploy --schema \(Join-Path/);
  assert.ok(/checksums?[\s\S]*Get-FileHash/i.test(releaseA) || /Get-FileHash/.test(stageScript));
  assert.match(releaseB, /migrate deploy --schema prisma/);
  assert.match(releaseB, /maintenance mode/);
  assert.match(releaseB, /remove_legacy_credit_system/);
});

test("current payout writer requires the post-cleanup schema", () => {
  const schema = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  const payoutModel = schema.match(/model Payout \{([\s\S]*?)\n\}/)?.[1] || "";
  const paymentMigration = fs.readFileSync(path.join(root, "prisma", "migrations", "20261024120000_payment_backed_doctor_payouts", "migration.sql"), "utf8");
  const payoutWriter = fs.readFileSync(path.join(root, "lib", "payment-payouts.mjs"), "utf8");
  assert.doesNotMatch(payoutModel, /payoutKind|\bamount\s+Int/);
  assert.match(paymentMigration, /ADD COLUMN "payoutKind" "PayoutKind" NOT NULL DEFAULT 'LEGACY_CREDIT'/);
  assert.match(paymentMigration, /"amount" = 0/);
  assert.match(paymentMigration, /"currency" IS NULL[\s\S]*"requestKey" IS NULL/);
  assert.match(payoutWriter, /currency: "INR"[\s\S]*amountPaise,[\s\S]*requestKey/);
});
