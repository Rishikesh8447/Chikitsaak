const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const sourcePromise = readFile(join(cwd(), "actions", "credits.js"), "utf8");

async function createAllocator({ plan = "standard", historical = [] } = {}) {
  const source = await sourcePromise;
  const state = {
    user: { id: "user-1", clerkUserId: "clerk-user", role: "PATIENT", credits: 2 },
    transactions: structuredClone(historical),
  };
  const auth = async () => ({ userId: "clerk-user", has: ({ plan: requested }) => plan === requested });
  const db = {
    user: { findUnique: async () => structuredClone(state.user) },
    $transaction: async (work) => work({
      creditTransaction: {
        findFirst: async ({ where }) => state.transactions.find((entry) => entry.userId === where.userId && entry.type === where.type && where.allocationKey.in.includes(entry.allocationKey)) || null,
        createMany: async ({ data, skipDuplicates }) => {
          let count = 0;
          for (const entry of data) {
            if (state.transactions.some((existing) => existing.allocationKey === entry.allocationKey)) {
              if (skipDuplicates) continue;
              throw new Error("Duplicate allocation key");
            }
            state.transactions.push(structuredClone(entry));
            count += 1;
          }
          return { count };
        },
      },
      user: {
        update: async ({ data }) => {
          state.user.credits += data.credits.increment;
          return structuredClone(state.user);
        },
      },
    }),
  };
  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace("export async function checkAndAllocateCredits", "async function checkAndAllocateCredits")
    .replace("export async function getMyCreditPlan", "async function getMyCreditPlan")
    .replace("export async function getMyCreditTransactions", "async function getMyCreditTransactions")
    .concat("\nreturn { checkAndAllocateCredits, getMyCreditPlan };");
  const actions = new Function("dependencies", transformed)({ db, auth, revalidatePath: () => {} });
  return { ...actions, state, setPlan: (nextPlan) => { plan = nextPlan; } };
}

function monthKey(offset = 0) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function monthlyEntry(plan, month = monthKey()) {
  return { userId: "user-1", amount: plan === "premium" ? 24 : 10, type: "CREDIT_PURCHASE", packageId: plan, allocationKey: `user-1:${plan}:${month}` };
}

for (const [plan, monthlyCredits] of [["free_user", 0], ["standard", 10], ["premium", 24]]) {
  test(`${plan} entitlement reports its monthly allowance from the authenticated server context`, async () => {
    const { getMyCreditPlan } = await createAllocator({ plan });
    assert.deepEqual(await getMyCreditPlan(), { plan, monthlyCredits });
  });
}

test("first monthly allocation grants the selected plan amount once", async () => {
  const { checkAndAllocateCredits, state } = await createAllocator({ plan: "standard" });
  await checkAndAllocateCredits();
  assert.equal(state.user.credits, 12);
  assert.deepEqual(state.transactions.map(({ amount, packageId, allocationKey }) => ({ amount, packageId, allocationKey })), [
    { amount: 10, packageId: "standard", allocationKey: `user-1:monthly:${monthKey()}` },
  ]);
});

test("calling the allocator twice for the same plan grants only once", async () => {
  const { checkAndAllocateCredits, state } = await createAllocator({ plan: "standard" });
  await checkAndAllocateCredits();
  await checkAndAllocateCredits();
  assert.equal(state.user.credits, 12);
  assert.equal(state.transactions.length, 1);
});

for (const [initialPlan, changedPlan] of [["standard", "premium"], ["premium", "standard"]]) {
  test(`${initialPlan.toUpperCase()} to ${changedPlan.toUpperCase()} in the same month grants no second allocation`, async () => {
    const { checkAndAllocateCredits, state, setPlan } = await createAllocator({ plan: initialPlan });
    await checkAndAllocateCredits();
    const balanceAfterFirstAllocation = state.user.credits;
    const transactionAfterFirstAllocation = structuredClone(state.transactions);
    setPlan(changedPlan);
    await checkAndAllocateCredits();
    assert.equal(state.user.credits, balanceAfterFirstAllocation);
    assert.deepEqual(state.transactions, transactionAfterFirstAllocation);
  });
}

test("a new calendar month permits a new allocation", async () => {
  const { checkAndAllocateCredits, state } = await createAllocator({
    plan: "premium",
    historical: [monthlyEntry("standard", monthKey(-1))],
  });
  await checkAndAllocateCredits();
  assert.equal(state.user.credits, 26);
  assert.deepEqual(state.transactions.map((entry) => entry.allocationKey), [
    `user-1:standard:${monthKey(-1)}`,
    `user-1:monthly:${monthKey()}`,
  ]);
});

test("a historical plan-specific allocation this month remains untouched and prevents a second grant", async () => {
  const historical = monthlyEntry("standard");
  const { checkAndAllocateCredits, state } = await createAllocator({ plan: "premium", historical: [historical] });
  const before = structuredClone(state);
  await checkAndAllocateCredits();
  assert.deepEqual(state, before);
});

