"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { Vonage } from "@vonage/server-sdk";
import { addDays, addMinutes, format, endOfDay } from "date-fns";
import { Auth } from "@vonage/auth";
import { createAppointmentNotificationPair } from "@/lib/notifications";
import { resolveDoctorPublicNames } from "@/lib/doctor-name";
import { getVideoJoinWindowError } from "@/lib/appointment-time.mjs";
import { measureServerTiming } from "@/lib/server-timing.mjs";

const BOOKING_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];
const VIDEO_STATUSES = ["CONFIRMED", "IN_PROGRESS"];
const VIDEO_ENVIRONMENT_VARIABLES = ["NEXT_PUBLIC_VONAGE_APPLICATION_ID", "VONAGE_PRIVATE_KEY"];
const videoSessionProvisioning = new Map();

function logVideoProvisioningFailure(operation, error) {
  const missingVariables = VIDEO_ENVIRONMENT_VARIABLES.filter((name) => error?.missingVariables?.includes(name));
  const httpStatus = Number.isInteger(error?.response?.status)
    ? error.response.status
    : Number.isInteger(error?.statusCode)
      ? error.statusCode
      : null;
  const providerCodes = new Set(["ERR_BAD_REQUEST", "ERR_BAD_RESPONSE", "ERR_NETWORK", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"]);
  const providerCode = providerCodes.has(error?.code) ? error.code : null;
  let errorCode = error?.diagnosticCode || "VONAGE_REQUEST_FAILED";
  let description = "The video provider request failed.";
  if (missingVariables.length) {
    errorCode = "VIDEO_CONFIGURATION_MISSING";
    description = "Video session creation requires the configured Vonage application ID and private key.";
  } else if (error?.diagnosticCode === "VIDEO_SESSION_ID_MISSING") {
    description = "Vonage returned a session response without a session ID.";
  } else if (error?.diagnosticCode === "VIDEO_SESSION_PERSIST_FAILED") {
    description = "The generated video session could not be saved for the appointment.";
  } else if (httpStatus === 401 || httpStatus === 403) {
    errorCode = "VONAGE_AUTHENTICATION_REJECTED";
    description = "Vonage rejected the configured application credentials.";
  } else if (httpStatus === 429) {
    errorCode = "VONAGE_RATE_LIMITED";
    description = "Vonage rate limited the session request.";
  } else if (httpStatus >= 500) {
    errorCode = "VONAGE_SERVER_ERROR";
    description = "Vonage returned a server error.";
  }
  console.error("Video session provisioning diagnostic", {
    operation,
    errorCode,
    providerCode,
    httpStatus,
    missingVariables,
    description,
  });
}

// Initialize Vonage Video API client
let vonage;
function getVonage() {
  if (vonage) return vonage;
  const missingVariables = VIDEO_ENVIRONMENT_VARIABLES.filter((name) => !process.env[name]);
  if (missingVariables.length) {
    throw Object.assign(new Error("Video service is not configured"), {
      diagnosticCode: "VIDEO_CONFIGURATION_MISSING",
      missingVariables,
    });
  }
  vonage = new Vonage(new Auth({ applicationId: process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID, privateKey: process.env.VONAGE_PRIVATE_KEY.replace(/\\n/g, "\n") }), {});
  return vonage;
}

/**
 * Generate a Vonage Video API session
 */
async function createVideoSession() {
  try {
    const session = await getVonage().video.createSession({ mediaMode: "routed" });
    if (typeof session?.sessionId !== "string" || !session.sessionId) {
      throw Object.assign(new Error("Invalid video session response"), { diagnosticCode: "VIDEO_SESSION_ID_MISSING" });
    }
    return session.sessionId;
  } catch (error) {
    logVideoProvisioningFailure("createSession", error);
    throw new Error("Video session provisioning failed");
  }
}

async function ensureVideoSession(appointment) {
  if (appointment.videoSessionId) return appointment.videoSessionId;
  const persisted = await db.appointment.findUnique({ where: { id: appointment.id }, select: { videoSessionId: true } });
  if (persisted?.videoSessionId) return persisted.videoSessionId;

  let pending = videoSessionProvisioning.get(appointment.id);
  if (!pending) {
    pending = { sessionId: null, promise: null };
    videoSessionProvisioning.set(appointment.id, pending);
  }
  if (!pending.promise) {
    pending.promise = (async () => {
      if (!pending.sessionId) pending.sessionId = await createVideoSession();
      try {
        await db.appointment.updateMany({ where: { id: appointment.id, videoSessionId: null }, data: { videoSessionId: pending.sessionId } });
        const updated = await db.appointment.findUnique({ where: { id: appointment.id }, select: { videoSessionId: true } });
        if (!updated?.videoSessionId) throw new Error("Video session could not be saved");
        return updated.videoSessionId;
      } catch (error) {
        logVideoProvisioningFailure("persistSession", Object.assign(error instanceof Error ? error : new Error("Persistence failed"), { diagnosticCode: "VIDEO_SESSION_PERSIST_FAILED" }));
        throw error;
      }
    })();
  }

  try {
    const sessionId = await pending.promise;
    videoSessionProvisioning.delete(appointment.id);
    return sessionId;
  } catch (error) {
    pending.promise = null;
    if (!pending.sessionId) videoSessionProvisioning.delete(appointment.id);
    throw error;
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
    if (user.role === "DOCTOR" && user.verificationStatus !== "VERIFIED") throw new Error("Doctor verification is required to join calls");

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
    if (appointment.consultationMode === "OFFLINE") throw new Error("This is an in-person appointment");

    // Verify the appointment is scheduled
    if (!VIDEO_STATUSES.includes(appointment.status)) {
      throw new Error(appointment.status === "SCHEDULED" ? "Waiting for doctor confirmation" : "This appointment is not available for video consultation");
    }

    const now = new Date();
    const joinWindowError = getVideoJoinWindowError(appointment.startTime, appointment.endTime, now);
    if (joinWindowError) throw new Error(joinWindowError);

    await ensureVideoSession(appointment);
    if (appointment.status === "CONFIRMED" && appointment.doctorId === user.id && now >= new Date(appointment.startTime)) {
      const started = await db.appointment.updateMany({ where: { id: appointment.id, status: "CONFIRMED" }, data: { status: "IN_PROGRESS" } });
      if (started.count === 1) revalidatePath("/appointments");
    }
    return { success: true };
  } catch (error) {
    throw new Error(error instanceof Error && ["Unauthorized", "User not found", "Appointment ID is required", "Appointment not found", "You are not authorized to join this call", "This is an in-person appointment", "Waiting for doctor confirmation", "This appointment is not available for video consultation", "The call will be available 30 minutes before the scheduled time", "Video session provisioning failed", "Video session could not be saved"].includes(error.message) ? error.message : "Unable to authorize video call. Please try again.");
  }
}

export async function getVideoCallCredentials(appointmentId) {
  const { userId } = await auth();
  if (!userId || typeof appointmentId !== "string") throw new Error("Unauthorized");
  const user = await db.user.findUnique({ where: { clerkUserId: userId } });
  const appointment = await db.appointment.findUnique({ where: { id: appointmentId } });
  if (!user || !appointment || (appointment.doctorId !== user.id && appointment.patientId !== user.id)) throw new Error("You are not authorized to join this call");
  if (user.role === "DOCTOR" && user.verificationStatus !== "VERIFIED") throw new Error("Doctor verification is required to join calls");
  if (appointment.consultationMode === "OFFLINE") throw new Error("This is an in-person appointment");
  if (!VIDEO_STATUSES.includes(appointment.status)) throw new Error(appointment.status === "SCHEDULED" ? "Waiting for doctor confirmation" : "This appointment is not available for video consultation");
  const now = new Date();
  const joinWindowError = getVideoJoinWindowError(appointment.startTime, appointment.endTime, now);
  if (joinWindowError) throw new Error(joinWindowError === "The call will be available 30 minutes before the scheduled time" ? "The video call is not currently available" : joinWindowError);
  const sessionId = await ensureVideoSession(appointment);
  if (appointment.status === "CONFIRMED" && appointment.doctorId === user.id && now >= new Date(appointment.startTime)) {
    const started = await db.appointment.updateMany({ where: { id: appointment.id, status: "CONFIRMED" }, data: { status: "IN_PROGRESS" } });
    if (started.count === 1) revalidatePath("/appointments");
  }
  let token;
  try {
    token = getVonage().video.generateClientToken(sessionId, { role: "publisher", expireTime: Math.floor(new Date(appointment.endTime).getTime() / 1000) + 60 * 60, data: JSON.stringify({ name: user.name || "Participant", role: user.role, userId: user.id }) });
  } catch (error) {
    logVideoProvisioningFailure("generateClientToken", error);
    throw new Error("Video call authorization failed");
  }
  return { success: true, videoSessionId: sessionId, token, appId: process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID };
}

/**
 * Get doctor by ID
 */
export async function getDoctorById(doctorId) {
  try {
    const doctor = await measureServerTiming("doctorProfile.databaseLookup", () => db.user.findFirst({
      where: {
        OR: [{ id: doctorId }, { clerkUserId: doctorId }],
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
        consultationPriceRupees: true,
      },
    }));

    if (!doctor) return { doctor: null };

    const [resolvedDoctor] = await measureServerTiming("doctorProfile.clerkNameResolution", () => resolveDoctorPublicNames([doctor]));
    return { doctor: resolvedDoctor };
  } catch (error) {
    console.error("Failed to fetch doctor:", error);
    throw new Error("Failed to fetch doctor details");
  }
}

/**
 * Get available time slots for booking for the next 4 days
 */
export async function getAvailableTimeSlots(doctorId, startDate) {
  const doctor = await measureServerTiming("doctorProfile.availabilityDoctorLookup", () =>
    db.user.findUnique({ where: { id: doctorId, role: "DOCTOR", verificationStatus: "VERIFIED" } })
  );
  if (!doctor) throw new Error("Doctor not found or not verified");
  const now = new Date();
  const firstDay = startDate ? new Date(startDate) : now;
  if (Number.isNaN(firstDay.getTime())) throw new Error("Invalid date");
  firstDay.setHours(0, 0, 0, 0);
  const days = [0, 1, 2, 3].map((offset) => addDays(firstDay, offset));
  const lastDay = endOfDay(days[days.length - 1]);
  const [availability, appointments] = await Promise.all([
    measureServerTiming("doctorProfile.availabilityQuery", () => db.availability.findMany({ where: { doctorId, status: "AVAILABLE" } })),
    measureServerTiming("doctorProfile.bookedSlotsQuery", () => db.appointment.findMany({ where: { doctorId, OR: [{ status: { in: BOOKING_STATUSES } }, { status: "PAYMENT_PENDING", checkoutExpiresAt: { gt: now } }], startTime: { lt: lastDay }, endTime: { gt: firstDay } } })),
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
      for (let current = start; current < end; current = addMinutes(current, 20)) {
        const next = addMinutes(current, 20);
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
  if (typeof appointmentId !== "string" || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || endTime <= startTime || (endTime - startTime) !== 20 * 60 * 1000 || startTime <= new Date()) throw new Error("Invalid rescheduling details");
  const result = await db.$transaction(async (tx) => {
    const patient = await tx.user.findUnique({ where: { clerkUserId: userId, role: "PATIENT" } });
    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { payment: { select: {
        method: true,
        status: true,
        verifiedAt: true,
        refundStatus: true,
        cashCollection: { select: { paymentId: true } },
      } } },
    });
    if (!patient || !appointment || appointment.patientId !== patient.id) throw new Error("Appointment not found or not authorized");
    if (!["SCHEDULED", "CONFIRMED"].includes(appointment.status)) throw new Error("This appointment cannot be rescheduled");
    const doctor = await tx.user.findUnique({ where: { id: appointment.doctorId, role: "DOCTOR", verificationStatus: "VERIFIED" }, select: { id: true } });
    if (!doctor) throw new Error("Doctor not found or not verified");
    if (appointment.payment) {
      const payment = appointment.payment;
      const providerPaymentVerified = payment.status === "PAID"
        && Boolean(payment.verifiedAt)
        && payment.refundStatus === "NOT_REQUIRED";
      const cashPaymentEligible = appointment.consultationMode === "OFFLINE"
        && payment.method === "CASH"
        && payment.refundStatus === "NOT_REQUIRED"
        && (payment.status === "CASH_DUE" || (payment.status === "PAID" && Boolean(payment.cashCollection)));
      const verifiedOnlinePayment = appointment.consultationMode === "ONLINE"
        && payment.method === "ONLINE"
        && providerPaymentVerified;
      const verifiedOfflineUpiPayment = appointment.consultationMode === "OFFLINE"
        && payment.method === "UPI_QR"
        && providerPaymentVerified;
      if (!cashPaymentEligible && !verifiedOnlinePayment && !verifiedOfflineUpiPayment) {
        throw new Error("This appointment's payment state does not permit rescheduling");
      }
    }
    const windows = await tx.availability.findMany({ where: { doctorId: appointment.doctorId, status: "AVAILABLE" } });
    const minutes = (value) => value.getHours() * 60 + value.getMinutes();
    const day = startTime.getDay();
    if (!windows.some((window) => (window.dayOfWeek === null || window.dayOfWeek === day) && (!window.blockedDate || new Date(window.blockedDate).toDateString() !== startTime.toDateString()) && minutes(new Date(window.startTime)) <= minutes(startTime) && minutes(new Date(window.endTime)) >= minutes(endTime))) throw new Error("The selected time is outside the doctor's availability");
    const conflict = { startTime: { lt: endTime }, endTime: { gt: startTime } };
    const activeHoldOrBooking = { OR: [{ status: { in: BOOKING_STATUSES } }, { status: "PAYMENT_PENDING", checkoutExpiresAt: { gt: new Date() } }] };
    const [doctorConflict, patientConflict] = await Promise.all([
      tx.appointment.findFirst({ where: { id: { not: appointment.id }, doctorId: appointment.doctorId, ...activeHoldOrBooking, ...conflict } }),
      tx.appointment.findFirst({ where: { id: { not: appointment.id }, patientId: patient.id, ...activeHoldOrBooking, ...conflict } }),
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
