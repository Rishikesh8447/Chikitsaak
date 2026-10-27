const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadAppointmentsAction() {
  const source = await readFile(join(process.cwd(), "actions", "appointments.js"), "utf8");
  const state = {
    userId: null,
    users: {},
    appointments: {},
    sessionCreated: 0,
    diagnostics: [],
  };

  const db = {
    user: { findUnique: async ({ where }) => state.users[where.clerkUserId] || null },
    appointment: {
      findUnique: async ({ where }) => state.appointments[where.id] ? structuredClone(state.appointments[where.id]) : null,
      updateMany: async ({ where, data }) => {
        const appt = state.appointments[where.id];
        if (!appt) return { count: 0 };
        if (where.videoSessionId === null && appt.videoSessionId !== null) return { count: 0 };
        Object.assign(appt, data);
        return { count: 1 };
      },
    },
  };

  const dependencies = {
    db,
    auth: async () => ({ userId: state.userId }),
    revalidatePath: () => {},
    createAppointmentNotificationPair: async () => {},
    resolveDoctorPublicNames: async () => [],
    measureServerTiming: async (_label, cb) => cb(),
    ...(await import("../lib/appointment-time.mjs")),
    process: {
      env: {
        NEXT_PUBLIC_VONAGE_APPLICATION_ID: "  29af5786-9a9a-4488-badb-9ef72dbc1f37  ",
        VONAGE_PRIVATE_KEY: "synthetic-key",
      },
    },
    console: { error: (...args) => state.diagnostics.push(args) },
    Auth: class {
      constructor({ applicationId, privateKey }) {
        this.applicationId = applicationId;
        this.privateKey = privateKey;
      }
    },
    Vonage: class {
      constructor(auth) {
        state.lastAuth = auth;
        this.video = {
          createSession: async () => {
            state.sessionCreated += 1;
            return { sessionId: "valid-session-123" };
          },
          generateClientToken: (sessionId) => `token-for-${sessionId}`,
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
  return { ...factory(dependencies), state, dependencies };
}

test("Vonage application ID whitespace is sanitized during initialization", async () => {
  const { authorizeVideoCall, state } = await loadAppointmentsAction();
  state.userId = "clerk-doc";
  state.users["clerk-doc"] = { id: "doc-1", role: "DOCTOR", verificationStatus: "VERIFIED" };
  state.appointments["appt-1"] = {
    id: "appt-1",
    doctorId: "doc-1",
    patientId: "pat-1",
    status: "CONFIRMED",
    consultationMode: "ONLINE",
    startTime: new Date(Date.now() + 5 * 60 * 1000),
    endTime: new Date(Date.now() + 25 * 60 * 1000),
    videoSessionId: null,
  };

  const result = await authorizeVideoCall(new Map([["appointmentId", "appt-1"]]));
  assert.deepEqual(result, { success: true });
  assert.equal(state.lastAuth.applicationId, "29af5786-9a9a-4488-badb-9ef72dbc1f37");
  assert.equal(state.appointments["appt-1"].videoSessionId, "valid-session-123");
});

test("authorizeVideoCall rejects unauthorized user with safe error message", async () => {
  const { authorizeVideoCall, state } = await loadAppointmentsAction();
  state.userId = "clerk-intruder";
  state.users["clerk-intruder"] = { id: "intruder-1", role: "PATIENT" };
  state.appointments["appt-1"] = {
    id: "appt-1",
    doctorId: "doc-1",
    patientId: "pat-1",
    status: "CONFIRMED",
    consultationMode: "ONLINE",
    startTime: new Date(Date.now() + 5 * 60 * 1000),
    endTime: new Date(Date.now() + 25 * 60 * 1000),
    videoSessionId: null,
  };

  await assert.rejects(
    authorizeVideoCall(new Map([["appointmentId", "appt-1"]])),
    /You are not authorized to join this call/
  );
});

test("getVideoCallCredentials enforces join window and returns sanitized appId", async () => {
  const { getVideoCallCredentials, state } = await loadAppointmentsAction();
  state.userId = "clerk-doc";
  state.users["clerk-doc"] = { id: "doc-1", role: "DOCTOR", verificationStatus: "VERIFIED" };
  state.appointments["appt-active"] = {
    id: "appt-active",
    doctorId: "doc-1",
    patientId: "pat-1",
    status: "CONFIRMED",
    consultationMode: "ONLINE",
    startTime: new Date(Date.now() + 5 * 60 * 1000),
    endTime: new Date(Date.now() + 25 * 60 * 1000),
    videoSessionId: "session-abc",
  };

  const creds = await getVideoCallCredentials("appt-active");
  assert.equal(creds.success, true);
  assert.equal(creds.videoSessionId, "session-abc");
  assert.equal(creds.appId, "29af5786-9a9a-4488-badb-9ef72dbc1f37");
  assert.equal(creds.token, "token-for-session-abc");

  // Ended appointment rejected safely
  state.appointments["appt-ended"] = {
    id: "appt-ended",
    doctorId: "doc-1",
    patientId: "pat-1",
    status: "CONFIRMED",
    consultationMode: "ONLINE",
    startTime: new Date(Date.now() - 60 * 60 * 1000),
    endTime: new Date(Date.now() - 30 * 60 * 1000),
    videoSessionId: "session-abc",
  };

  await assert.rejects(
    getVideoCallCredentials("appt-ended"),
    /This appointment has ended/
  );
});

test("AppointmentCard source code handles tokenError and clears action on failure", async () => {
  const source = await readFile(join(process.cwd(), "components", "ui", "appointment-card.jsx"), "utf8");
  assert.match(source, /error:\s*tokenError/);
  assert.match(source, /tokenData\?\.error\s*\|\|\s*tokenError/);
  assert.match(source, /catch\s*\{\s*setAction\(null\);\s*\}/);
});
