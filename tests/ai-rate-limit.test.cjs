const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const { pathToFileURL } = require("node:url");

const limiterModulePromise = import(pathToFileURL(join(cwd(), "lib", "ai-rate-limit.mjs")).href);
const aiActionsSourcePromise = readFile(join(cwd(), "actions", "ai.js"), "utf8");

async function loadAiActions({ user, appointment, checkAiRateLimit, RATE_LIMIT_MESSAGE }) {
  const source = await aiActionsSourcePromise;
  const state = { aiCalls: [] };
  const dependencies = {
    auth: async () => ({ userId: user?.clerkUserId || "clerk-default" }),
    db: {
      user: { findUnique: async () => user || null },
      appointment: { findUnique: async () => appointment || null },
    },
    z: {
      array: () => chain(),
      string: () => chain(),
      object: (val) => ({ parse: (data) => data, shape: val }),
    },
    requestStructuredAi: async (params) => {
      state.aiCalls.push(params);
      return { summary: "Generated Summary", consultationSummary: "Generated Draft" };
    },
    checkAiRateLimit,
    RATE_LIMIT_MESSAGE: RATE_LIMIT_MESSAGE || "Too many AI requests. Please wait a minute before trying again.",
  };

  function chain() {
    const result = {
      trim: () => result, min: () => result, max: () => result, nullable: () => result,
      default: () => result,
    };
    return result;
  }

  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { z } from "zod";', "const { z } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { requestStructuredAi } from "@/lib/ai";', "const { requestStructuredAi } = dependencies;")
    .replace('import { checkAiRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/ai-rate-limit.mjs";', "const { checkAiRateLimit, RATE_LIMIT_MESSAGE } = dependencies;")
    .replace("export async function generatePatientAiSummary", "async function generatePatientAiSummary")
    .replace("export async function generateDoctorNoteDraft", "async function generateDoctorNoteDraft")
    .concat("\nreturn { generatePatientAiSummary, generateDoctorNoteDraft };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

test("checkAiRateLimit: Patient summary allows up to 5 requests per minute, 6th is rejected", async () => {
  const { checkAiRateLimit, resetAiRateLimits } = await limiterModulePromise;
  resetAiRateLimits();

  const baseTime = 1_000_000;
  const userId = "patient-alpha";

  for (let i = 1; i <= 5; i++) {
    const allowed = checkAiRateLimit("PATIENT_SUMMARY", userId, baseTime + i * 1000);
    assert.equal(allowed, true, `Request ${i} should be allowed`);
  }

  // 6th request within the same 60-second window is blocked
  const blocked = checkAiRateLimit("PATIENT_SUMMARY", userId, baseTime + 6000);
  assert.equal(blocked, false, "6th request within 1 minute must be blocked");
});

test("checkAiRateLimit: Doctor note draft allows up to 10 requests per minute, 11th is rejected", async () => {
  const { checkAiRateLimit, resetAiRateLimits } = await limiterModulePromise;
  resetAiRateLimits();

  const baseTime = 2_000_000;
  const doctorId = "doctor-beta";

  for (let i = 1; i <= 10; i++) {
    const allowed = checkAiRateLimit("DOCTOR_DRAFT", doctorId, baseTime + i * 1000);
    assert.equal(allowed, true, `Request ${i} should be allowed`);
  }

  // 11th request within the same 60-second window is blocked
  const blocked = checkAiRateLimit("DOCTOR_DRAFT", doctorId, baseTime + 11_000);
  assert.equal(blocked, false, "11th request within 1 minute must be blocked");
});

test("checkAiRateLimit: Window expiry resets counter after 60 seconds", async () => {
  const { checkAiRateLimit, resetAiRateLimits } = await limiterModulePromise;
  resetAiRateLimits();

  const baseTime = 3_000_000;
  const userId = "patient-gamma";

  // Consume all 5 slots
  for (let i = 1; i <= 5; i++) {
    checkAiRateLimit("PATIENT_SUMMARY", userId, baseTime + i * 1000);
  }
  assert.equal(checkAiRateLimit("PATIENT_SUMMARY", userId, baseTime + 6000), false);

  // After 60 seconds from initial requests (e.g. +62s), expired timestamps fall out of window
  const allowedAfterExpiry = checkAiRateLimit("PATIENT_SUMMARY", userId, baseTime + 62_000);
  assert.equal(allowedAfterExpiry, true, "Request after 60-second window must be permitted");
});

test("checkAiRateLimit: Isolates limits per user ID", async () => {
  const { checkAiRateLimit, resetAiRateLimits } = await limiterModulePromise;
  resetAiRateLimits();

  const baseTime = 4_000_000;
  const user1 = "patient-1";
  const user2 = "patient-2";

  // User 1 exhausts all 5 requests
  for (let i = 1; i <= 5; i++) {
    checkAiRateLimit("PATIENT_SUMMARY", user1, baseTime + i * 100);
  }
  assert.equal(checkAiRateLimit("PATIENT_SUMMARY", user1, baseTime + 1000), false);

  // User 2 has their own separate limit and is not affected
  assert.equal(checkAiRateLimit("PATIENT_SUMMARY", user2, baseTime + 1000), true);
});

test("generatePatientAiSummary: Rejection blocks OpenAI call and returns consistent error", async () => {
  const { checkAiRateLimit, resetAiRateLimits, RATE_LIMIT_MESSAGE } = await limiterModulePromise;
  resetAiRateLimits();

  const user = { id: "patient-tested", clerkUserId: "clerk-p1", role: "PATIENT", verificationStatus: null };
  const { generatePatientAiSummary, state } = await loadAiActions({
    user,
    checkAiRateLimit,
    RATE_LIMIT_MESSAGE,
  });

  const form = new Map([["description", "I have had a mild cough for three days"]]);

  // First 5 requests pass and call OpenAI
  for (let i = 1; i <= 5; i++) {
    const res = await generatePatientAiSummary(form);
    assert.equal(res.success, true);
    assert.equal(state.aiCalls.length, i);
  }

  // 6th request fails with rate limit error and DOES NOT call OpenAI
  const blockedRes = await generatePatientAiSummary(form);
  assert.deepEqual(blockedRes, { error: RATE_LIMIT_MESSAGE });
  assert.equal(state.aiCalls.length, 5, "OpenAI must not be called when rate limited");
});

test("generateDoctorNoteDraft: Rejection blocks OpenAI call and returns consistent error", async () => {
  const { checkAiRateLimit, resetAiRateLimits, RATE_LIMIT_MESSAGE } = await limiterModulePromise;
  resetAiRateLimits();

  const doctor = { id: "doctor-tested", clerkUserId: "clerk-d1", role: "DOCTOR", verificationStatus: "VERIFIED" };
  const appointment = { patientDescription: "Cough", aiSummary: null, notes: null };
  const { generateDoctorNoteDraft, state } = await loadAiActions({
    user: doctor,
    appointment,
    checkAiRateLimit,
    RATE_LIMIT_MESSAGE,
  });

  const form = new Map([
    ["appointmentId", "appt-100"],
    ["consultationInformation", "Lungs clear, viral etiology likely."],
  ]);

  // First 10 requests pass and call OpenAI
  for (let i = 1; i <= 10; i++) {
    const res = await generateDoctorNoteDraft(form);
    assert.equal(res.success, true);
    assert.equal(state.aiCalls.length, i);
  }

  // 11th request fails with rate limit error and DOES NOT call OpenAI
  const blockedRes = await generateDoctorNoteDraft(form);
  assert.deepEqual(blockedRes, { error: RATE_LIMIT_MESSAGE });
  assert.equal(state.aiCalls.length, 10, "OpenAI must not be called when rate limited");
});

