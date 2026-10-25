#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "prisma", "migrations");
const HISTORICAL = [
  "20260718083253_init",
  "20260721120000_rename_doctor_profile_field_to_specialty",
  "20260811110000_add_payout_fields",
  "20260814120000_harden_naming_and_credit_allocations",
  "20260814130000_lifecycle_and_availability",
  "20260814140000_notifications_and_reminders",
  "20260814150000_prescriptions_medical_profile_reviews",
  "20260815160000_add_doctor_location_fields",
  "20260815170000_add_ai_consultation_summary",
];
const BASE = [
  "000000000000_baseline",
  "20261012000000_laboratory_workflow",
  "20261016000000_pharmacy_partners",
];
const PAYMENT = [
  "20261020000000_appointment_payment_pending_status",
  "20261021000000_online_appointment_payments",
  "20261021120000_payment_reliability_review",
  "20261021130000_offline_appointment_payments",
  "20261021140000_cash_collection_audit",
  "20261024120000_payment_backed_doctor_payouts",
  "20261024130000_remove_legacy_credit_system",
];
const EXPECTED_FILES = [...BASE, ...PAYMENT].sort();

function validateMigrationDirectories(names) {
  const actual = names.filter((name) => name !== "migration_lock.toml").sort();
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_FILES)) {
    return {
      ok: false,
      reason: "Active migration directories do not match the reviewed baseline-plus-additions set.",
      actual,
      expected: EXPECTED_FILES,
    };
  }
  return { ok: true };
}

function readLocalDatabaseUrl(envPath = path.join(ROOT, ".env.local")) {
  try {
    return dotenv.parse(fs.readFileSync(envPath, "utf8")).DATABASE_URL || "";
  } catch {
    return "";
  }
}

function validateLedger(mode, rows, { ledgerExists = true, schemaHasObjects = false } = {}) {
  if (mode === "fresh") {
    if (rows.length !== 0) {
      return { ok: false, reason: "Fresh initialization requires an empty _prisma_migrations ledger." };
    }
    if (schemaHasObjects) {
      return { ok: false, reason: "Fresh initialization requires an empty application schema; user-defined schema objects already exist." };
    }
    return { ok: true };
  }

  if (mode === "reconciled") {
    if (!ledgerExists) {
      return { ok: false, reason: "Reconciled mode requires the migration ledger created by the reviewed baseline markers." };
    }
    const names = new Set(rows.map((row) => row.migration_name));
    if (names.size !== BASE.length || BASE.some((name) => !names.has(name))) {
      return { ok: false, reason: "Reconciled mode requires exactly the baseline, Laboratory, and Pharmacy migration records; payment migrations must remain pending." };
    }
    if (rows.some((row) => !row.finished_at || row.rolled_back_at)) {
      return { ok: false, reason: "Reconciled mode requires successful, non-rolled-back baseline records." };
    }
    if (BASE.some((name) => rows.filter((row) => row.migration_name === name).length !== 1)) {
      return { ok: false, reason: "Reconciled mode rejects duplicate baseline migration records." };
    }
    if (rows.some((row) => Number(row.applied_steps_count) !== 0)) {
      return { ok: false, reason: "Reconciled baseline, Laboratory, and Pharmacy markers must each have zero executed steps." };
    }
    return { ok: true };
  }

  if (!ledgerExists) {
    return {
      ok: false,
      reason: "The _prisma_migrations table is missing; existing mode requires the reviewed migration history. Verify the test database target. No schema or ledger changes were made.",
    };
  }

  const expected = new Set([...HISTORICAL, ...BASE]);
  const names = new Set(rows.map((row) => row.migration_name));
  const unexpected = [...names].filter((name) => !expected.has(name));
  if (unexpected.length) {
    return {
      ok: false,
      reason: "Ledger contains unexpected migration names. Compare this test branch's migration history with the approved existing-database ledger before proceeding.",
    };
  }

  const unresolved = rows.filter((row) => !row.finished_at && !row.rolled_back_at);
  if (unresolved.length) {
    return { ok: false, reason: "Ledger contains a failed or unfinished migration attempt." };
  }

  const missing = [...expected].filter((name) => rows.filter(
    (row) => row.migration_name === name && row.finished_at && !row.rolled_back_at,
  ).length !== 1);
  if (missing.length) {
    return {
      ok: false,
      reason: "Ledger is missing or duplicates an expected successful migration. Confirm whether this test branch should match the existing-database history; do not switch to fresh mode to bypass this check.",
    };
  }

  const baseline = rows.find(
    (row) => row.migration_name === "000000000000_baseline" && row.finished_at && !row.rolled_back_at,
  );
  if (Number(baseline.applied_steps_count) !== 0) {
    return { ok: false, reason: "Existing-database baseline marker is expected to have zero executed steps." };
  }

  if (rows.some((row) => PAYMENT.includes(row.migration_name))) {
    return { ok: false, reason: "A payment migration is already present; this preflight only supports the known pre-payment ledger." };
  }
  return { ok: true };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const match = argv[index].match(/^--(expect|database|host)=(.*)$/);
    if (match) options[match[1]] = match[2];
    else if (["--expect", "--database", "--host"].includes(argv[index])) options[argv[index].slice(2)] = argv[++index];
    else throw new Error("Use --expect existing|fresh|reconciled --database <database-name> --host <confirmed-hostname>.");
  }
  if (!["existing", "fresh", "reconciled"].includes(options.expect)) {
    throw new Error("Specify --expect existing, fresh, or reconciled.");
  }
  if (!options.database || !/^[A-Za-z0-9_.-]+$/.test(options.database)) {
    throw new Error("Specify an expected database name using --database.");
  }
  if (!options.host || !/^[A-Za-z0-9.-]+$/.test(options.host)) {
    throw new Error("Specify the exact confirmed database hostname using --host.");
  }
  return options;
}

function normalizeDatabaseUrlInput(rawUrl) {
  if (typeof rawUrl !== "string") return "";
  let value = rawUrl.trim();
  if (value.length >= 2 && ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'")))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function inspectDatabaseUrl(rawUrl) {
  const value = normalizeDatabaseUrlInput(rawUrl);
  const empty = value.length === 0;
  if (empty) return { empty, protocol: null, hostnameExists: false, decodedDatabaseName: null, urlParsingSucceeded: false };

  let databaseUrl;
  try {
    databaseUrl = new URL(value);
  } catch {
    return { empty, protocol: null, hostnameExists: false, decodedDatabaseName: null, urlParsingSucceeded: false };
  }

  let decodedDatabaseName = null;
  try {
    decodedDatabaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, "")) || null;
  } catch {
    // The URL parsed, but its database path is not valid percent-encoding.
  }
  return {
    empty,
    protocol: databaseUrl.protocol,
    hostnameExists: Boolean(databaseUrl.hostname),
    decodedDatabaseName,
    urlParsingSucceeded: true,
  };
}

function formatDatabaseUrlDiagnostic(details) {
  const printable = (value) => value === null ? "<none>" : String(value);
  return `DATABASE_URL details: empty=${details.empty}; protocol=${printable(details.protocol)}; hostnameExists=${details.hostnameExists}; decodedDatabaseName=${printable(details.decodedDatabaseName)}; urlParsingSucceeded=${details.urlParsingSucceeded}.`;
}

function validateDatabaseTarget(rawUrl, { database, host }) {
  const details = inspectDatabaseUrl(rawUrl);
  let databaseUrl;
  if (details.empty) {
    return { ok: false, reason: "DATABASE_URL was not received; no connection was attempted." };
  }
  if (!details.urlParsingSucceeded) {
    return { ok: false, reason: "DATABASE_URL is malformed; provide the raw absolute PostgreSQL URL. No connection was attempted." };
  }
  try {
    databaseUrl = new URL(normalizeDatabaseUrlInput(rawUrl));
  } catch {
    return { ok: false, reason: "DATABASE_URL is malformed; provide the raw absolute PostgreSQL URL without surrounding quotes or command text. No connection was attempted." };
  }

  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    return { ok: false, reason: "DATABASE_URL must use PostgreSQL; no connection was attempted." };
  }

  let actualDatabase;
  try {
    actualDatabase = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  } catch {
    return { ok: false, reason: "DATABASE_URL is invalid; no connection was attempted." };
  }
  if (!actualDatabase) {
    return { ok: false, reason: "DATABASE_URL does not specify a database; no connection was attempted." };
  }
  if (!databaseUrl.hostname) {
    return { ok: false, reason: "DATABASE_URL does not specify a hostname; no connection was attempted." };
  }
  if (actualDatabase !== database) {
    return { ok: false, reason: `DATABASE_URL database name does not match --database (${database}); no connection was attempted.` };
  }
  if (databaseUrl.hostname.toLowerCase() !== host.toLowerCase()) {
    return { ok: false, reason: "DATABASE_URL host does not match --host; no connection was attempted." };
  }
  return { ok: true, databaseUrl };
}

function createPrismaClient(databaseUrl) {
  return new PrismaClient({ datasourceUrl: databaseUrl.toString() });
}

async function hasMigrationLedger(tx) {
  const result = await tx.$queryRaw`SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = '_prisma_migrations'
  ) AS table_exists`;
  return result[0]?.table_exists === true;
}

async function hasUserSchemaObjects(tx) {
  const result = await tx.$queryRaw`SELECT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  ) OR EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema()
      AND t.typtype IN ('e', 'd', 'r')
  ) OR EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = current_schema()
      AND p.prokind IN ('f', 'p')
  ) AS schema_has_objects`;
  return result[0]?.schema_has_objects === true;
}

function safeErrorDiagnostic(error) {
  const code = error?.code ?? error?.errorCode;
  const safeTypes = new Set([
    "PrismaClientInitializationError",
    "PrismaClientKnownRequestError",
    "PrismaClientUnknownRequestError",
    "PrismaClientRustPanicError",
    "PrismaClientValidationError",
    "TypeError",
    "Error",
  ]);
  const type = safeTypes.has(error?.name) ? error.name : "unknown error type";
  const known = {
    P1000: "Database authentication failed. Confirm the test branch credentials and database role permissions; credentials were not logged.",
    P1001: "Could not reach the database host. Confirm the test branch endpoint is active, network access is available, and DATABASE_URL matches --host.",
    P1002: "The database connection timed out. Confirm the test branch endpoint is active and retry.",
    P1003: "The configured database does not exist on this endpoint. Confirm the database name and test branch endpoint.",
    P1008: "The database operation timed out. Confirm the test branch is responsive and retry.",
    P1010: "The database rejected access. Confirm the test role has read access to the Prisma migration ledger.",
    P2021: "The Prisma migration ledger table is missing. Existing mode requires that table; verify the selected test database.",
    P2024: "Prisma timed out waiting for a database connection. Confirm connectivity and retry.",
    P2025: "The expected database record was not available. Recheck the selected test database and its migration history.",
    P2028: "The Prisma transaction timed out or closed before the read completed. Confirm test branch responsiveness and retry; no writes were requested.",
    MIGRATION_PREFLIGHT_DATABASE_IDENTITY_MISMATCH: "The connected database name differed from --database. No migration operation was run; verify the test endpoint.",
  };

  if (code === "P2010") {
    const sqlCode = error?.meta?.code;
    if (sqlCode === "42P01") {
      return { code: "P2010/42P01", type, message: "The Prisma migration ledger table is missing or not visible in the active schema. Verify the selected test database and schema." };
    }
    if (sqlCode === "3F000") {
      return { code: "P2010/3F000", type, message: "The configured database schema does not exist. Verify the test branch schema configuration." };
    }
    if (sqlCode === "42501") {
      return { code: "P2010/42501", type, message: "The database role lacks permission to read the migration ledger. Grant the required read access or use the approved test role." };
    }
    return {
      code: "P2010",
      type,
      message: "Prisma failed to execute or decode a read-only SQL query. Check query compatibility, active schema, and read permissions; raw database metadata was suppressed.",
    };
  }

  if (Object.prototype.hasOwnProperty.call(known, code)) {
    return { code, type, message: known[code] };
  }
  if (type === "PrismaClientInitializationError") {
    return {
      code: typeof code === "string" && /^P\d{4}$/.test(code) ? code : null,
      type,
      message: "Prisma could not initialize a database connection. Confirm the test target, generated Prisma Client, and runtime configuration; raw error details were suppressed.",
    };
  }
  return {
    type,
    code: typeof code === "string" && /^P\d{4}$/.test(code) ? code : null,
    message: type === "unknown error type"
      ? "An unexpected preflight error occurred. Check local Prisma/runtime configuration; raw error details were suppressed."
      : `Preflight failed with ${type}${typeof code === "string" && /^P\d{4}$/.test(code) ? ` (${code})` : ""}. Check the test database connection and migration ledger; raw error details were suppressed.`,
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }

  const layout = validateMigrationDirectories(fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name));
  if (!layout.ok) {
    console.error(`${layout.reason} Refusing to connect or continue.`);
    process.exitCode = 1;
    return;
  }

  const localDatabaseUrl = readLocalDatabaseUrl();
  const target = validateDatabaseTarget(localDatabaseUrl, options);
  if (!target.ok) {
    const wrongTarget = /host does not match|database name does not match/.test(target.reason);
    const guidance = wrongTarget
      ? " Update .env.local locally with the confirmed test-branch URL before proceeding."
      : " Check DATABASE_URL in .env.local; no connection was attempted.";
    console.error(`${target.reason}${guidance} ${formatDatabaseUrlDiagnostic(inspectDatabaseUrl(localDatabaseUrl))}`);
    process.exitCode = 1;
    return;
  }
  const { databaseUrl } = target;

  let prisma;
  try {
    // Pass the same URL whose host and database name were checked above.
    prisma = createPrismaClient(databaseUrl);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const identity = await tx.$queryRaw`SELECT current_database() AS database_name`;
      const ledgerExists = await hasMigrationLedger(tx);
      const rows = ledgerExists
        ? await tx.$queryRaw`SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM "_prisma_migrations"`
        : [];
      const schemaHasObjects = options.expect === "fresh" ? await hasUserSchemaObjects(tx) : false;
      return { databaseName: identity[0].database_name, rows, ledgerExists, schemaHasObjects };
    }, { timeout: 10000 });

    if (result.databaseName !== options.database) {
      const error = new Error("Database identity mismatch");
      error.code = "MIGRATION_PREFLIGHT_DATABASE_IDENTITY_MISMATCH";
      throw error;
    }
    const validation = validateLedger(options.expect, result.rows, {
      ledgerExists: result.ledgerExists,
      schemaHasObjects: result.schemaHasObjects,
    });
    if (!validation.ok) {
      console.error(`Preflight rejected database ${result.databaseName}: ${validation.reason} No migration operation was run.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Read-only migration preflight passed for database ${result.databaseName} on host ${databaseUrl.hostname} (${options.expect} path).`);
    if (options.expect === "existing") {
      console.log("The baseline is a zero-step marker; Prisma 6 deploy may report the archived historical names as missing locally.");
    } else if (options.expect === "reconciled") {
      console.log("Ledger shape is reconciled: baseline, Laboratory, and Pharmacy are recorded; all seven payment/cleanup migrations remain pending. This check does not prove schema equivalence.");
    } else {
      console.log("The ledger and application schema are empty; the reviewed baseline and later active migrations can initialize this database.");
    }
  } catch (error) {
    const diagnostic = safeErrorDiagnostic(error);
    const code = diagnostic.code ? ` [${diagnostic.code}]` : "";
    const type = diagnostic.type ? ` (${diagnostic.type})` : "";
    console.error(`Read-only migration preflight failed${code}${type}: ${diagnostic.message} No migration operation was run.`);
    process.exitCode = 1;
  } finally {
    if (prisma) {
      try {
        await prisma.$disconnect();
      } catch {
        // Never replace the sanitized preflight diagnostic with a raw disconnect error.
      }
    }
  }
}

module.exports = { validateLedger, validateMigrationDirectories, parseArgs, normalizeDatabaseUrlInput, inspectDatabaseUrl, formatDatabaseUrlDiagnostic, validateDatabaseTarget, readLocalDatabaseUrl, createPrismaClient, hasMigrationLedger, hasUserSchemaObjects, safeErrorDiagnostic, EXPECTED_FILES, HISTORICAL, BASE, PAYMENT };
if (require.main === module) main();
