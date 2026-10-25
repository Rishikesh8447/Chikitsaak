const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { parseConsultationPriceRupees } = require("../lib/razorpay.mjs");

async function loadUpdateAction({ userId = "clerk-doctor", doctor = { id: "doctor-1" } } = {}) {
  const source = await readFile(join(process.cwd(), "actions", "doctor.js"), "utf8");
  const transformed = source.replace(/^import .*;\r?\n/gm, "").replaceAll("export async function", "async function");
  const state = { lookups: 0, updates: [] };
  const dependencies = {
    auth: async () => ({ userId }),
    revalidatePath: () => {},
    parseConsultationPriceRupees,
    db: { user: {
      findUnique: async () => { state.lookups += 1; return doctor; },
      update: async (args) => { state.updates.push(args); return args; },
    } },
  };
  const factory = new Function("dependencies", `const { auth, revalidatePath, parseConsultationPriceRupees, db } = dependencies; ${transformed}\nreturn updateConsultationPrice;`);
  return { update: factory(dependencies), state };
}

test("only a verified doctor can save a whole-rupee consultation price", async () => {
  const { update, state } = await loadUpdateAction();
  assert.deepEqual(await update(new Map([["consultationPriceRupees", "500"]])), { success: true, consultationPriceRupees: 500 });
  assert.equal(state.updates[0].where.id, "doctor-1");
  assert.deepEqual(state.updates[0].data, { consultationPriceRupees: 500 });
});

test("unverified users and invalid rupee prices cannot update the doctor price", async () => {
  const unverified = await loadUpdateAction({ doctor: null });
  await assert.rejects(unverified.update(new Map([["consultationPriceRupees", "500"]])), /Not authorized/);
  assert.equal(unverified.state.updates.length, 0);

  const invalid = await loadUpdateAction();
  assert.equal((await invalid.update(new Map([["consultationPriceRupees", "500.5"]]))).success, false);
  assert.equal(invalid.state.lookups, 0);
  assert.equal(invalid.state.updates.length, 0);
});
