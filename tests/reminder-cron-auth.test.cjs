const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "app", "api", "cron", "reminders", "route.js"), "utf8");

async function loadRoute(processDueAppointmentReminders = async () => ({ processed: 0 })) {
  const source = await sourcePromise;
  const state = { calls: 0 };
  const dependencies = {
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) },
    Sentry: { withScope: (callback) => callback({ setTag() {} }), captureException() {} },
    processDueAppointmentReminders: async () => {
      state.calls += 1;
      return processDueAppointmentReminders();
    },
  };
  const transformed = source
    .replace('import { NextResponse } from "next/server";', "const { NextResponse } = dependencies;")
    .replace('import * as Sentry from "@sentry/nextjs";', "const Sentry = dependencies.Sentry;")
    .replace('import { processDueAppointmentReminders } from "@/lib/reminders";', "const { processDueAppointmentReminders } = dependencies;")
    .replace("export async function GET", "async function GET")
    .concat("\nreturn { GET };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

async function withCronSecret(value, callback) {
  const previous = process.env.CRON_SECRET;
  if (value === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = value;
  try { await callback(); }
  finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
}

test("missing cron secret rejects without running the job", async () => {
  await withCronSecret(undefined, async () => {
    const { GET, state } = await loadRoute();
    const response = await GET({ headers: new Headers() });
    assert.equal(response.status, 401);
    assert.equal(state.calls, 0);
  });
});

test("missing or incorrect bearer authorization rejects without running the job", async () => {
  await withCronSecret("test-only-secret-value", async () => {
    const { GET, state } = await loadRoute();
    for (const authorization of [null, "Bearer wrong-test-value"]) {
      const headers = new Headers();
      if (authorization) headers.set("authorization", authorization);
      const response = await GET({ headers });
      assert.equal(response.status, 401);
    }
    assert.equal(state.calls, 0);
  });
});

test("valid cron bearer authorization runs the reminder job", async () => {
  await withCronSecret("test-only-secret-value", async () => {
    const { GET, state } = await loadRoute(async () => ({ processed: 3 }));
    const response = await GET({ headers: new Headers({ authorization: "Bearer test-only-secret-value" }) });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { processed: 3 });
    assert.equal(state.calls, 1);
  });
});
