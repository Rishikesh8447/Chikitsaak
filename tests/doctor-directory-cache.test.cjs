const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const { addMinutes, endOfDay, format } = require("date-fns");

const sourcePromise = readFile(join(cwd(), "actions", "doctors-listing.js"), "utf8");
const adminSourcePromise = readFile(join(cwd(), "actions", "admin.js"), "utf8");

async function loadDoctorsListingActions() {
  const source = await sourcePromise;

  const state = {
    dbFindManyCalls: [],
    cacheRegistrations: [],
    cacheMap: new Map(),
    cacheInvocations: 0,
    doctors: [
      {
        id: "doc-1",
        name: "Dr. Alice Smith",
        specialty: "Cardiology",
        experience: 12,
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
      {
        id: "doc-2",
        name: "Dr. Bob Jones",
        specialty: "Cardiology",
        experience: 8,
        city: "Delhi",
        state: "Delhi",
        country: "India",
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
      {
        id: "doc-3",
        name: "Dr. Clara Oswald",
        specialty: "Dermatology",
        experience: 5,
        city: "Bangalore",
        state: "Karnataka",
        country: "India",
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
    ],
  };

  const dependencies = {
    addMinutes,
    endOfDay,
    format,
    resolveDoctorPublicNames: async (docs) => docs.map(({ clerkUserId, ...d }) => d),
    unstable_cache: (cb, keyParts, options) => {
      state.cacheRegistrations.push({ keyParts, options });
      return async (...args) => {
        state.cacheInvocations++;
        const cacheKey = `${keyParts.join(",")}-${JSON.stringify(args)}`;
        if (state.cacheMap.has(cacheKey)) {
          return state.cacheMap.get(cacheKey);
        }
        const result = await cb(...args);
        state.cacheMap.set(cacheKey, result);
        return result;
      };
    },
    db: {
      user: {
        findMany: async (args) => {
          state.dbFindManyCalls.push(args);
          let filtered = [...state.doctors];
          if (args?.where?.verificationStatus) {
            filtered = filtered.filter((d) => d.verificationStatus === args.where.verificationStatus);
          }
          if (args?.where?.specialty) {
            filtered = filtered.filter((d) => d.specialty === args.where.specialty);
          }
          if (args?.where?.city?.equals) {
            filtered = filtered.filter(
              (d) => d.city.toLowerCase() === args.where.city.equals.toLowerCase()
            );
          }
          if (args?.where?.experience?.gte) {
            filtered = filtered.filter((d) => d.experience >= args.where.experience.gte);
          }
          if (args?.where?.OR) {
            filtered = filtered.filter((d) =>
              args.where.OR.some((cond) => {
                const key = Object.keys(cond)[0];
                return (
                  d[key] &&
                  d[key].toLowerCase().includes(cond[key].contains.toLowerCase())
                );
              })
            );
          }
          if (args?.orderBy?.experience === "desc") {
            filtered.sort((a, b) => b.experience - a.experience);
          } else if (args?.orderBy?.name === "asc") {
            filtered.sort((a, b) => a.name.localeCompare(b.name));
          }
          return filtered;
        },
      },
      availability: {
        findMany: async () => [],
      },
      appointment: {
        findMany: async () => [],
      },
    },
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replaceAll("export async function", "async function")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { addMinutes, endOfDay, format } from "date-fns";', "const { addMinutes, endOfDay, format } = dependencies;")
    .replace('import { resolveDoctorPublicNames } from "@/lib/doctor-name";', "const { resolveDoctorPublicNames } = dependencies;")
    .replace('import { unstable_cache } from "next/cache";', "const { unstable_cache } = dependencies;")
    .concat("\nreturn { getDoctorsBySpecialty, searchDoctors, getCachedAllDoctors, getCachedDoctorsBySpecialty };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

test("unstable_cache is registered with 60s revalidation and 'doctors-directory' tag", async () => {
  const { state } = await loadDoctorsListingActions();

  assert.equal(state.cacheRegistrations.length, 2);
  const allDoctorsCache = state.cacheRegistrations.find(
    (r) => r.keyParts.includes("all-verified-doctors")
  );
  assert.ok(allDoctorsCache, "all-verified-doctors cache must be registered");
  assert.equal(allDoctorsCache.options.revalidate, 60);
  assert.deepEqual(allDoctorsCache.options.tags, ["doctors-directory"]);

  const specialtyCache = state.cacheRegistrations.find(
    (r) => r.keyParts.includes("doctors-by-specialty")
  );
  assert.ok(specialtyCache, "doctors-by-specialty cache must be registered");
  assert.equal(specialtyCache.options.revalidate, 60);
  assert.deepEqual(specialtyCache.options.tags, ["doctors-directory"]);
});

test("default searchDoctors() hits cache on subsequent calls without querying db", async () => {
  const { searchDoctors, state } = await loadDoctorsListingActions();

  // First call: should query database and populate cache
  const firstResult = await searchDoctors();
  assert.equal(firstResult.doctors.length, 3);
  assert.equal(state.dbFindManyCalls.length, 1);

  // Second call with no arguments: should return from cache
  const secondResult = await searchDoctors();
  assert.equal(secondResult.doctors.length, 3);
  assert.equal(state.dbFindManyCalls.length, 1, "Database should not be queried on second call");

  // Third call with empty object: should also hit the cache
  const thirdResult = await searchDoctors({});
  assert.equal(thirdResult.doctors.length, 3);
  assert.equal(state.dbFindManyCalls.length, 1, "Database should not be queried with empty options");
});

test("getDoctorsBySpecialty() caches results per specialty and normalizes URL encoding", async () => {
  const { getDoctorsBySpecialty, state } = await loadDoctorsListingActions();

  // First call for Cardiology
  const cardioResult1 = await getDoctorsBySpecialty("Cardiology");
  assert.equal(cardioResult1.doctors.length, 2);
  assert.equal(state.dbFindManyCalls.length, 1);

  // Second call for Cardiology: cache hit
  const cardioResult2 = await getDoctorsBySpecialty("Cardiology");
  assert.equal(cardioResult2.doctors.length, 2);
  assert.equal(state.dbFindManyCalls.length, 1, "Second Cardiology call should hit cache");

  // Call for Dermatology: different specialty, queries db once
  const dermaResult1 = await getDoctorsBySpecialty("Dermatology");
  assert.equal(dermaResult1.doctors.length, 1);
  assert.equal(state.dbFindManyCalls.length, 2, "Dermatology should query db for new specialty");

  // Second call for Dermatology: cache hit
  const dermaResult2 = await getDoctorsBySpecialty("Dermatology");
  assert.equal(dermaResult2.doctors.length, 1);
  assert.equal(state.dbFindManyCalls.length, 2);

  // Test URL encoding normalization: "General%20Medicine" vs "General Medicine"
  const encodedResult1 = await getDoctorsBySpecialty("General%20Medicine");
  assert.equal(state.dbFindManyCalls.length, 3);
  const encodedResult2 = await getDoctorsBySpecialty("General Medicine");
  assert.equal(state.dbFindManyCalls.length, 3, "Decoded version should share cache key with encoded version");
});

test("searchDoctors with active filters bypasses all-doctors cache and performs dynamic query", async () => {
  const { searchDoctors, state } = await loadDoctorsListingActions();

  // Baseline: populate default cache
  await searchDoctors();
  assert.equal(state.dbFindManyCalls.length, 1);

  // Query by text filter: should NOT hit all-doctors cache
  const searchResult = await searchDoctors({ query: "Alice" });
  assert.equal(searchResult.doctors.length, 1);
  assert.equal(searchResult.doctors[0].name, "Dr. Alice Smith");
  assert.equal(state.dbFindManyCalls.length, 2, "Filter query should bypass cache");

  // Query by city filter: should bypass cache
  const cityResult = await searchDoctors({ city: "Mumbai" });
  assert.equal(cityResult.doctors.length, 1);
  assert.equal(state.dbFindManyCalls.length, 3, "City filter should bypass cache");

  // Query by experience filter: should bypass cache
  const expResult = await searchDoctors({ minExperience: 10 });
  assert.equal(expResult.doctors.length, 1);
  assert.equal(state.dbFindManyCalls.length, 4, "Experience filter should bypass cache");

  // Sort by experience: should bypass default name-sorted cache
  const sortedResult = await searchDoctors({ sortBy: "experience" });
  assert.equal(sortedResult.doctors.length, 3);
  assert.equal(sortedResult.doctors[0].experience, 12);
  assert.equal(state.dbFindManyCalls.length, 5, "Sort by experience should bypass cache");
});

test("cache invalidation refreshes doctor directory data when admin verifies a doctor", async () => {
  const { searchDoctors, state } = await loadDoctorsListingActions();

  // Populate cache initially
  const initial = await searchDoctors();
  assert.equal(initial.doctors.length, 3);
  assert.equal(state.dbFindManyCalls.length, 1);

  // Add a newly verified doctor to the database
  state.doctors.push({
    id: "doc-4",
    name: "Dr. David Tennant",
    specialty: "Neurology",
    experience: 15,
    city: "Kolkata",
    state: "West Bengal",
    country: "India",
    role: "DOCTOR",
    verificationStatus: "VERIFIED",
  });

  // Verify that before cache invalidation, cache still returns 3 doctors
  const cached = await searchDoctors();
  assert.equal(cached.doctors.length, 3);
  assert.equal(state.dbFindManyCalls.length, 1);

  // Invalidate cache (simulating revalidateTag / TTL expiration)
  state.cacheMap.clear();

  // Next call should fetch fresh data including the new doctor
  const fresh = await searchDoctors();
  assert.equal(fresh.doctors.length, 4);
  assert.equal(state.dbFindManyCalls.length, 2, "Fresh call should query database after cache clear");
  assert.ok(fresh.doctors.some((d) => d.name === "Dr. David Tennant"));
});

test("admin updateDoctorStatus and updateDoctorActiveStatus trigger revalidation for /doctors and /doctors/[specialty]", async () => {
  const adminSource = await adminSourcePromise;
  const revalidated = [];

  const dependencies = {
    auth: async () => ({ userId: "clerk-admin" }),
    clerkClient: async () => ({}),
    revalidatePath: (path, type) => revalidated.push({ path, type }),
    flagPaymentPayoutsForReview: async () => {},
    releasePaymentPayoutAllocations: async () => {},
    recordPaymentPayoutTransfer: async () => {},
    db: {
      $transaction: async (work) => work(dependencies.db),
      user: {
        findUnique: async () => ({ id: "admin-id", role: "ADMIN" }),
        updateMany: async () => ({ count: 1 }),
      },
      notification: {
        createMany: async () => {},
      },
    },
  };

  const transformed = adminSource
    .replaceAll('"use server";', "")
    .replace('import { cache } from "react";', "const { cache = (fn) => fn } = dependencies;")
    .replaceAll("export async function", "async function")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { clerkClient } from "@clerk/nextjs/server";', "const { clerkClient } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace(
      'import { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } from "@/lib/payment-payouts.mjs";',
      "const { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } = dependencies;"
    )
    .concat("\nreturn { updateDoctorStatus, updateDoctorActiveStatus };");

  const { updateDoctorStatus, updateDoctorActiveStatus } = new Function("dependencies", transformed)(dependencies);

  // Test updateDoctorStatus
  const form1 = new Map([["doctorId", "doc-1"], ["status", "VERIFIED"]]);
  await updateDoctorStatus(form1);
  assert.ok(
    revalidated.some((r) => r.path === "/doctors"),
    "updateDoctorStatus must revalidate /doctors"
  );
  assert.ok(
    revalidated.some((r) => r.path === "/doctors/[specialty]" && r.type === "page"),
    "updateDoctorStatus must revalidate /doctors/[specialty]"
  );

  // Reset and test updateDoctorActiveStatus
  revalidated.length = 0;
  const form2 = new Map([["doctorId", "doc-1"], ["suspend", "true"]]);
  await updateDoctorActiveStatus(form2);
  assert.ok(
    revalidated.some((r) => r.path === "/doctors"),
    "updateDoctorActiveStatus must revalidate /doctors"
  );
  assert.ok(
    revalidated.some((r) => r.path === "/doctors/[specialty]" && r.type === "page"),
    "updateDoctorActiveStatus must revalidate /doctors/[specialty]"
  );
});

