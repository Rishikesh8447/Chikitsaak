const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

function createMockCache() {
  const cacheMap = new Map();
  return function mockCache(fn) {
    return function cachedFn(...args) {
      const key = JSON.stringify(args);
      if (cacheMap.has(key)) {
        return cacheMap.get(key);
      }
      const promise = fn(...args);
      cacheMap.set(key, promise);
      return promise;
    };
  };
}

async function loadDoctorDashboardModules({
  user = { id: "doc-1", clerkUserId: "clerk-doc-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
  userId = "clerk-doc-1",
  mockCache = createMockCache(),
} = {}) {
  let userLookupCount = 0;

  const db = {
    user: {
      findUnique: async ({ where }) => {
        userLookupCount += 1;
        if (where.clerkUserId === userId) {
          return user ? structuredClone(user) : null;
        }
        return null;
      },
      findFirst: async ({ where }) => {
        userLookupCount += 1;
        if (where.clerkUserId === userId) {
          return user ? structuredClone(user) : null;
        }
        return null;
      },
    },
    availability: {
      findMany: async () => [{ id: "slot-1", doctorId: "doc-1", startTime: new Date(), endTime: new Date() }],
    },
    appointment: {
      findMany: async () => [{ id: "apt-1", doctorId: "doc-1", startTime: new Date(), status: "CONFIRMED" }],
      count: async () => 5,
      groupBy: async () => [{ patientId: "pat-1" }],
    },
    payout: {
      findMany: async () => [{ id: "payout-1", doctorId: "doc-1", amountPaise: 50000n, status: "PAID", createdAt: new Date() }],
    },
    appointmentPayment: {
      findMany: async () => [{ id: "pay-1", amountPaise: 50000n, payoutAllocations: [] }],
    },
    payoutPaymentAllocation: {
      findMany: async () => [],
    },
  };

  // 1. Build getCurrentUser from actions/onboarding.js
  const onboardingSource = await readFile(join(cwd(), "actions", "onboarding.js"), "utf8");
  const onboardingTransformed = onboardingSource
    .replaceAll('"use server"', "")
    .replace('import { cache } from "react";', "const { cache } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { checkUser } from "@/lib/checkUser";', "const checkUser = async () => null;")
    .replace('import { assertInitialRoleAssignment, persistInitialRoleAssignment, ROLE_ALREADY_ASSIGNED } from "@/lib/onboarding-role-assignment.mjs";', "")
    .replace('import { validateInitialDoctorProfile } from "@/lib/doctor-onboarding-validation.mjs";', "")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getCurrentUser };");

  const onboardingDeps = {
    cache: mockCache,
    db,
    auth: async () => ({ userId }),
    revalidatePath: () => {},
  };
  const { getCurrentUser } = new Function("dependencies", onboardingTransformed)(onboardingDeps);

  // 2. Build doctor actions from actions/doctor.js
  const doctorSource = await readFile(join(cwd(), "actions", "doctor.js"), "utf8");
  const doctorTransformed = doctorSource
    .replaceAll('"use server";', "")
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getDoctorAvailability, getDoctorAppointments };");

  const doctorDeps = {
    db,
    auth: async () => ({ userId }),
    getCurrentUser,
    revalidatePath: () => {},
    canTransitionAppointment: () => true,
    cancelAppointmentInTransaction: async () => {},
    CANCELLATION_ERRORS: {},
    createAppointmentNotificationPair: async () => {},
    parseConsultationPriceRupees: () => 500,
    sendAppointmentConfirmedEmail: async () => {},
    sendAppointmentCancelledEmail: async () => {},
  };
  const { getDoctorAvailability, getDoctorAppointments } = new Function(
    ...Object.keys(doctorDeps),
    doctorTransformed
  )(...Object.values(doctorDeps));

  // 3. Build payout actions from actions/payout.js
  const payoutSource = await readFile(join(cwd(), "actions", "payout.js"), "utf8");
  const paymentPayouts = await import("../lib/payment-payouts.mjs");
  const payoutTransformed = payoutSource
    .replaceAll('"use server";', "")
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getDoctorPayouts, getDoctorEarnings };");

  const payoutDeps = {
    db,
    auth: async () => ({ userId }),
    getCurrentUser,
    revalidatePath: () => {},
    measureServerTiming: async (_label, cb) => cb(),
    withSerializableRetries: async (fn) => fn(),
    ...paymentPayouts,
    BigInt,
  };
  const { getDoctorPayouts, getDoctorEarnings } = new Function(
    ...Object.keys(payoutDeps),
    payoutTransformed
  )(...Object.values(payoutDeps));

  // 4. Build analytics action from actions/analytics.js
  const analyticsSource = await readFile(join(cwd(), "actions", "analytics.js"), "utf8");
  const analyticsTransformed = analyticsSource
    .replaceAll('"use server";', "")
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getDoctorAnalytics };");

  const analyticsDeps = {
    db,
    auth: async () => ({ userId }),
    getCurrentUser,
    measureServerTiming: async (_label, cb) => cb(),
  };
  const { getDoctorAnalytics } = new Function(
    ...Object.keys(analyticsDeps),
    analyticsTransformed
  )(...Object.values(analyticsDeps));

  return {
    getCurrentUser,
    getDoctorAvailability,
    getDoctorAppointments,
    getDoctorEarnings,
    getDoctorPayouts,
    getDoctorAnalytics,
    getUserLookupCount: () => userLookupCount,
  };
}

test("Doctor Dashboard render: 5 parallel actions + initial route lookup execute exactly 1 database user query", async () => {
  const harness = await loadDoctorDashboardModules();

  // Simulates DoctorDashboardPage render:
  // Step 1: Initial page check
  const routeUser = await harness.getCurrentUser();
  assert.equal(routeUser.role, "DOCTOR");
  assert.equal(routeUser.verificationStatus, "VERIFIED");

  // Step 2: 5 parallel dashboard actions
  const [appointments, availability, earnings, payouts, analytics] = await Promise.all([
    harness.getDoctorAppointments(),
    harness.getDoctorAvailability(),
    harness.getDoctorEarnings(),
    harness.getDoctorPayouts(),
    harness.getDoctorAnalytics(30),
  ]);

  // Assert all actions succeeded
  assert.ok(appointments);
  assert.equal(availability.success, true);
  assert.ok(earnings.earnings);
  assert.ok(payouts.payouts);
  assert.ok(analytics.metrics);

  // Assert user lookup was executed exactly ONCE across all 6 invocations
  assert.equal(
    harness.getUserLookupCount(),
    1,
    "Expected exactly 1 database user lookup during the entire doctor dashboard render pass"
  );
});

test("Doctor actions reject unauthenticated callers when userId is absent", async () => {
  const harness = await loadDoctorDashboardModules({ user: null, userId: null });

  const availabilityRes = await harness.getDoctorAvailability();
  assert.equal(availabilityRes.success, false);
  assert.equal(availabilityRes.error, "Unauthorized");

  await assert.rejects(harness.getDoctorAppointments(), /Unauthorized/);
  await assert.rejects(harness.getDoctorEarnings(), /Unauthorized/);
  await assert.rejects(harness.getDoctorPayouts(), /Unauthorized/);
  await assert.rejects(harness.getDoctorAnalytics(30), /Unauthorized/);
});

test("Doctor actions reject non-doctor users (e.g. PATIENT)", async () => {
  const patientUser = { id: "pat-1", clerkUserId: "clerk-pat-1", role: "PATIENT", verificationStatus: "VERIFIED" };
  const harness = await loadDoctorDashboardModules({ user: patientUser, userId: "clerk-pat-1" });

  const availabilityRes = await harness.getDoctorAvailability();
  assert.equal(availabilityRes.success, false);
  assert.equal(availabilityRes.error, "Doctor not found");

  await assert.rejects(harness.getDoctorAppointments(), /Doctor not found/);
  await assert.rejects(harness.getDoctorEarnings(), /Doctor not found/);
  await assert.rejects(harness.getDoctorPayouts(), /Doctor not found/);
  await assert.rejects(harness.getDoctorAnalytics(30), /Only verified doctors can access doctor analytics/);
});

test("Doctor actions reject unverified doctors (e.g. PENDING or REJECTED)", async () => {
  const pendingDoctor = { id: "doc-pending", clerkUserId: "clerk-doc-pending", role: "DOCTOR", verificationStatus: "PENDING" };
  const harness = await loadDoctorDashboardModules({ user: pendingDoctor, userId: "clerk-doc-pending" });

  const availabilityRes = await harness.getDoctorAvailability();
  assert.equal(availabilityRes.success, false);
  assert.equal(availabilityRes.error, "Doctor not found");

  await assert.rejects(harness.getDoctorAppointments(), /Doctor not found/);
  await assert.rejects(harness.getDoctorEarnings(), /Doctor not found/);
  await assert.rejects(harness.getDoctorPayouts(), /Doctor not found/);
  await assert.rejects(harness.getDoctorAnalytics(30), /Only verified doctors can access doctor analytics/);
});

