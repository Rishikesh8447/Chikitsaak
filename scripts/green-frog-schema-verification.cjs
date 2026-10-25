#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_HOST = "ep-green-frog-adc7hgyv-pooler.c-2.us-east-1.aws.neon.tech";
const EXPECTED_DATABASE = "neondb";

const READ_QUERIES = Object.freeze({
  identity: "SELECT current_database() AS database_name, current_schema() AS schema_name",
  ledgerExists: `SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = '_prisma_migrations'
  ) AS ledger_exists`,
  ledger: `SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
    FROM "_prisma_migrations" ORDER BY started_at, migration_name`,
  relations: `SELECT c.relname AS object_name, c.relkind AS object_kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    ORDER BY c.relkind, c.relname`,
  columns: `SELECT c.table_name, c.ordinal_position, c.column_name,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null,
      pg_get_expr(d.adbin, d.adrelid) AS column_default
    FROM information_schema.columns c
    JOIN pg_class r ON r.relname = c.table_name
    JOIN pg_namespace n ON n.oid = r.relnamespace AND n.nspname = c.table_schema
    JOIN pg_attribute a ON a.attrelid = r.oid AND a.attname = c.column_name
      AND a.attnum = c.ordinal_position AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = r.oid AND d.adnum = a.attnum
    WHERE c.table_schema = current_schema()
    ORDER BY c.table_name, c.ordinal_position`,
  enums: `SELECT t.typname AS type_name, e.enumlabel AS label, e.enumsortorder AS sort_order
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = current_schema()
    ORDER BY t.typname, e.enumsortorder`,
  userDefinedTypes: `SELECT t.typname AS type_name, t.typtype AS type_kind,
      format_type(t.oid, NULL) AS formatted_type
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typtype IN ('e', 'd', 'r', 'c')
      AND t.typname NOT LIKE '\\_%'
    ORDER BY t.typname`,
  indexes: `SELECT table_class.relname AS table_name, index_class.relname AS index_name,
      pg_get_indexdef(index_class.oid) AS definition
    FROM pg_index i JOIN pg_class index_class ON index_class.oid = i.indexrelid
    JOIN pg_class table_class ON table_class.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = table_class.relnamespace
    WHERE n.nspname = current_schema()
    ORDER BY table_class.relname, index_class.relname`,
  constraints: `SELECT table_class.relname AS table_name, c.conname AS constraint_name,
      c.contype AS constraint_kind, c.convalidated AS validated,
      pg_get_constraintdef(c.oid, true) AS definition
    FROM pg_constraint c JOIN pg_class table_class ON table_class.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = table_class.relnamespace
    WHERE n.nspname = current_schema()
    ORDER BY table_class.relname, c.conname`,
  functions: `SELECT p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = current_schema() AND p.prokind IN ('f', 'p')
    ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`,
  triggers: `SELECT c.relname AS table_name, t.tgname AS trigger_name,
      pg_get_triggerdef(t.oid, true) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname`,
  views: `SELECT table_name AS view_name, view_definition AS definition
    FROM information_schema.views WHERE table_schema = current_schema()
    ORDER BY table_name`,
  nonzeroCredits: `SELECT count(*)::int AS count FROM "User" WHERE "credits" <> 0`,
  creditTransactions: `SELECT count(*)::int AS count FROM "CreditTransaction"`,
  payoutRows: `SELECT count(*)::int AS count FROM "Payout"`,
  legacyPayouts: `SELECT count(*)::int AS count FROM "Payout" WHERE "payoutKind"::text = 'LEGACY_CREDIT'`,
  creditNotifications: `SELECT count(*)::int AS count FROM "Notification" WHERE "type"::text = 'CREDIT_TRANSACTION'`,
});

const MIGRATION_SCOPE = Object.freeze([
  "000000000000_baseline",
  "20261012000000_laboratory_workflow",
  "20261016000000_pharmacy_partners",
  "20261020000000_appointment_payment_pending_status",
  "20261021000000_online_appointment_payments",
  "20261021120000_payment_reliability_review",
  "20261021130000_offline_appointment_payments",
  "20261021140000_cash_collection_audit",
  "20261024120000_payment_backed_doctor_payouts",
  "20261024130000_remove_legacy_credit_system",
]);

function validateGreenFrogTarget(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return { ok: false, reason: "DATABASE_URL is missing." };
  }
  let url;
  try {
    url = new URL(rawUrl.trim().replace(/^(['"])(.*)\1$/, "$2"));
  } catch {
    return { ok: false, reason: "DATABASE_URL is malformed." };
  }
  let database;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return { ok: false, reason: "DATABASE_URL database path is malformed." };
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || url.hostname.toLowerCase() !== EXPECTED_HOST
    || (url.port !== "" && url.port !== "5432")
    || database !== EXPECTED_DATABASE) {
    return { ok: false, reason: "DATABASE_URL does not target the approved Green Frog host and neondb database." };
  }
  return { ok: true, url };
}

function redact(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, "[redacted database URL]")
    .replace(/((?:password|passwd|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]");
}

async function readRows(tx, sql) {
  return tx.$queryRawUnsafe(sql);
}

async function collectInventory(prisma) {
  let failedBatch = "target identity";
  try {
    return await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

    const identity = (await readRows(tx, READ_QUERIES.identity))[0];
    if (identity?.database_name !== EXPECTED_DATABASE || identity?.schema_name !== "public") {
      throw Object.assign(new Error("Connected database identity did not match neondb/public."), { failedBatch });
    }

    failedBatch = "migration ledger";
    const ledgerExists = (await readRows(tx, READ_QUERIES.ledgerExists))[0]?.ledger_exists === true;
    const ledgerRows = ledgerExists ? await readRows(tx, READ_QUERIES.ledger) : [];

    failedBatch = "tables, columns, enum types, and labels";
    const [relations, columns, enums, userDefinedTypes] = await Promise.all([
      readRows(tx, READ_QUERIES.relations),
      readRows(tx, READ_QUERIES.columns),
      readRows(tx, READ_QUERIES.enums),
      readRows(tx, READ_QUERIES.userDefinedTypes),
    ]);

    failedBatch = "indexes, constraints, and foreign keys";
    const [indexes, constraints] = await Promise.all([
      readRows(tx, READ_QUERIES.indexes),
      readRows(tx, READ_QUERIES.constraints),
    ]);

    failedBatch = "functions, triggers, and views";
    const [functions, triggers, views] = await Promise.all([
      readRows(tx, READ_QUERIES.functions),
      readRows(tx, READ_QUERIES.triggers),
      readRows(tx, READ_QUERIES.views),
    ]);

    failedBatch = "legacy-credit cleanup preconditions";
    const relationNames = new Set(relations.map((row) => row.object_name));
    const columnNames = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
    const countIfAvailable = async (query, requiredRelations, requiredColumns = []) => {
      const missing = [
        ...requiredRelations.filter((name) => !relationNames.has(name)),
        ...requiredColumns.filter((name) => !columnNames.has(name)),
      ];
      if (missing.length) return { status: "missing evidence", missing };
      const count = (await readRows(tx, READ_QUERIES[query]))[0]?.count;
      return { status: "confirmed count", count: Number(count) };
    };

    const cleanupPreconditions = {
      usersWithNonzeroCredits: await countIfAvailable("nonzeroCredits", ["User"], ["User.credits"]),
      creditTransactionRows: await countIfAvailable("creditTransactions", ["CreditTransaction"]),
      legacyCreditPayoutRows: columnNames.has("Payout.payoutKind")
        ? await countIfAvailable("legacyPayouts", ["Payout"], ["Payout.payoutKind"])
        : await countIfAvailable("payoutRows", ["Payout"]).then((result) => result.status === "confirmed count"
          ? { status: "proxy count before payout migration", count: result.count, note: "Every pre-existing payout receives LEGACY_CREDIT in the payment-backed payout migration." }
          : result),
      creditTransactionNotifications: await countIfAvailable("creditNotifications", ["Notification"], ["Notification.type"]),
    };

    return {
      target: { status: "confirmed", host: EXPECTED_HOST, database: identity.database_name, schema: identity.schema_name },
      migrationScope: MIGRATION_SCOPE,
      evidence: {
        ledger: ledgerExists
          ? { status: ledgerRows.length === 0 ? "confirmed empty" : "confirmed rows", rows: ledgerRows }
          : { status: "missing evidence", reason: "_prisma_migrations table does not exist" },
        catalogBatches: {
          tablesAndColumns: { status: "confirmed", tableCount: relations.filter((row) => ["r", "p"].includes(row.object_kind)).length, columnCount: columns.length },
          userDefinedTypesAndEnums: { status: "confirmed", typeCount: userDefinedTypes.length, enumLabelCount: enums.length },
          indexesConstraintsAndForeignKeys: { status: "confirmed", indexCount: indexes.length, constraintCount: constraints.length },
          functionsTriggersAndViews: { status: "confirmed", functionCount: functions.length, triggerCount: triggers.length, viewCount: views.length },
        },
        relations,
        columns,
        userDefinedTypes,
        enumLabels: enums,
        indexes,
        constraintsAndForeignKeys: constraints,
        functions,
        triggers,
        views,
        legacyCreditCleanupPreconditions: cleanupPreconditions,
      },
    };
    }, { timeout: 30000 });
  } catch (error) {
    if (!error.failedBatch) error.failedBatch = failedBatch;
    throw error;
  }
}

async function main() {
  const parsed = dotenv.parse(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8"));
  const target = validateGreenFrogTarget(parsed.DATABASE_URL);
  if (!target.ok) {
    console.error(`Aborted before connecting: ${target.reason}`);
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient({ datasourceUrl: target.url.toString() });
  try {
    const inventory = await collectInventory(prisma);
    const output = `${JSON.stringify(inventory, (_key, value) => {
      if (typeof value === "bigint") return value.toString();
      if (typeof value === "string") return redact(value);
      return value;
    }, 2)}\n`;
    fs.writeFileSync(path.join(ROOT, "green-frog-catalog-inventory.txt"), output, { encoding: "utf8" });
    process.stdout.write(output);
  } catch (error) {
    const batch = error?.failedBatch || "database session";
    const code = error?.code ? ` (${redact(error.code)})` : "";
    console.error(`Read-only verification stopped in batch "${batch}": ${error?.name || "Error"}${code}: ${redact(error?.message)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { EXPECTED_HOST, EXPECTED_DATABASE, READ_QUERIES, MIGRATION_SCOPE, validateGreenFrogTarget, collectInventory, redact };
if (require.main === module) main();
