const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const dateFns = require("date-fns");

const sourcePromise = readFile(join(cwd(), "actions", "appointments.js"), "utf8");

async function loadAppointmentsModule({
  doctorStatus = "VERIFIED",
  doctorRole = "DOCTOR",
  availabilitySlots = [],
  appointments = [],
} = {}) {
  const source = await sourcePromise;
  const state = {
    doctorLookupQueries: [],
    doctorFindUniqueQueries: [],
    availabilityQueries: [],
    appointmentQueries: [],
  };

  const mockDoctorRecord = {
    id: "doctor-uuid-1",
    clerkUserId: "clerk-doc-1",
    name: "Dr. Ananya Sharma",
    imageUrl: "https://example.test/ananya.jpg",
    specialty: "Cardiology",
    experience: 12,
    description: "Experienced cardiologist",
    city: "New Delhi",
    state: "Delhi",
    country: "India",
    consultationPriceRupees: 600,
    role: doctorRole,
    verificationStatus: doctorStatus,
  };

  const dependencies = {
    db: {
      user: {
        findFirst: async ({ where }) => {
          state.doctorLookupQueries.push(where);
          const matchesId =
            where.id === "doctor-uuid-1" ||
            where.clerkUserId === "doctor-uuid-1" ||
            (Array.isArray(where.OR) && where.OR.some((c) => c.id === "doctor-uuid-1" || c.clerkUserId === "doctor-uuid-1"));
          if (
            matchesId &&
            where.role === doctorRole &&
            where.verificationStatus === doctorStatus
          ) {
            return structuredClone(mockDoctorRecord);
          }
          return null;
        },
        findUnique: async ({ where }) => {
          state.doctorFindUniqueQueries.push(where);
          if (
            where.id === "doctor-uuid-1" &&
            where.role === doctorRole &&
            where.verificationStatus === doctorStatus
          ) {
            return structuredClone(mockDoctorRecord);
          }
          return null;
        },
      },
      availability: {
        findMany: async ({ where }) => {
          state.availabilityQueries.push(where);
          return structuredClone(availabilitySlots);
        },
      },
      appointment: {
        findMany: async ({ where }) => {
          state.appointmentQueries.push(where);
          return structuredClone(appointments);
        },
      },
    },
    auth: async () => ({ userId: "clerk-test-user" }),
    revalidatePath: () => {},
    resolveDoctorPublicNames: async (doctors) => doctors,
    getVideoJoinWindowError: () => null,
    measureServerTiming: async (_label, cb) => cb(),
    withSerializableRetries: (fn) => fn(),
    isOriginalAppointmentPaymentVerified: () => true,
    sendAppointmentBookedEmail: async () => {},
    sendAppointmentRescheduledEmail: async () => {},
    ...dateFns,
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { Vonage } from "@vonage/server-sdk";', "const Vonage = class {};")
    .replace('import { addDays, addMinutes, format, endOfDay } from "date-fns";', "const { addDays, addMinutes, format, endOfDay } = dependencies;")
    .replace('import { Auth } from "@vonage/auth";', "const Auth = class {};")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const createAppointmentNotificationPair = async () => {};")
    .replace('import { resolveDoctorPublicNames } from "@/lib/doctor-name";', "const { resolveDoctorPublicNames } = dependencies;")
    .replace('import { getVideoJoinWindowError } from "@/lib/appointment-time.mjs";', "const { getVideoJoinWindowError } = dependencies;")
    .replace('import { measureServerTiming } from "@/lib/server-timing.mjs";', "const { measureServerTiming } = dependencies;")
    .replace('import { withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";', "const { withSerializableRetries } = dependencies;")
    .replace('import { isOriginalAppointmentPaymentVerified } from "@/lib/follow-up-appointment.mjs";', "const { isOriginalAppointmentPaymentVerified } = dependencies;")
    .replace('import { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } from "@/lib/email";', "const { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { getDoctorById, getAvailableTimeSlots };");

  const moduleExports = new Function("dependencies", transformed)(dependencies);
  return { ...moduleExports, state, mockDoctorRecord };
}

test("getDoctorById returns verified doctor with internal server verification tag", async () => {
  const { getDoctorById, state } = await loadAppointmentsModule();
  const result = await getDoctorById("doctor-uuid-1");

  assert.ok(result.doctor, "Verified doctor must be returned");
  assert.equal(result.doctor.id, "doctor-uuid-1");
  assert.equal(result.doctor.role, "DOCTOR");
  assert.equal(result.doctor.verificationStatus, "VERIFIED");
  assert.equal(result.doctor[Symbol.for("chikitsaak.verifiedDoctor")], true);
  assert.equal(state.doctorLookupQueries.length, 1);
});

test("getAvailableTimeSlots skips database doctor lookup when pre-verified doctor object is provided", async () => {
  const { getDoctorById, getAvailableTimeSlots, state } = await loadAppointmentsModule();
  const { doctor } = await getDoctorById("doctor-uuid-1");

  // Call getAvailableTimeSlots with pre-verified doctor
  const slots = await getAvailableTimeSlots("doctor-uuid-1", "2030-01-01", doctor);

  assert.ok(slots.days, "Slots days array must be returned");
  assert.equal(state.doctorFindUniqueQueries.length, 0, "Redundant database doctor lookup must be completely skipped");
  assert.equal(state.availabilityQueries.length, 1, "Availability query must still execute");
  assert.equal(state.appointmentQueries.length, 1, "Booked appointments query must still execute");
});

test("getAvailableTimeSlots executes database doctor lookup when no pre-verified doctor is provided (external/client caller)", async () => {
  const { getAvailableTimeSlots, state } = await loadAppointmentsModule();

  // Call without pre-verified doctor
  const slots = await getAvailableTimeSlots("doctor-uuid-1", "2030-01-01");

  assert.ok(slots.days, "Slots days array must be returned");
  assert.equal(state.doctorFindUniqueQueries.length, 1, "Database doctor lookup must execute for un-memoized caller");
  assert.equal(state.doctorFindUniqueQueries[0].id, "doctor-uuid-1");
  assert.equal(state.doctorFindUniqueQueries[0].verificationStatus, "VERIFIED");
});

test("getAvailableTimeSlots rejects unverified doctor when lookup runs", async () => {
  const { getAvailableTimeSlots, state } = await loadAppointmentsModule({ doctorStatus: "PENDING" });

  await assert.rejects(
    getAvailableTimeSlots("doctor-uuid-1", "2030-01-01"),
    /Doctor not found or not verified/
  );
  assert.equal(state.doctorFindUniqueQueries.length, 1);
  assert.equal(state.availabilityQueries.length, 0, "Availability must not be queried for unverified doctor");
});

test("getAvailableTimeSlots rejects client-spoofed object lacking server symbol and falls back to database lookup", async () => {
  const { getAvailableTimeSlots, state } = await loadAppointmentsModule({ doctorStatus: "PENDING" });

  // A malicious client attempts to bypass verification by passing a plain object
  const spoofedClientObject = {
    id: "doctor-uuid-1",
    role: "DOCTOR",
    verificationStatus: "VERIFIED",
  };

  await assert.rejects(
    getAvailableTimeSlots("doctor-uuid-1", "2030-01-01", spoofedClientObject),
    /Doctor not found or not verified/
  );

  // Must have ignored the spoofed object and queried the database, finding PENDING status
  assert.equal(state.doctorFindUniqueQueries.length, 1);
});

test("getAvailableTimeSlots rejects when doctorId does not match preVerifiedDoctor.id", async () => {
  const { getDoctorById, getAvailableTimeSlots, state } = await loadAppointmentsModule();
  const { doctor } = await getDoctorById("doctor-uuid-1");

  // Attempt to use doctor-1's verification to query doctor-2's slots
  await assert.rejects(
    getAvailableTimeSlots("doctor-uuid-2", "2030-01-01", doctor),
    /Doctor not found or not verified/
  );

  assert.equal(state.doctorFindUniqueQueries.length, 1);
  assert.equal(state.doctorFindUniqueQueries[0].id, "doctor-uuid-2");
});
