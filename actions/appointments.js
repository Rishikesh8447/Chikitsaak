"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { Vonage } from "@vonage/server-sdk";
import { addDays, addMinutes, format, isBefore, endOfDay } from "date-fns";
import { Auth } from "@vonage/auth";
import { createAppointmentNotificationPair } from "@/lib/notifications";
import { resolveDoctorPublicNames } from "@/lib/doctor-name";

const BOOKING_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];

// Initialize Vonage Video API client
let vonage;
function getVonage() {
  if (vonage) return vonage;
  if (!process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID || !process.env.VONAGE_PRIVATE_KEY) throw new Error("Video service is not configured");
  vonage = new Vonage(new Auth({ applicationId: process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID, privateKey: process.env.VONAGE_PRIVATE_KEY }), {});
  return vonage;
}

/**
 * Book a new appointment with a doctor
 */
export async function bookAppointment(formData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const doctorId = formData.get("doctorId");
    const startValue = formData.get("startTime");
    const endValue = formData.get("endTime");
    const startTime = new Date(startValue);
    const endTime = new Date(endValue);
    const patientDescription = formData.get("description") || null;
    const aiSummary = formData.get("aiSummary");
    const aiSpecialtySuggestion = formData.get("aiSpecialtySuggestion");
    if (typeof doctorId !== "string" || !startValue || !endValue || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new Error("Invalid appointment details");
    }
    if (aiSummary !== null && (typeof aiSummary !== "string" || aiSummary.length > 5000)) throw new Error("AI summary is invalid");
    if (aiSpecialtySuggestion !== null && (typeof aiSpecialtySuggestion !== "string" || aiSpecialtySuggestion.length > 120)) throw new Error("AI specialty suggestion is invalid");
    if (endTime <= startTime || startTime <= new Date()) {
      throw new Error("Appointment time must be valid and in the future");
    }
    const durationMinutes = (endTime - startTime) / 60000;
    if (durationMinutes !== 30) throw new Error("Appointments must be 30 minutes");
    const sessionId = await createVideoSession();
    const appointment = await db.$transaction(async (tx) => {
      const patient = await tx.user.findUnique({ where: { clerkUserId: userId, role: "PATIENT" } });
      const doctor = await tx.user.findUnique({ where: { id: doctorId, role: "DOCTOR", verificationStatus: "VERIFIED" } });
      if (!patient) throw new Error("Patient not found");
      if (!doctor) throw new Error("Doctor not found or not verified");
      const availability = await tx.availability.findMany({ where: { doctorId, status: "AVAILABLE" } });
      const minutes = (value) => value.getHours() * 60 + value.getMinutes();
      if (!availability.some((window) => (window.dayOfWeek === null || window.dayOfWeek === startTime.getDay()) && (!window.blockedDate || new Date(window.blockedDate).toDateString() !== startTime.toDateString()) && minutes(window.startTime) <= minutes(startTime) && minutes(window.endTime) >= minutes(endTime))) {
        throw new Error("The selected time is outside the doctor's availability");
      }
      const conflict = { startTime: { lt: endTime }, endTime: { gt: startTime } };
      const [doctorConflict, patientConflict] = await Promise.all([
        tx.appointment.findFirst({ where: { doctorId, status: { in: BOOKING_STATUSES }, ...conflict } }),
        tx.appointment.findFirst({ where: { patientId: patient.id, status: { in: BOOKING_STATUSES }, ...conflict } }),
      ]);
      if (doctorConflict) throw new Error("This time slot is already booked");
      if (patientConflict) throw new Error("You already have an appointment at this time");
      const debit = await tx.user.updateMany({ where: { id: patient.id, credits: { gte: 2 } }, data: { credits: { decrement: 2 } } });
      if (debit.count !== 1) throw new Error("Insufficient credits to book an appointment");
      await tx.user.update({ where: { id: doctor.id }, data: { credits: { increment: 2 } } });
      const newAppointment = await tx.appointment.create({ data: { patientId: patient.id, doctorId, startTime, endTime, patientDescription, aiSummary: typeof aiSummary === "string" && aiSummary.trim() ? aiSummary.trim() : null, aiSpecialtySuggestion: typeof aiSpecialtySuggestion === "string" && aiSpecialtySuggestion.trim() ? aiSpecialtySuggestion.trim() : null, status: "SCHEDULED", videoSessionId: sessionId } });
      await tx.creditTransaction.createMany({ data: [
        { userId: patient.id, amount: -2, type: "APPOINTMENT_DEDUCTION", allocationKey: `appointment:${newAppointment.id}:patient-debit` },
        { userId: doctor.id, amount: 2, type: "APPOINTMENT_DEDUCTION", allocationKey: `appointment:${newAppointment.id}:doctor-credit` },
      ] });
      await createAppointmentNotificationPair(tx, newAppointment, { type: "APPOINTMENT_BOOKED", title: "Appointment booked", patientMessage: "Your appointment request was booked.", doctorMessage: "You have a new appointment request.", key: `appointment:${newAppointment.id}:booked` });
      return newAppointment;
    }, { isolationLevel: "Serializable" });

    revalidatePath("/appointments");
    return { success: true, appointment: appointment };
  } catch (error) {
    console.error("Failed to book appointment:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to book appointment");
  }
}

/**
 * Generate a Vonage Video API session
 */
async function createVideoSession() {
  try {
    const session = await getVonage().video.createSession({ mediaMode: "routed" });
    return session.sessionId;
  } catch (error) {
    throw new Error("Failed to create video session: " + error.message);
  }
}

/**
 * Generate a token for a video session
 * This will be called when either doctor or patient is about to join the call
 */
export async function authorizeVideoCall(formData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const user = await db.user.findUnique({
      where: {
        clerkUserId: userId,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const appointmentId = formData.get("appointmentId");

    if (!appointmentId) {
      throw new Error("Appointment ID is required");
    }

    // Find the appointment and verify the user is part of it
    const appointment = await db.appointment.findUnique({
      where: {
        id: appointmentId,
      },
    });

    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Verify the user is either the doctor or the patient for this appointment
    if (appointment.doctorId !== user.id && appointment.patientId !== user.id) {
      throw new Error("You are not authorized to join this call");
    }

    // Verify the appointment is scheduled
    if (!BOOKING_STATUSES.includes(appointment.status)) {
      throw new Error("This appointment is not currently scheduled");
    }

    // Verify the appointment is within a valid time range (e.g., starting 5 minutes before scheduled time)
    const now = new Date();
    const appointmentTime = new Date(appointment.startTime);
    const timeDifference = (appointmentTime - now) / (1000 * 60); // difference in minutes

    if (timeDifference > 30) {
      throw new Error(
        "The call will be available 30 minutes before the scheduled time"
      );
    }

    if (!appointment.videoSessionId) throw new Error("Video session is unavailable");
    return { success: true };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to authorize video call");
  }
}

export async function getVideoCallCredentials(appointmentId) {
  const { userId } = await auth();
  if (!userId || typeof appointmentId !== "string") throw new Error("Unauthorized");
  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  const appointment = await db.appointment.findUnique({ where: { id: appointmentId } });
  if (!user || !appointment || (appointment.doctorId !== user.id && appointment.patientId !== user.id)) throw new Error("You are not authorized to join this call");
  if (!BOOKING_STATUSES.includes(appointment.status) || !appointment.videoSessionId) throw new Error("This appointment is not available for video consultation");
  const now = new Date();
  if ((new Date(appointment.startTime) - now) / 60000 > 30 || now > new Date(appointment.endTime)) throw new Error("The video call is not currently available");
  const token = getVonage().video.generateClientToken(appointment.videoSessionId, { role: "publisher", expireTime: Math.floor(new Date(appointment.endTime).getTime() / 1000) + 60 * 60, data: JSON.stringify({ name: user.name || "Participant", role: user.role, userId: user.id }) });
  return { success: true, videoSessionId: appointment.videoSessionId, token };
}

/**
 * Get doctor by ID
 */
export async function getDoctorById(doctorId) {
  try {
    const doctor = await db.user.findUnique({
      where: {
        id: doctorId,
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
      select: {
        id: true,
        clerkUserId: true,
        name: true,
        imageUrl: true,
        specialty: true,
        experience: true,
        description: true,
        city: true,
        state: true,
        country: true,
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const [resolvedDoctor] = await resolveDoctorPublicNames([doctor]);
    return { doctor: resolvedDoctor };
  } catch (error) {
    console.error("Failed to fetch doctor:", error);
    throw new Error("Failed to fetch doctor details");
  }
}

/**
 * Get available time slots for booking for the next 4 days
 */
export async function legacyGetAvailableTimeSlots(doctorId) {
  try {
    // Validate doctor existence and verification
    const doctor = await db.user.findUnique({
      where: {
        id: doctorId,
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found or not verified");
    }

    // Fetch a single availability record
    const availability = await db.availability.findFirst({
      where: {
        doctorId: doctor.id,
        status: "AVAILABLE",
      },
    });

    if (!availability) {
      throw new Error("No availability set by doctor");
    }

    // Get the next 4 days
    const now = new Date();
    const days = [now, addDays(now, 1), addDays(now, 2), addDays(now, 3)];

    // Fetch existing appointments for the doctor over the next 4 days
    const lastDay = endOfDay(days[3]);
    const existingAppointments = await db.appointment.findMany({
      where: {
        doctorId: doctor.id,
        status: "SCHEDULED",
        startTime: {
          lte: lastDay,
        },
      },
    });

    const availableSlotsByDay = {};

    // For each of the next 4 days, generate available slots
    for (const day of days) {
      const dayString = format(day, "yyyy-MM-dd");
      availableSlotsByDay[dayString] = [];

      // Create a copy of the availability start/end times for this day
      const availabilityStart = new Date(availability.startTime);
      const availabilityEnd = new Date(availability.endTime);

      // Set the day to the current day we're processing
      availabilityStart.setFullYear(
        day.getFullYear(),
        day.getMonth(),
        day.getDate()
      );
      availabilityEnd.setFullYear(
        day.getFullYear(),
        day.getMonth(),
        day.getDate()
      );

      let current = new Date(availabilityStart);
      const end = new Date(availabilityEnd);

      while (
        isBefore(addMinutes(current, 30), end) ||
        +addMinutes(current, 30) === +end
      ) {
        const next = addMinutes(current, 30);

        // Skip past slots
        if (isBefore(current, now)) {
          current = next;
          continue;
        }

        const overlaps = existingAppointments.some((appointment) => {
          const aStart = new Date(appointment.startTime);
          const aEnd = new Date(appointment.endTime);

          return (
            (current >= aStart && current < aEnd) ||
            (next > aStart && next <= aEnd) ||
            (current <= aStart && next >= aEnd)
          );
        });

        if (!overlaps) {
          availableSlotsByDay[dayString].push({
            startTime: current.toISOString(),
            endTime: next.toISOString(),
            formatted: `${format(current, "h:mm a")} - ${format(
              next,
              "h:mm a"
            )}`,
            day: format(current, "EEEE, MMMM d"),
          });
        }

        current = next;
      }
    }

    // Convert to array of slots grouped by day for easier consumption by the UI
    const result = Object.entries(availableSlotsByDay).map(([date, slots]) => ({
      date,
      displayDate:
        slots.length > 0
          ? slots[0].day
          : format(new Date(date), "EEEE, MMMM d"),
      slots,
    }));

    return { days: result };
  } catch (error) {
    console.error("Failed to fetch available slots:", error);
    throw new Error("Failed to fetch available time slots: " + error.message);
  }
}

export async function getAvailableTimeSlots(doctorId, startDate) {
  const doctor = await db.user.findUnique({ where: { id: doctorId, role: "DOCTOR", verificationStatus: "VERIFIED" } });
  if (!doctor) throw new Error("Doctor not found or not verified");
  const now = new Date();
  const firstDay = startDate ? new Date(startDate) : now;
  if (Number.isNaN(firstDay.getTime())) throw new Error("Invalid date");
  firstDay.setHours(0, 0, 0, 0);
  const days = [0, 1, 2, 3].map((offset) => addDays(firstDay, offset));
  const lastDay = endOfDay(days[days.length - 1]);
  const [availability, appointments] = await Promise.all([
    db.availability.findMany({ where: { doctorId, status: "AVAILABLE" } }),
    db.appointment.findMany({ where: { doctorId, status: { in: BOOKING_STATUSES }, startTime: { lt: lastDay }, endTime: { gt: firstDay } } }),
  ]);
  const timeInMinutes = (value) => value.getHours() * 60 + value.getMinutes();
  const sameDate = (a, b) => a.toDateString() === b.toDateString();
  return { days: days.map((day) => {
    const date = format(day, "yyyy-MM-dd");
    const windows = availability.filter((window) => {
      if (window.dayOfWeek !== null && window.dayOfWeek !== day.getDay()) return false;
      return !window.blockedDate || !sameDate(new Date(window.blockedDate), day);
    });
    const slots = [];
    for (const window of windows) {
      const start = new Date(day);
      start.setHours(new Date(window.startTime).getHours(), new Date(window.startTime).getMinutes(), 0, 0);
      const end = new Date(day);
      end.setHours(new Date(window.endTime).getHours(), new Date(window.endTime).getMinutes(), 0, 0);
      for (let current = start; current < end; current = addMinutes(current, 30)) {
        const next = addMinutes(current, 30);
        if (next > end || current <= now) continue;
        const occupied = appointments.some((appointment) => new Date(appointment.startTime) < next && new Date(appointment.endTime) > current);
        if (!occupied) slots.push({ startTime: current.toISOString(), endTime: next.toISOString(), formatted: `${format(current, "h:mm a")} - ${format(next, "h:mm a")}`, day: format(day, "EEEE, MMMM d") });
      }
    }
    const uniqueSlots = [...new Map(slots.map((slot) => [slot.startTime, slot])).values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { date, displayDate: format(day, "EEEE, MMMM d"), slots: uniqueSlots };
  }) };
}

export async function rescheduleAppointment(formData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const appointmentId = formData.get("appointmentId");
  const startValue = formData.get("startTime");
  const endValue = formData.get("endTime");
  const startTime = new Date(startValue);
  const endTime = new Date(endValue);
  if (typeof appointmentId !== "string" || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime || (endTime - startTime) !== 30 * 60 * 1000 || startTime <= new Date()) throw new Error("Invalid rescheduling details");
  const result = await db.$transaction(async (tx) => {
    const patient = await tx.user.findUnique({ where: { clerkUserId: userId, role: "PATIENT" } });
    const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!patient || !appointment || appointment.patientId !== patient.id) throw new Error("Appointment not found or not authorized");
    if (!["SCHEDULED", "CONFIRMED"].includes(appointment.status)) throw new Error("This appointment cannot be rescheduled");
    const windows = await tx.availability.findMany({ where: { doctorId: appointment.doctorId, status: "AVAILABLE" } });
    const minutes = (value) => value.getHours() * 60 + value.getMinutes();
    const day = startTime.getDay();
    if (!windows.some((window) => (window.dayOfWeek === null || window.dayOfWeek === day) && (!window.blockedDate || new Date(window.blockedDate).toDateString() !== startTime.toDateString()) && minutes(new Date(window.startTime)) <= minutes(startTime) && minutes(new Date(window.endTime)) >= minutes(endTime))) throw new Error("The selected time is outside the doctor's availability");
    const conflict = { startTime: { lt: endTime }, endTime: { gt: startTime } };
    const [doctorConflict, patientConflict] = await Promise.all([
      tx.appointment.findFirst({ where: { id: { not: appointment.id }, doctorId: appointment.doctorId, status: { in: BOOKING_STATUSES }, ...conflict } }),
      tx.appointment.findFirst({ where: { id: { not: appointment.id }, patientId: patient.id, status: { in: BOOKING_STATUSES }, ...conflict } }),
    ]);
    if (doctorConflict || patientConflict) throw new Error("This slot is no longer available. Please select another time.");
    await tx.appointmentReminder.deleteMany({ where: { appointmentId: appointment.id } });
    const updated = await tx.appointment.update({ where: { id: appointment.id }, data: { startTime, endTime } });
    await createAppointmentNotificationPair(tx, updated, { type: "APPOINTMENT_RESCHEDULED", title: "Appointment rescheduled", patientMessage: "Your appointment was rescheduled.", doctorMessage: "An appointment was rescheduled.", key: `appointment:${updated.id}:rescheduled:${startTime.toISOString()}` });
    return updated;
  }, { isolationLevel: "Serializable" });
  revalidatePath("/appointments");
  return { success: true, appointment: result };
}
