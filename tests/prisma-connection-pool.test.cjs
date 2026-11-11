const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const prismaSourcePromise = readFile(join(cwd(), "lib", "prisma.js"), "utf8");

async function loadPrismaModule({ env = {}, mockGlobal = {} } = {}) {
  const source = await prismaSourcePromise;
  const constructorCalls = [];

  class MockPrismaClient {
    constructor(options) {
      constructorCalls.push(options);
      this.options = options;
    }
  }

  const transformed = source
    .replace(/import\s*\{\s*PrismaClient\s*\}\s*from\s*"@prisma\/client";/, "")
    .replace(/export function getClientOptions/g, "function getClientOptions")
    .replace(/export const db\s*=/g, "const db =");

  const factory = new Function(
    "PrismaClient",
    "process",
    "globalThis",
    `${transformed}\nreturn { db, getClientOptions };`
  );

  const mockProcess = { env: { ...env } };
  const exports = factory(MockPrismaClient, mockProcess, mockGlobal);

  return {
    ...exports,
    constructorCalls,
    mockGlobal,
  };
}

test("getClientOptions adds pgbouncer=true for Neon -pooler URLs when missing and preserves existing options", async () => {
  const { getClientOptions } = await loadPrismaModule();

  const rawUrl =
    "postgresql://user:p%40ss%2Fword@ep-green-frog-adc7hgyv-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require&application_name=chikitsaak%20app";
  const options = getClientOptions(rawUrl);

  assert.ok(options?.datasources?.db?.url);
  const parsed = new URL(options.datasources.db.url);

  assert.equal(parsed.username, "user");
  assert.equal(parsed.password, "p%40ss%2Fword");
  assert.equal(parsed.hostname, "ep-green-frog-adc7hgyv-pooler.c-2.us-east-1.aws.neon.tech");
  assert.equal(parsed.searchParams.get("pgbouncer"), "true");
  assert.equal(parsed.searchParams.get("connect_timeout"), "15");
  assert.equal(parsed.searchParams.get("pool_timeout"), "15");
  assert.equal(parsed.searchParams.get("sslmode"), "require");
  assert.equal(parsed.searchParams.get("channel_binding"), "require");
  assert.equal(parsed.searchParams.get("application_name"), "chikitsaak app");
  assert.equal(parsed.searchParams.has("connection_limit"), false);
});

test("getClientOptions preserves existing pgbouncer parameter and higher timeout values on -pooler URLs", async () => {
  const { getClientOptions } = await loadPrismaModule();

  const alreadyConfiguredUrl =
    "postgresql://user:pass@ep-cool-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=20&pool_timeout=25";
  const options = getClientOptions(alreadyConfiguredUrl);

  assert.equal(options, undefined);

  const explicitFalseUrl =
    "postgresql://user:pass@ep-cool-pooler.us-east-1.aws.neon.tech/neondb?pgbouncer=false&connect_timeout=15&pool_timeout=15";
  const falseOptions = getClientOptions(explicitFalseUrl);
  assert.equal(falseOptions, undefined);
});

test("getClientOptions does not inject pgbouncer=true for non-pooler URLs", async () => {
  const { getClientOptions } = await loadPrismaModule();

  const directUrl =
    "postgresql://user:pass@ep-direct-endpoint.us-east-1.aws.neon.tech/neondb?sslmode=require";
  const options = getClientOptions(directUrl);

  assert.ok(options?.datasources?.db?.url);
  const parsed = new URL(options.datasources.db.url);

  assert.equal(parsed.searchParams.has("pgbouncer"), false);
  assert.equal(parsed.searchParams.get("connect_timeout"), "15");
  assert.equal(parsed.searchParams.get("pool_timeout"), "15");
  assert.equal(parsed.searchParams.get("sslmode"), "require");
});

test("getClientOptions safely returns undefined for empty or invalid DATABASE_URL", async () => {
  const { getClientOptions } = await loadPrismaModule();

  assert.equal(getClientOptions(""), undefined);
  assert.equal(getClientOptions("not-a-valid-url"), undefined);
});

test("Prisma singleton attaches and reuses globalThis.prisma consistently in production and development", async () => {
  for (const nodeEnv of ["production", "development"]) {
    const sharedGlobal = {};
    const dbUrl =
      "postgresql://user:pass@ep-green-frog-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";

    const firstLoad = await loadPrismaModule({
      env: { NODE_ENV: nodeEnv, DATABASE_URL: dbUrl },
      mockGlobal: sharedGlobal,
    });

    assert.equal(firstLoad.constructorCalls.length, 1);
    assert.ok(sharedGlobal.prisma, `globalThis.prisma should be assigned when NODE_ENV=${nodeEnv}`);
    assert.equal(sharedGlobal.prisma, firstLoad.db);

    const parsedUrl = new URL(firstLoad.constructorCalls[0].datasources.db.url);
    assert.equal(parsedUrl.searchParams.get("pgbouncer"), "true");

    const secondLoad = await loadPrismaModule({
      env: { NODE_ENV: nodeEnv, DATABASE_URL: dbUrl },
      mockGlobal: sharedGlobal,
    });

    assert.equal(secondLoad.constructorCalls.length, 0);
    assert.equal(secondLoad.db, firstLoad.db);
  }
});

