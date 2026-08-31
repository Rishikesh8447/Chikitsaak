"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAppointmentNotificationPair } from "@/lib/notifications";

/**
 * Set doctor's availability slots
 */
export async function setAvailabilitySlots(formData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    // Get the doctor
    const doctor = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "DOCTOR",
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    // Get form data
    const startTime = formData.get("startTime");
    const endTime = formData.get("endTime");

    // Validate input
    if (!startTime || !endTime) {
      throw new Error("Start time and end time are required");
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw new Error("Start time must be before end time");
    }
    const dayOfWeekValue = formData.get("dayOfWeek");
    const dayOfWeek = dayOfWeekValue === null || dayOfWeekValue === "" ? null : Number(dayOfWeekValue);
    if (dayOfWeek !== null && (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)) throw new Error("Invalid day of week");
    const newSlot = await db.$transaction(async (tx) => {
      const existing = await tx.availability.findMany({ where: { doctorId: doctor.id, status: "AVAILABLE" } });
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      const overlaps = existing.some((slot) => {
        const slotStart = new Date(slot.startTime).getHours() * 60 + new Date(slot.startTime).getMinutes();
        const slotEnd = new Date(slot.endTime).getHours() * 60 + new Date(slot.endTime).getMinutes();
        return (slot.dayOfWeek === null || dayOfWeek === null || slot.dayOfWeek === dayOfWeek) && slotStart < endMinutes && slotEnd > startMinutes;
      });
      if (overlaps) throw new Error("This availability period overlaps an existing period");
      const appointments = await tx.appointment.findMany({ where: { doctorId: doctor.id, status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] }, startTime: { lt: end }, endTime: { gt: start } } });
      if (appointments.some((appointment) => appointment.startTime < start || appointment.endTime > end)) throw new Error("Availability cannot invalidate an existing appointment");
      return tx.availability.create({ data: { doctorId: doctor.id, startTime: start, endTime: end, dayOfWeek, status: "AVAILABLE" } });
    }, { isolationLevel: "Serializable" });

    revalidatePath("/doctor");
    return { success: true, slot: newSlot };
  } catch (error) {
    console.error("Failed to set availability slots:", error);
    throw new Error("Failed to set availability: " + error.message);
  }
}

/**
 * Get doctor's current availability slots
 */
export async function getDoctorAvailability() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const doctor = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "DOCTOR",
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const availabilitySlots = await db.availability.findMany({
      where: {
        doctorId: doctor.id,
      },
      orderBy: {
        startTime: "asc",
      },
    });

    return { slots: availabilitySlots };
  } catch (error) {
    throw new Error("Failed to fetch availability slots " + error.message);
  }
}

/**
 * Get doctor's upcoming appointments
 */

export async function getDoctorAppointments() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const doctor = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "DOCTOR",
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const appointments = await db.appointment.findMany({
      where: {
        doctorId: doctor.id,
        status: {
          in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"],
        },
      },
      include: {
        patient: { select: { id: true, name: true, email: true, imageUrl: true } },
        prescription: { include: { medicines: true } },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    return { appointments };
  } catch (error) {
    throw new Error("Failed to fetch appointments " + error.message);
  }
}

/**
 * Cancel an appointment (can be done by both doctor and patient)
 */
export async function cancelAppointment(formData) {
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

    // Find the appointment with both patient and doctor details
    const appointment = await db.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      include: {
        patient: true,
        doctor: true,
      },
    });

    if (!appointment) {
      throw new Error("Appointment not found");
    }

    if (!["IN_PROGRESS", "COMPLETED"].includes(appointment.status)) {
      throw new Error("Consultation notes can only be added during or after a consultation");
    }

    if (typeof notes !== "string" || notes.trim().length > 10000) {
      throw new Error("Notes are invalid");
    }

    // Verify the user is either the doctor or the patient for this appointment
    if (appointment.doctorId !== user.id && appointment.patientId !== user.id) {
      throw new Error("You are not authorized to cancel this appointment");
    }

    // Perform cancellation in a transaction
    await db.$transaction(async (tx) => {
      const cancelled = await tx.appointment.updateMany({ where: { id: appointmentId, status: { in: ["SCHEDULED", "CONFIRMED"] } }, data: { status: "CANCELLED" } });
      if (cancelled.count !== 1) throw new Error("This appointment cannot be cancelled");

      // Always refund credits to patient and deduct from doctor
      // Create credit transaction for patient (refund)
      await tx.creditTransaction.create({
        data: {
          userId: appointment.patientId,
          amount: 2,
          type: "APPOINTMENT_REFUND",
          allocationKey: `appointment:${appointment.id}:patient-refund`,
        },
      });

      // Create credit transaction for doctor (deduction)
      await tx.creditTransaction.create({
        data: {
          userId: appointment.doctorId,
          amount: -2,
          type: "APPOINTMENT_REFUND",
          allocationKey: `appointment:${appointment.id}:doctor-refund`,
        },
      });

      // Update patient's credit balance (increment)
      await tx.user.update({
        where: {
          id: appointment.patientId,
        },
        data: {
          credits: {
            increment: 2,
          },
        },
      });

      const doctorDebit = await tx.user.updateMany({ where: { id: appointment.doctorId, credits: { gte: 2 } }, data: { credits: { decrement: 2 } } });
      if (doctorDebit.count !== 1) throw new Error("Doctor credit balance cannot become negative");
      await createAppointmentNotificationPair(tx, appointment, { type: "APPOINTMENT_CANCELLED", title: "Appointment cancelled", patientMessage: "Your appointment was cancelled.", doctorMessage: "An appointment was cancelled.", key: `appointment:${appointment.id}:cancelled` });
    });

    // Determine which path to revalidate based on user role
    if (user.role === "DOCTOR") {
      revalidatePath("/doctor");
    } else if (user.role === "PATIENT") {
      revalidatePath("/appointments");
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to cancel appointment:", error);
    throw new Error("Failed to cancel appointment: " + error.message);
  }
}

/**
 * Add notes to an appointment
 */
export async function addAppointmentNotes(formData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const doctor = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "DOCTOR",
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const appointmentId = formData.get("appointmentId");
    const notes = formData.get("notes");

    if (!appointmentId || !notes) {
      throw new Error("Appointment ID and notes are required");
    }

    // Verify the appointment belongs to this doctor
    const appointment = await db.appointment.findUnique({
      where: {
        id: appointmentId,
        doctorId: doctor.id,
      },
    });

    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Update the appointment notes
    const updatedAppointment = await db.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        notes: notes.trim(),
      },
    });

    revalidatePath("/doctor");
    return { success: true, appointment: updatedAppointment };
  } catch (error) {
    console.error("Failed to add appointment notes:", error);
    throw new Error("Failed to update notes: " + error.message);
  }
}

/**
 * Mark an appointment as completed (only by doctor after end time)
 */
export async function markAppointmentCompleted(formData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const doctor = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "DOCTOR",
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const appointmentId = formData.get("appointmentId");

    if (!appointmentId) {
      throw new Error("Appointment ID is required");
    }

    // Find the appointment
    const appointment = await db.appointment.findUnique({
      where: {
        id: appointmentId,
        doctorId: doctor.id, // Ensure appointment belongs to this doctor
      },
      include: {
        patient: true,
      },
    });

    if (!appointment) {
      throw new Error("Appointment not found or not authorized");
    }

    // Check if appointment is currently scheduled
    if (appointment.status !== "IN_PROGRESS") {
      throw new Error("This appointment cannot be marked as completed");
    }

    // Check if current time is after the appointment end time
    const now = new Date();
    const appointmentEndTime = new Date(appointment.endTime);

    if (now < appointmentEndTime) {
      throw new Error(
        "Cannot mark appointment as completed before the scheduled end time"
      );
    }

    // Update the appointment status to COMPLETED
    const updatedAppointment = await db.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        status: "COMPLETED",
      },
    });

    revalidatePath("/doctor");
    return { success: true, appointment: updatedAppointment };
  } catch (error) {
    console.error("Failed to mark appointment as completed:", error);
    throw new Error(
      "Failed to mark appointment as completed: " + error.message
    );
  }
}

const STATUS_TRANSITIONS = {
  SCHEDULED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
};

export async function updateAppointmentStatus(formData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const appointmentId = formData.get("appointmentId");
  const nextStatus = formData.get("status");
  if (typeof appointmentId !== "string" || typeof nextStatus !== "string") throw new Error("Invalid status update");
  const actor = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (!actor || !["DOCTOR", "ADMIN"].includes(actor.role)) throw new Error("Not authorized");
  const appointment = await db.appointment.findUnique({ where: { id: appointmentId, ...(actor.role === "DOCTOR" ? { doctorId: actor.id } : {}) } });
  if (!appointment || !STATUS_TRANSITIONS[appointment.status]?.includes(nextStatus)) throw new Error("Invalid appointment status transition");
  if (["COMPLETED", "NO_SHOW"].includes(nextStatus) && new Date() < appointment.endTime) throw new Error("This appointment has not ended yet");
  const updated = await db.$transaction(async (tx) => {
    const changed = await tx.appointment.update({ where: { id: appointment.id }, data: { status: nextStatus } });
    if (nextStatus === "CONFIRMED") await createAppointmentNotificationPair(tx, changed, { type: "APPOINTMENT_CONFIRMED", title: "Appointment confirmed", patientMessage: "Your appointment has been confirmed.", doctorMessage: "Appointment confirmed.", key: `appointment:${changed.id}:confirmed` });
    if (nextStatus === "NO_SHOW") await createAppointmentNotificationPair(tx, changed, { type: "NO_SHOW", title: "Appointment marked no-show", patientMessage: "Your appointment was marked as no-show.", doctorMessage: "The appointment was marked as no-show.", key: `appointment:${changed.id}:no-show` });
    return changed;
  });
  revalidatePath("/doctor");
  revalidatePath("/appointments");
  return { success: true, appointment: updated };
}

export async function removeAvailabilitySlot(formData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const slotId = formData.get("slotId");
  const doctor = await db.user.findUnique({ where: { clerkUserId: userId, role: "DOCTOR" } });
  if (!doctor || typeof slotId !== "string") throw new Error("Invalid availability request");
  const slot = await db.availability.findUnique({ where: { id: slotId, doctorId: doctor.id } });
  if (!slot) throw new Error("Availability period not found");
  const occupied = await db.appointment.findFirst({ where: { doctorId: doctor.id, status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] }, startTime: { lt: slot.endTime }, endTime: { gt: slot.startTime } } });
  if (occupied) throw new Error("This period contains a booked appointment and cannot be removed");
  await db.availability.delete({ where: { id: slot.id } });
  revalidatePath("/doctor");
  return { success: true };
}
