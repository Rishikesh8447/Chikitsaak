const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadVideoActions({ configured = true, providerFailure = false } = {}) {
  const source = await readFile(join(process.cwd(), "actions", "appointments.js"), "utf8");
  const state = {
    currentUserId: null,
    sessionCreateCount: 0,
    persistenceFailures: 0,
    appointment: {
      id: "appointment-1",
      patientId: "patient-1",
      doctorId: "doctor-1",
      status: "CONFIRMED",
      startTime: new Date(Date.now() + 10 * 60 * 1000),
      endTime: new Date(Date.now() + 30 * 60 * 1000),
      consultationMode: "ONLINE",
      videoSessionId: null,
    },
    diagnostics: [],
  };
  const users = {
    "clerk-patient": { id: "patient-1", role: "PATIENT", name: "Synthetic Patient" },
    "clerk-doctor": { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED", name: "Synthetic Doctor" },
  };
  const db = {
    user: { findUnique: async ({ where }) => users[where.clerkUserId] || null },
    appointment: {
      findUnique: async ({ where }) => where.id === state.appointment.id ? structuredClone(state.appointment) : null,
      updateMany: async ({ where, data }) => {
        if (where.id !== state.appointment.id) return { count: 0 };
        if (Object.hasOwn(where, "videoSessionId") && where.videoSessionId !== state.appointment.videoSessionId) return { count: 0 };
        if (where.status && where.status !== state.appointment.status) return { count: 0 };
        if (Object.hasOwn(data, "videoSessionId") && state.persistenceFailures > 0) {
          state.persistenceFailures -= 1;
          throw new Error("synthetic persistence error");
        }
        Object.assign(state.appointment, data);
        return { count: 1 };
      },
    },
  };
  const dependencies = {
    db,
    auth: async () => ({ userId: state.currentUserId }),
    revalidatePath: () => {},
    createAppointmentNotificationPair: async () => {},
    resolveDoctorPublicNames: async () => [],
    measureServerTiming: async (_label, callback) => callback(),
    ...(await import("../lib/appointment-time.mjs")),
    process: {
      env: configured ? {
        NEXT_PUBLIC_VONAGE_APPLICATION_ID: "synthetic-vonage-app-id",
        VONAGE_PRIVATE_KEY: "synthetic-private-key",
      } : {},
    },
    console: { error: (...args) => state.diagnostics.push(args) },
    Auth: class {},
    Vonage: class {
      constructor() {
        this.video = {
          createSession: async () => {
            state.sessionCreateCount += 1;
            if (providerFailure) {
              throw Object.assign(new Error("synthetic private key and patient detail must not be logged"), {
                code: "ERR_BAD_REQUEST",
                response: { status: 401 },
              });
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
            return { sessionId: `synthetic-session-${state.sessionCreateCount}` };
          },
          generateClientToken: (sessionId) => `synthetic-token-for-${sessionId}`,
        };
      }
    },
  };

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { Vonage } from "@vonage/server-sdk";', "const { Vonage } = dependencies;")
    .replace('import { Auth } from "@vonage/auth";', "const { Auth } = dependencies;")
    .replace('import { addDays, addMinutes, format, endOfDay } from "date-fns";', "const addDays=()=>{}; const addMinutes=()=>{}; const format=()=>{}; const endOfDay=()=>{};")
    .replace('import { createAppointmentNotificationPair } from "@/lib/notifications";', "const { createAppointmentNotificationPair } = dependencies;")
    .replace('import { resolveDoctorPublicNames } from "@/lib/doctor-name";', "const { resolveDoctorPublicNames } = dependencies;")
    .replace('import { getVideoJoinWindowError } from "@/lib/appointment-time.mjs";', "const { getVideoJoinWindowError } = dependencies;")
    .replace('import { measureServerTiming } from "@/lib/server-timing.mjs";', "const { measureServerTiming } = dependencies;")
    .replace('import { withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";', "const withSerializableRetries = (fn) => fn();")
    .replace('import { isOriginalAppointmentPaymentVerified } from "@/lib/follow-up-appointment.mjs";', "const isOriginalAppointmentPaymentVerified = () => true;")
    .replace('import { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } from "@/lib/email";', "const sendAppointmentBookedEmail = dependencies.sendAppointmentBookedEmail || (async () => {}); const sendAppointmentRescheduledEmail = dependencies.sendAppointmentRescheduledEmail || (async () => {});")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { authorizeVideoCall, getVideoCallCredentials };");
  const factory = new Function("dependencies", `const process = dependencies.process; const console = dependencies.console; ${transformed}`);
  return { ...factory(dependencies), state };
}

test("patient and verified doctor join the same session without duplicate concurrent provisioning", async () => {
  const { authorizeVideoCall, getVideoCallCredentials, state } = await loadVideoActions();
  const formData = new Map([["appointmentId", "appointment-1"]]);
  state.currentUserId = "clerk-patient";
  const patientAuthorization = authorizeVideoCall(formData);
  state.currentUserId = "clerk-doctor";
  const doctorAuthorization = authorizeVideoCall(formData);

  assert.deepEqual(await Promise.all([patientAuthorization, doctorAuthorization]), [{ success: true }, { success: true }]);
  assert.equal(state.sessionCreateCount, 1);

  state.currentUserId = "clerk-patient";
  const patientCredentials = await getVideoCallCredentials("appointment-1");
  state.currentUserId = "clerk-doctor";
  const doctorCredentials = await getVideoCallCredentials("appointment-1");
  assert.equal(patientCredentials.videoSessionId, doctorCredentials.videoSessionId);
  assert.equal(patientCredentials.videoSessionId, state.appointment.videoSessionId);
  assert.equal(state.sessionCreateCount, 1);
});

test("missing development Vonage configuration is identified without exposing credentials", async () => {
  const { authorizeVideoCall, state } = await loadVideoActions({ configured: false });
  state.currentUserId = "clerk-patient";

  await assert.rejects(authorizeVideoCall(new Map([["appointmentId", "appointment-1"]])), /Video session provisioning failed/);
  assert.deepEqual(state.diagnostics[0][1], {
    operation: "createSession",
    errorCode: "VIDEO_CONFIGURATION_MISSING",
    providerCode: null,
    httpStatus: null,
    missingVariables: ["NEXT_PUBLIC_VONAGE_APPLICATION_ID", "VONAGE_PRIVATE_KEY"],
    description: "Video session creation requires the configured Vonage application ID and private key.",
  });
  assert.equal(state.appointment.status, "CONFIRMED");
  assert.equal(state.appointment.videoSessionId, null);
  assert.doesNotMatch(JSON.stringify(state.diagnostics), /synthetic-private-key|synthetic-vonage-app-id|Synthetic Patient/);
});

test("Vonage authentication errors log only sanitized provider metadata", async () => {
  const { authorizeVideoCall, state } = await loadVideoActions({ providerFailure: true });
  state.currentUserId = "clerk-patient";

  await assert.rejects(authorizeVideoCall(new Map([["appointmentId", "appointment-1"]])), /Video session provisioning failed/);
  assert.deepEqual(state.diagnostics[0][1], {
    operation: "createSession",
    errorCode: "VONAGE_AUTHENTICATION_REJECTED",
    providerCode: "ERR_BAD_REQUEST",
    httpStatus: 401,
    missingVariables: [],
    description: "Vonage rejected the configured application credentials.",
  });
  assert.doesNotMatch(JSON.stringify(state.diagnostics), /synthetic private key|patient detail|synthetic-private-key|Synthetic Patient/);
});

test("session persistence retry reuses the already created provider session", async () => {
  const { authorizeVideoCall, state } = await loadVideoActions();
  state.currentUserId = "clerk-patient";
  state.persistenceFailures = 1;
  const formData = new Map([["appointmentId", "appointment-1"]]);

  await assert.rejects(authorizeVideoCall(formData), /Unable to authorize video call/);
  assert.equal(state.sessionCreateCount, 1);
  assert.deepEqual(state.diagnostics[0][1], {
    operation: "persistSession",
    errorCode: "VIDEO_SESSION_PERSIST_FAILED",
    providerCode: null,
    httpStatus: null,
    missingVariables: [],
    description: "The generated video session could not be saved for the appointment.",
  });

  assert.deepEqual(await authorizeVideoCall(formData), { success: true });
  assert.equal(state.sessionCreateCount, 1);
  assert.equal(state.appointment.videoSessionId, "synthetic-session-1");
});
