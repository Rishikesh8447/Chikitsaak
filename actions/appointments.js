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
import { withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";
import { isOriginalAppointmentPaymentVerified } from "@/lib/follow-up-appointment.mjs";
import { sendAppointmentBookedEmail, sendAppointmentRescheduledEmail } from "@/lib/email";

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

function formatVonageApplicationId(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, "") : "";
}

function formatVonagePrivateKey(value) {
  return typeof value === "string" ? value.trim().replace(/\\n/g, "\n") : "";
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
  vonage = new Vonage(new Auth({ applicationId: formatVonageApplicationId(process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID), privateKey: formatVonagePrivateKey(process.env.VONAGE_PRIVATE_KEY) }), {});
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
    throw new Error(error instanceof Error && ["Unauthorized", "User not found", "Appointment ID is required", "Appointment not found", "You are not authorized to join this call", "This is an in-person appointment", "Waiting for doctor confirmation", "Doctor verification is required to join calls", "This appointment is not available for video consultation", "The call will be available 30 minutes before the scheduled time", "This appointment has ended", "Video session provisioning failed", "Video session could not be saved"].includes(error.message) ? error.message : "Unable to authorize video call. Please try again.");
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
  return { success: true, videoSessionId: sessionId, token, appId: formatVonageApplicationId(process.env.NEXT_PUBLIC_VONAGE_APPLICATION_ID) };
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
    const patient = await tx.user.findUnique({ where: { clerkUserId: userId, role: "PATIENT" }, select: { id: true, name: true, email: true } });
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
    const doctor = await tx.user.findUnique({ where: { id: appointment.doctorId, role: "DOCTOR", verificationStatus: "VERIFIED" }, select: { id: true, name: true, email: true } });
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
    return {
      ...updated,
      patient: { name: patient?.name, email: patient?.email },
      doctor: { name: doctor?.name, email: doctor?.email },
    };
  }, { isolationLevel: "Serializable" });

  if (result?.patient?.email) {
    sendAppointmentRescheduledEmail({
      to: result.patient.email,
      recipientName: result.patient.name || "Patient",
      otherPartyName: result.doctor?.name || "Doctor",
      recipientRole: "PATIENT",
      newStartTime: startTime,
      consultationMode: result.consultationMode,
    }).catch((err) => console.error("Failed to send reschedule email to patient:", err));
  }
  if (result?.doctor?.email) {
    sendAppointmentRescheduledEmail({
      to: result.doctor.email,
      recipientName: result.doctor.name || "Doctor",
      otherPartyName: result.patient?.name || "Patient",
      recipientRole: "DOCTOR",
      newStartTime: startTime,
      consultationMode: result.consultationMode,
    }).catch((err) => console.error("Failed to send reschedule email to doctor:", err));
  }

  revalidatePath("/appointments");
  return { success: true, appointment: result };
}

export async function scheduleFollowUpAppointment(formData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const originalAppointmentId = formData.get("originalAppointmentId");
  const startValue = formData.get("startTime");
  const endValue = formData.get("endTime");
  const consultationMode = formData.get("consultationMode") || "ONLINE";
  const patientDescription = typeof formData.get("patientDescription") === "string"
    ? formData.get("patientDescription").trim().slice(0, 5000) || null
    : null;

  if (typeof originalAppointmentId !== "string" || !originalAppointmentId.trim()) {
    throw new Error("Original appointment is required");
  }
  if (!["ONLINE", "OFFLINE"].includes(consultationMode)) {
    throw new Error("Invalid consultation mode");
  }

  const startTime = new Date(startValue);
  const endTime = new Date(endValue);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new Error("Invalid appointment timing");
  }
  const now = new Date();
  if (startTime <= now) {
    throw new Error("Follow-up appointment slot must be in the future");
  }
  if (endTime <= startTime || (endTime.getTime() - startTime.getTime()) !== 20 * 60 * 1000) {
    throw new Error("Appointment duration must be exactly 20 minutes");
  }

  const result = await withSerializableRetries(() =>
    db.$transaction(async (tx) => {
      const patient = await tx.user.findUnique({
        where: { clerkUserId: userId, role: "PATIENT" },
        select: { id: true, name: true, email: true },
      });
      if (!patient) throw new Error("Patient not found or unauthorized");

      const original = await tx.appointment.findUnique({
        where: { id: originalAppointmentId },
        include: {
          doctor: { select: { id: true, name: true, role: true, verificationStatus: true, email: true } },
          prescription: { select: { id: true, followUpRequired: true, followUpDays: true } },
          payment: {
            select: {
              method: true,
              status: true,
              verifiedAt: true,
              refundStatus: true,
              cashCollection: { select: { collectedAt: true, paymentId: true } },
            },
          },
          followUpAppointment: {
            select: { id: true, status: true, startTime: true, endTime: true },
          },
        },
      });

      if (!original || original.patientId !== patient.id) {
        throw new Error("Original appointment not found or not owned by you");
      }
      if (original.status !== "COMPLETED") {
        throw new Error("A follow-up can only be scheduled for a completed consultation");
      }
      if (original.originalAppointmentId) {
        throw new Error("A follow-up consultation cannot have another follow-up");
      }
      if (!original.prescription?.followUpRequired) {
        throw new Error("The doctor did not recommend a follow-up for this consultation");
      }
      if (!isOriginalAppointmentPaymentVerified(original.payment, original.consultationMode)) {
        throw new Error("A verified paid consultation is required to schedule an included follow-up");
      }
      if (original.doctor.role !== "DOCTOR" || original.doctor.verificationStatus !== "VERIFIED") {
        throw new Error("Doctor is not currently verified");
      }

      const existingFollowUp = original.followUpAppointment;
      if (existingFollowUp && existingFollowUp.status !== "CANCELLED") {
        throw new Error("A follow-up consultation has already been scheduled for this appointment");
      }

      const windows = await tx.availability.findMany({
        where: { doctorId: original.doctorId, status: "AVAILABLE" },
      });
      const timeInMinutes = (val) => val.getHours() * 60 + val.getMinutes();
      const sameDate = (a, b) => a.toDateString() === b.toDateString();
      const day = startTime.getDay();
      const inWindow = windows.some((w) =>
        (w.dayOfWeek === null || w.dayOfWeek === day) &&
        (!w.blockedDate || !sameDate(new Date(w.blockedDate), startTime)) &&
        timeInMinutes(new Date(w.startTime)) <= timeInMinutes(startTime) &&
        timeInMinutes(new Date(w.endTime)) >= timeInMinutes(endTime)
      );
      if (!inWindow) {
        throw new Error("The selected time is outside the doctor's availability");
      }

      const conflictOverlap = { startTime: { lt: endTime }, endTime: { gt: startTime } };
      const activeHoldOrBooking = {
        OR: [
          { status: { in: BOOKING_STATUSES } },
          { status: "PAYMENT_PENDING", checkoutExpiresAt: { gt: now } },
        ],
      };
      const excludeFilter = existingFollowUp ? { id: { not: existingFollowUp.id } } : {};
      const [doctorConflict, patientConflict] = await Promise.all([
        tx.appointment.findFirst({
          where: { doctorId: original.doctorId, ...conflictOverlap, ...activeHoldOrBooking, ...excludeFilter },
        }),
        tx.appointment.findFirst({
          where: { patientId: patient.id, ...conflictOverlap, ...activeHoldOrBooking, ...excludeFilter },
        }),
      ]);
      if (doctorConflict || patientConflict) {
        throw new Error("This slot is no longer available. Please select another time.");
      }

      let bookedAppointment;
      if (existingFollowUp && existingFollowUp.status === "CANCELLED") {
        const reactivated = await tx.appointment.updateMany({
          where: { id: existingFollowUp.id, status: "CANCELLED" },
          data: {
            startTime,
            endTime,
            consultationMode,
            patientDescription,
            status: "SCHEDULED",
            videoSessionId: null,
            checkoutExpiresAt: null,
          },
        });
        if (reactivated.count !== 1) {
          throw new Error("Follow-up appointment state changed; please try again.");
        }
        await tx.appointmentReminder.deleteMany({
          where: { appointmentId: existingFollowUp.id },
        });
        bookedAppointment = await tx.appointment.findUnique({
          where: { id: existingFollowUp.id },
        });
      } else {
        bookedAppointment = await tx.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: original.doctorId,
            startTime,
            endTime,
            consultationMode,
            patientDescription,
            status: "SCHEDULED",
            originalAppointmentId: original.id,
          },
        });
      }

      await createAppointmentNotificationPair(tx, bookedAppointment, {
        type: "APPOINTMENT_BOOKED",
        title: "Follow-up consultation scheduled",
        patientMessage: `Your follow-up consultation with Dr. ${original.doctor.name || "your doctor"} has been scheduled (included at ₹0). Waiting for doctor confirmation.`,
        doctorMessage: `A follow-up consultation was scheduled by ${patient.name || "your patient"} for ${format(startTime, "MMM d, yyyy 'at' h:mm a")}.`,
        key: `appointment:${bookedAppointment.id}:follow-up:${startTime.toISOString()}`,
      });

      return {
        ...bookedAppointment,
        patientEmail: patient?.email,
        patientName: patient?.name,
        doctorEmail: original.doctor?.email,
        doctorName: original.doctor?.name,
      };
    }, { isolationLevel: "Serializable" })
  );

  if (result?.patientEmail) {
    sendAppointmentBookedEmail({
      to: result.patientEmail,
      recipientRole: "PATIENT",
      recipientName: result.patientName || "Patient",
      otherPartyName: result.doctorName || "Doctor",
      startTime: result.startTime,
      consultationMode: result.consultationMode,
      isFollowUp: true,
    }).catch((err) => console.error("Failed to send follow-up booking email to patient:", err));
  }
  if (result?.doctorEmail) {
    sendAppointmentBookedEmail({
      to: result.doctorEmail,
      recipientRole: "DOCTOR",
      recipientName: result.doctorName || "Doctor",
      otherPartyName: result.patientName || "Patient",
      startTime: result.startTime,
      consultationMode: result.consultationMode,
      isFollowUp: true,
    }).catch((err) => console.error("Failed to send follow-up booking email to doctor:", err));
  }

  revalidatePath("/appointments");
  revalidatePath("/doctor");
  return { success: true, appointment: result };
}
