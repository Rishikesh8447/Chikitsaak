"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

const activeConsultationStatuses = ["IN_PROGRESS", "COMPLETED"];

async function authenticatedUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!user) throw new Error("User not found");
  return user;
}

function requiredText(value, label, max = 2000) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${label} is invalid`);
  }
  return value.trim();
}

function parseMedicines(value) {
  let medicines;
  try { medicines = JSON.parse(value); } catch { throw new Error("Medicines are invalid"); }
  if (!Array.isArray(medicines) || medicines.length < 1 || medicines.length > 30) throw new Error("Add at least one medicine");
  return medicines.map((medicine) => ({
    name: requiredText(medicine.name, "Medicine name", 200),
    dosage: requiredText(medicine.dosage, "Dosage", 100),
    frequency: requiredText(medicine.frequency, "Frequency", 100),
    duration: requiredText(medicine.duration, "Duration", 100),
    instructions: typeof medicine.instructions === "string" ? medicine.instructions.trim().slice(0, 1000) || null : null,
  }));
}

export async function createPrescription(formData) {
  const doctor = await authenticatedUser();
  if (doctor.role !== "DOCTOR") throw new Error("Only doctors can create prescriptions");
  if (doctor.verificationStatus !== "VERIFIED") throw new Error("Doctor verification is required to create prescriptions");
  const appointmentId = formData.get("appointmentId");
  if (typeof appointmentId !== "string") throw new Error("Appointment is required");
  const diagnosis = requiredText(formData.get("diagnosis"), "Diagnosis", 3000);
  const generalInstructions = typeof formData.get("generalInstructions") === "string" ? formData.get("generalInstructions").trim().slice(0, 3000) || null : null;
  const medicines = parseMedicines(formData.get("medicines"));

  try {
    await db.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId }, include: { patient: true, doctor: true } });
      if (!appointment || appointment.doctorId !== doctor.id) throw new Error("Appointment not found or not authorized");
      if (!activeConsultationStatuses.includes(appointment.status)) throw new Error("A prescription requires an active or completed consultation");
      const existing = await tx.prescription.findUnique({ where: { appointmentId } });
      if (existing) throw new Error("A prescription already exists for this consultation");
      const created = await tx.prescription.create({
        data: { appointmentId, patientId: appointment.patientId, doctorId: doctor.id, diagnosis, generalInstructions, medicines: { create: medicines } },
        include: { medicines: true },
      });
      await createNotification(tx, {
        userId: appointment.patientId,
        appointmentId,
        type: "PRESCRIPTION_AVAILABLE",
        title: "New prescription available",
        message: `Dr. ${doctor.name || "your doctor"} added a prescription to your consultation.`,
        dedupeKey: `prescription:${created.id}:patient-notification`,
      });
    });
    revalidatePath("/medical-records");
    revalidatePath("/appointments");
    revalidatePath("/doctor");
    return { success: true };
  } catch (error) {
    throw new Error("Failed to create prescription. Please try again.");
  }
}

export async function getMyMedicalRecords() {
  const user = await authenticatedUser();
  if (user.role !== "PATIENT") throw new Error("Only patients can access medical records");
  const [profile, appointments, prescriptions] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { bloodGroup: true, allergies: true, existingConditions: true, currentMedications: true } }),
    db.appointment.findMany({
      where: { patientId: user.id },
      select: {
        id: true,
        startTime: true,
        status: true,
        notes: true,
        doctor: { select: { name: true, specialty: true } },
      },
      orderBy: { startTime: "desc" },
    }),
    db.prescription.findMany({ where: { patientId: user.id }, include: { doctor: { select: { name: true, specialty: true } }, appointment: { select: { startTime: true } }, medicines: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return { profile, appointments, prescriptions };
}

export async function updateMedicalProfile(formData) {
  const user = await authenticatedUser();
  if (user.role !== "PATIENT") throw new Error("Only patients can update medical profiles");
  const clean = (key, max = 3000) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim().slice(0, max) || null : null;
  };
  await db.user.update({ where: { id: user.id }, data: { bloodGroup: clean("bloodGroup", 20), allergies: clean("allergies"), existingConditions: clean("existingConditions"), currentMedications: clean("currentMedications") } });
  revalidatePath("/medical-records");
  return { success: true };
}

export async function getDoctorReviews(doctorId) {
  if (typeof doctorId !== "string") throw new Error("Doctor is required");
  const [reviews, aggregate] = await Promise.all([
    db.review.findMany({ where: { doctorId }, include: { patient: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.review.aggregate({ where: { doctorId }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  return { reviews, average: aggregate._avg.rating, total: aggregate._count._all };
}

export async function createReview(formData) {
  const patient = await authenticatedUser();
  if (patient.role !== "PATIENT") throw new Error("Only patients can leave reviews");
  const appointmentId = formData.get("appointmentId");
  const rating = Number(formData.get("rating"));
  const commentValue = formData.get("comment");
  const comment = typeof commentValue === "string" ? commentValue.trim().slice(0, 2000) || null : null;
  if (typeof appointmentId !== "string" || !Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Choose an integer rating from 1 to 5");
  try {
    await db.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appointment || appointment.patientId !== patient.id || appointment.status !== "COMPLETED") throw new Error("Only completed consultations can be reviewed");
      await tx.review.create({ data: { appointmentId, patientId: patient.id, doctorId: appointment.doctorId, rating, comment } });
    });
    revalidatePath("/appointments");
    revalidatePath("/doctors");
    return { success: true };
  } catch (error) {
    if (error?.code === "P2002") throw new Error("You have already reviewed this consultation");
    throw new Error("Failed to submit review. Please try again.");
  }
}

export async function getAppointmentPrescription(appointmentId) {
  const user = await authenticatedUser();
  if (typeof appointmentId !== "string") throw new Error("Appointment is required");
  let ownerFilter;
  if (user.role === "PATIENT") {
    ownerFilter = { patientId: user.id };
  } else if (user.role === "DOCTOR" && user.verificationStatus === "VERIFIED") {
    ownerFilter = { doctorId: user.id };
  } else {
    throw new Error("Unauthorized");
  }
  const prescription = await db.prescription.findFirst({ where: { appointmentId, ...ownerFilter }, include: { medicines: true, doctor: { select: { name: true } }, patient: { select: { name: true } }, appointment: { select: { startTime: true } } } });
  if (!prescription) throw new Error("Prescription not found");
  return { prescription };
}
