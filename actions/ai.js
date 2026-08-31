"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/lib/prisma";
import { requestStructuredAi } from "@/lib/ai";

const textArray = z.array(z.string().trim().min(1).max(500)).max(10).default([]);
const patientSummarySchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  symptoms: textArray,
  duration: z.string().trim().max(300).nullable().default(null),
  relevantInformation: textArray,
  questions: textArray,
  specialtySuggestion: z.string().trim().max(120).nullable().default(null),
});
const doctorDraftSchema = z.object({
  consultationSummary: z.string().trim().min(1).max(3000),
  keyObservations: textArray,
  patientExplanation: z.string().trim().max(3000).default(""),
  followUpInstructions: z.string().trim().max(3000).default(""),
});

async function currentUser(role) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await db.user.findUnique({ where: { clerkUserId: userId }, select: { id: true, role: true } });
  if (!user || (role && user.role !== role)) throw new Error("Unauthorized");
  return user;
}

function inputText(value, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 5000) throw new Error(`${label} is invalid`);
  return value.trim();
}

const patientSystem = `You assist with pre-consultation preparation. Return JSON only with keys summary, symptoms, duration, relevantInformation, questions, specialtySuggestion. Use only the patient's words. Do not diagnose, prescribe, claim certainty, invent symptoms, or tell the patient to replace a clinician. A specialtySuggestion may only be a cautious possible specialty, or null. Keep language clear and say the concern should be reviewed with a doctor.`;
const doctorSystem = `You assist a licensed doctor by drafting consultation documentation. Return JSON only with keys consultationSummary, keyObservations, patientExplanation, followUpInstructions. Use only the supplied consultation information. Do not diagnose beyond what the doctor explicitly supplied, do not prescribe, and do not invent findings. This is a draft for doctor review, not an official medical record.`;

export async function generatePatientAiSummary(formData) {
  await currentUser("PATIENT");
  const description = inputText(formData.get("description"), "Description");
  try {
    return { success: true, summary: await requestStructuredAi({ system: patientSystem, user: description, schema: patientSummarySchema }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "AI assistance is temporarily unavailable" };
  }
}

export async function generateDoctorNoteDraft(formData) {
  const doctor = await currentUser("DOCTOR");
  const appointmentId = formData.get("appointmentId");
  if (typeof appointmentId !== "string") return { error: "Appointment is required" };
  const appointment = await db.appointment.findUnique({ where: { id: appointmentId, doctorId: doctor.id }, select: { patientDescription: true, aiSummary: true, notes: true } });
  if (!appointment) return { error: "Appointment not found or not authorized" };
  const consultationInformation = inputText(formData.get("consultationInformation"), "Consultation information");
  try {
    return { success: true, draft: await requestStructuredAi({ system: doctorSystem, user: JSON.stringify({ consultationInformation, patientDescription: appointment.patientDescription, aiSummary: appointment.aiSummary }), schema: doctorDraftSchema }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "AI assistance is temporarily unavailable" };
  }
}
