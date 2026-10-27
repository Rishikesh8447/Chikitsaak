const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadEarningsAction({
  doctor = { id: "doc-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
  completedCount = 5,
  payments = [],
  allocations = [],
} = {}) {
  const source = await readFile(join(process.cwd(), "actions", "payout.js"), "utf8");
  const paymentPayouts = await import("../lib/payment-payouts.mjs");
  const dependencies = {
    db: {
      user: { findFirst: async () => doctor },
      appointment: { count: async () => completedCount },
      appointmentPayment: {
        findMany: async () => payments,
      },
      payoutPaymentAllocation: {
        findMany: async () => allocations,
      },
    },
    auth: async () => ({ userId: "clerk-doctor" }),
    revalidatePath: () => {},
    measureServerTiming: async (_label, cb) => cb(),
    withSerializableRetries: async (fn) => fn(),
    ...paymentPayouts,
    BigInt,
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace(/import\s+.*?\s+from\s+['"][^'"]+['"];?/g, "")
    .replace(/export async function/g, "async function");

  const fn = new Function(...Object.keys(dependencies), `${transformed}\nreturn { getDoctorEarnings };`);
  return fn(...Object.values(dependencies));
}

test("getDoctorEarnings accurately partitions consolidated payments and allocations", async () => {
  const payments = [
    { id: "pay-1", amountPaise: 50000, payoutAllocations: [] },
    { id: "pay-2", amountPaise: 30000, payoutAllocations: [{ id: "alloc-1" }] },
    { id: "pay-3", amountPaise: 20000, payoutAllocations: [{ id: "alloc-2" }] },
  ];
  const allocations = [
    { status: "RESERVED", amountPaise: 30000 },
    { status: "PAID", amountPaise: 20000 },
  ];

  const { getDoctorEarnings } = await loadEarningsAction({ payments, allocations, completedCount: 3 });
  const result = await getDoctorEarnings();

  assert.equal(result.earnings.completedAppointments, 3);
  assert.equal(result.earnings.paymentCollections.currency, "INR");
  assert.equal(result.earnings.paymentCollections.collectedPaise, "100000"); // 50000 + 30000 + 20000
  assert.equal(result.earnings.paymentCollections.availablePaise, "50000");  // only pay-1 has no allocations
  assert.equal(result.earnings.paymentCollections.reservedPaise, "30000");
  assert.equal(result.earnings.paymentCollections.paidOutPaise, "20000");
});

test("getDoctorEarnings handles empty payments and allocations cleanly", async () => {
  const { getDoctorEarnings } = await loadEarningsAction({ payments: [], allocations: [], completedCount: 0 });
  const result = await getDoctorEarnings();

  assert.equal(result.earnings.completedAppointments, 0);
  assert.equal(result.earnings.paymentCollections.collectedPaise, "0");
  assert.equal(result.earnings.paymentCollections.availablePaise, "0");
  assert.equal(result.earnings.paymentCollections.reservedPaise, "0");
  assert.equal(result.earnings.paymentCollections.paidOutPaise, "0");
});
