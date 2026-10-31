# Deployment

## Environment

Set these variables in the deployment dashboard (never commit their values):

- `DATABASE_URL` — server-only Prisma connection string.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — browser-safe Clerk publishable key.
- `CLERK_SECRET_KEY` — server-only Clerk secret.
- `NEXT_PUBLIC_VONAGE_APPLICATION_ID` — browser-safe Vonage application ID.
- `VONAGE_PRIVATE_KEY` — server-only Vonage private key.
- `OPENAI_API_KEY` — server-only OpenAI key.
- `OPENAI_MODEL` — optional model name; defaults to `gpt-4o-mini`.
- `CRON_SECRET` — server-only long random value used by the reminder endpoint.

Configure production Clerk origins and redirect URLs to match the deployed HTTPS domain. Configure Vonage and OpenAI credentials for the same environment.

## Razorpay appointment payments

- `RAZORPAY_MODE` is optional and defaults to `test`. Set it to exactly `live` only after an explicit production launch decision.
- `RAZORPAY_KEY_ID` is the public checkout key ID returned to the browser; it must match the selected mode (`rzp_test_` or `rzp_live_`). `RAZORPAY_KEY_SECRET` is server-only.
- `RAZORPAY_TEST_WEBHOOK_SECRET` and `RAZORPAY_LIVE_WEBHOOK_SECRET` are separate server-only webhook signing secrets. Configure the secret from the Razorpay webhook for the selected mode; the app does not fall back between modes.

Keep the mode unset or set it to `test` for initial checkout verification. Live payments are not enabled automatically. Replace any prior generic `RAZORPAY_WEBHOOK_SECRET` setting with the matching mode-specific variable. Do not configure live credentials against a test database or test credentials for production payments.

## Database and start commands

### Migration history preflight

This repository keeps the original nine migrations under `prisma/migrations-archive`. The active chain is the zero-step baseline snapshot, then Laboratory and Pharmacy, followed in timestamp order by `20261020000000_appointment_payment_pending_status`, `20261021000000_online_appointment_payments`, `20261021120000_payment_reliability_review`, `20261021130000_offline_appointment_payments`, `20261021140000_cash_collection_audit`, `20261024120000_payment_backed_doctor_payouts`, and `20261024130000_remove_legacy_credit_system`. The first payment migration commits the new appointment enum label separately before online payment DDL uses payment status defaults. The cleanup is deliberately last because it removes legacy fields and types used by the payment-backed payout migration. Do not copy archived migrations back into `prisma/migrations`: the baseline already contains their resulting schema and sorts before them on a fresh install.

There are two distinct database paths. Run the read-only preflight from the exact clean deployment checkout, after verifying in the deployment dashboard that `DATABASE_URL` targets the intended database. Pass both the expected database name and exact hostname shown for that Neon database. The helper compares both values with the configured URL before connecting, then checks `current_database()`; it never prints the URL or credentials.

Green Frog currently has an empty `_prisma_migrations` ledger while baseline, Laboratory, and Pharmacy objects are reported to exist. Neither `--expect existing` nor `--expect fresh` is appropriate for that initial state: `existing` requires the archived historical rows plus the base markers, while `fresh` now also requires an empty application schema. Do not run `migrate deploy`, because it would replay the three existing migrations. Before each `migrate resolve`, compare the full expected effects of that migration with the live read-only catalog; object names alone are insufficient. For the baseline, compare every baseline table, column (type, nullability, default), enum label, index, constraint, and foreign key; account for subsequent Laboratory and Pharmacy additions and the extra `NotificationType.LAB_ORDER_UPDATE` value. For Laboratory, verify its complete types, tables, columns, indexes, constraints, foreign keys, normalization functions, and triggers. For Pharmacy, verify its types, tables, columns, indexes, constraints, and foreign keys, and confirm no unexpected partial objects. Also verify none of the seven pending migrations' objects are already present. Stop on any missing or differing object; do not resolve that migration.

Only after that evidence is reviewed, record the three verified markers in order:

```powershell
npx.cmd prisma migrate resolve --applied 000000000000_baseline --schema prisma/schema.prisma
npx.cmd prisma migrate resolve --applied 20261012000000_laboratory_workflow --schema prisma/schema.prisma
npx.cmd prisma migrate resolve --applied 20261016000000_pharmacy_partners --schema prisma/schema.prisma
```

Then run the read-only ledger-shape check. This mode confirms exactly three successful zero-step base markers and that the seven payment/cleanup records remain pending; it does **not** prove schema equivalence:

```powershell
npm.cmd run db:migration-preflight -- --expect reconciled --database neondb --host ep-green-frog-adc7hgyv-pooler.c-2.us-east-1.aws.neon.tech
```

### Staged Green Frog release

The current application release must wait until cleanup is applied. `reservePaymentCollections` creates a `Payout` with payment fields, but the payment-backed payout migration defaults `payoutKind` to `LEGACY_CREDIT`; its check requires those payment fields to be null for legacy payouts. The old required `Payout.amount` column also remains until cleanup. The current Prisma model omits `payoutKind` and the legacy columns, so payment payout creation fails during the six-migration-only stage. Keep Green Frog in maintenance mode from Release A through Release B, and deploy the current application only after cleanup completes. This avoids running either application version against a half-transitioned schema and prevents new legacy transactions or payouts from tripping cleanup guards.

Proceed only after the full read-only catalog comparison proves the baseline, Laboratory, and Pharmacy effects and confirms the seven pending migration effects are absent. Resolve those three migrations in order as described above, then require the `reconciled` preflight to pass.

**Release A: six payment/payout migrations, cleanup excluded from this release artifact.** Do not edit, delete, rename, or alter the cleanup migration in the repository. Build a separate temporary Prisma artifact containing the schema, migration lock, the three already-resolved base migration directories, and exactly these six pending directories:

```powershell
$releaseAMigrations = @(
  "000000000000_baseline",
  "20261012000000_laboratory_workflow",
  "20261016000000_pharmacy_partners",
  "20261020000000_appointment_payment_pending_status",
  "20261021000000_online_appointment_payments",
  "20261021120000_payment_reliability_review",
  "20261021130000_offline_appointment_payments",
  "20261021140000_cash_collection_audit",
  "20261024120000_payment_backed_doctor_payouts"
)
$stageRoot = Join-Path $env:TEMP ("chikitsaak-green-frog-release-a-" + [guid]::NewGuid().ToString("N"))
$stageMigrations = Join-Path $stageRoot "prisma\migrations"
New-Item -ItemType Directory -Path $stageMigrations -Force | Out-Null
Copy-Item .\prisma\schema.prisma (Join-Path $stageRoot "prisma\schema.prisma")
Copy-Item .\prisma\migrations\migration_lock.toml $stageMigrations
foreach ($name in $releaseAMigrations) {
  Copy-Item (Join-Path ".\prisma\migrations" $name) $stageMigrations -Recurse
}
$stagedNames = @(Get-ChildItem $stageMigrations -Directory | Select-Object -ExpandProperty Name | Sort-Object)
$expectedNames = @($releaseAMigrations | Sort-Object)
if (Compare-Object $expectedNames $stagedNames) { throw "Release A migration artifact does not match the reviewed nine-directory list." }
if (Test-Path (Join-Path $stageMigrations "20261024130000_remove_legacy_credit_system")) { throw "Cleanup migration must not be in Release A." }
```

Review the staged directory list and compare each copied migration checksum to its repository source:

```powershell
foreach ($name in $releaseAMigrations) {
  $sourceHash = (Get-FileHash (Join-Path (Join-Path ".\prisma\migrations" $name) "migration.sql") -Algorithm SHA256).Hash
  $stagedHash = (Get-FileHash (Join-Path (Join-Path $stageMigrations $name) "migration.sql") -Algorithm SHA256).Hash
  if ($sourceHash -ne $stagedHash) { throw "Migration checksum mismatch: $name" }
}
```

Before invoking Prisma, preserve the prior process value and load the validated Green Frog URL from `.env.local`:

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
$targetUrl = node -e "const fs=require('node:fs'); const dotenv=require('dotenv'); const {validateGreenFrogTarget}=require('./scripts/green-frog-schema-verification.cjs'); const target=validateGreenFrogTarget(dotenv.parse(fs.readFileSync('.env.local','utf8')).DATABASE_URL); if(!target.ok){ console.error(target.reason); process.exit(2); } process.stdout.write(target.url.toString());"
if ($LASTEXITCODE -ne 0) { throw "DATABASE_URL is not the verified Green Frog target." }
$env:DATABASE_URL = $targetUrl
Remove-Variable targetUrl
```

The URL is captured into a process variable and is not written to the console. The verifier rejects any other host/database. Do not echo `$env:DATABASE_URL`.

```powershell
npx.cmd prisma migrate deploy --schema (Join-Path $stageRoot "prisma\schema.prisma")
```

This applies the six pending payment/payout migrations; the three resolved base migrations are skipped. Keep Green Frog in maintenance mode and do not release the current application yet. Retain the temporary artifact for review; do not delete the cleanup migration from the repository.

**Release B: cleanup and current application.** Put Green Frog application traffic into maintenance mode and stop all application writes. Verify the cleanup preconditions from the database: `User` rows with nonzero `credits` = 0, `CreditTransaction` rows = 0, `Payout` rows with `payoutKind = 'LEGACY_CREDIT'` = 0, and `Notification` rows with `type = 'CREDIT_TRANSACTION'` = 0. If any count is nonzero or unavailable, stop and reconcile the data first. Use the complete reviewed migration directory, which still contains the original cleanup SQL, and run:

```powershell
npx.cmd prisma migrate deploy --schema prisma/schema.prisma
```

Because Release A recorded the six earlier migrations, this deploy should apply only `20261024130000_remove_legacy_credit_system`. Confirm migration status and the dropped legacy columns/types/tables before deploying the current application and restoring traffic. If cleanup fails or the status differs, keep maintenance mode enabled and review the failed migration state; do not resolve or rerun blindly.

This staged procedure is for Green Frog only and must never target Plain Sky production. The migration artifacts must come from a clean reviewed commit; do not stage from an unreviewed or dirty checkout. After Release B, restore the prior process target without printing it:

```powershell
if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
else { $env:DATABASE_URL = $previousDatabaseUrl }
Remove-Variable previousDatabaseUrl
```

For a genuinely fresh database, the ledger must be empty. `migrate deploy` then creates the schema from the baseline first and applies Laboratory, Pharmacy, and payment migrations in timestamp order. Do not use `--expect fresh` for an existing database or a database that has already received any migration.

```powershell
npm.cmd run db:migration-preflight -- --expect fresh --database YOUR_FRESH_DATABASE_NAME --host YOUR_CONFIRMED_NEON_HOSTNAME
```

The helper opens a read-only transaction and selects migration-ledger rows; fresh mode also checks that no application relations or user-defined enum/domain/range types exist. It never runs Prisma migration commands or alters the ledger. It rejects unexpected active migration directories. A passing reconciled preflight validates the base ledger shape and supplied database name/hostname; it does not verify schema equivalence or payment readiness.

### Other migration test targets

The former disposable-Neon staging instructions are obsolete: `scripts/payment-migration-stage.cjs` is not present in this checkout, and the earlier five-migration procedure omitted payment-backed payouts and cleanup. `scripts/local-payment-migration-test.ps1` is a local fixture check whose migration execution remains deliberately gated. Do not use either workflow for Green Frog; use the staged release procedure above.

### Apply migrations

For Green Frog, use only the staged Release A and Release B commands above. A direct deploy from the repository migration directory sees all pending migrations, including cleanup. For a genuinely fresh database, use the full migration chain only after the `fresh` preflight and explicit target verification.

```bash
npx prisma migrate deploy
npm run build
npm start
```

### Appointment reminders scheduler

Appointment reminders are evaluated across two discrete time windows:
1. `TWENTY_FOUR_HOURS`: 23 to 24 hours prior to appointment start.
2. `THIRTY_MINUTES`: 30 minutes or less prior to appointment start.

Because Vercel Hobby accounts restrict Vercel Cron to once daily, automated scheduling is configured via GitHub Actions in `.github/workflows/reminders-cron.yml` running every 15 minutes (`*/15 * * * *`).

**Setup and operational requirements:**
1. **GitHub Secret**: Add `CRON_SECRET` to repository secrets (**Settings** &rarr; **Secrets and variables** &rarr; **Actions** &rarr; **Repository secrets**), matching the value configured in the Vercel project environment.
2. **Security**: The workflow authenticates via `Authorization: Bearer ${{ secrets.CRON_SECRET }}` and reports only the HTTP response status code, never printing headers or secret tokens.
3. **Concurrency**: Overlapping runs are prevented by the `appointment-reminders` concurrency group.
4. **Deduplication Safeguard**: In `lib/reminders.js`, reminder claims use transactional unique constraints on `[appointmentId, type]`, preventing duplicate notifications even if concurrent external calls occur.
5. **External Scheduler Check**: If any third-party external scheduler (e.g. cron-job.org, AWS EventBridge) was previously configured out-of-band, disable it before relying on the GitHub Actions workflow to prevent redundant traffic.

## Verification

After deployment, verify sign-in, doctor and patient dashboards, appointment booking, video authorization, AI assistance, and authenticated reminder processing. Confirm that logs contain no secret values and that invalid cron credentials receive `401`.
