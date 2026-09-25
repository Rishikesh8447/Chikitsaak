"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const CREDIT_VALUE = 10; // $10 per credit total
const PLATFORM_FEE_PER_CREDIT = 2; // $2 platform fee
const DOCTOR_EARNINGS_PER_CREDIT = 8; // $8 to doctor

/**
 * Request payout for all remaining credits
 */
export async function requestPayout(formData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const paypalEmail = formData.get("paypalEmail");
    if (typeof paypalEmail !== "string" || !paypalEmail.trim() || paypalEmail.length > 254) {
      throw new Error("PayPal email is required");
    }
    const payout = await db.$transaction(async (tx) => {
      const doctor = await tx.user.findUnique({ where: { clerkUserId: userId, role: "DOCTOR", verificationStatus: "VERIFIED" } });
      if (!doctor) throw new Error("Doctor not found or not verified");
      const existing = await tx.payout.findFirst({ where: { doctorId: doctor.id, status: "PROCESSING" } });
      if (existing) throw new Error("You already have a pending payout request");
      const creditCount = doctor.credits;
      if (creditCount < 1) throw new Error("No credits available for payout");
      const reserved = await tx.user.updateMany({ where: { id: doctor.id, credits: creditCount }, data: { credits: 0 } });
      if (reserved.count !== 1) throw new Error("Credit balance changed. Please try again.");
      const payout = await tx.payout.create({ data: { doctorId: doctor.id, amount: creditCount * CREDIT_VALUE, credits: creditCount, platformFee: creditCount * PLATFORM_FEE_PER_CREDIT, netAmount: creditCount * DOCTOR_EARNINGS_PER_CREDIT, paypalEmail: paypalEmail.trim(), status: "PROCESSING" } });
      await tx.creditTransaction.create({ data: { userId: doctor.id, amount: -creditCount, type: "ADMIN_ADJUSTMENT", allocationKey: `payout:${payout.id}:credit-reservation` } });
      return payout;
    }, { isolationLevel: "Serializable" });

    revalidatePath("/doctor");
    return { success: true, payout };
  } catch (error) {
    console.error("Failed to request payout:", error);
    const message = error instanceof Error && ["PayPal email is required", "Doctor not found or not verified", "You already have a pending payout request", "No credits available for payout", "Credit balance changed. Please try again."].includes(error.message) ? error.message : "Failed to request payout. Please try again.";
    throw new Error(message);
  }
}

/**
 * Get doctor's payout history
 */
export async function getDoctorPayouts() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const doctor = await db.user.findFirst({
      where: {
        clerkUserId: userId,
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    const payouts = await db.payout.findMany({
      where: {
        doctorId: doctor.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { payouts };
  } catch (error) {
    throw new Error("Failed to fetch payouts. Please try again.");
  }
}

/**
 * Get doctor's earnings summary
 */
export async function getDoctorEarnings() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const doctor = await db.user.findFirst({
      where: {
        clerkUserId: userId,
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
    });

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    // Get all completed appointments for this doctor
    const completedAppointments = await db.appointment.findMany({
      where: {
        doctorId: doctor.id,
        status: "COMPLETED",
      },
    });

    // Calculate this month's completed appointments
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const thisMonthAppointments = completedAppointments.filter(
      (appointment) => new Date(appointment.createdAt) >= currentMonth
    );

    // Lifetime earnings come from completed consultations, not the mutable balance.
    const totalEarnings = completedAppointments.length * 2 * DOCTOR_EARNINGS_PER_CREDIT;

    // Calculate this month's earnings (2 credits per appointment * $8 per credit)
    const thisMonthEarnings =
      thisMonthAppointments.length * 2 * DOCTOR_EARNINGS_PER_CREDIT;

    // Simple average per month calculation
    const averageEarningsPerMonth = totalEarnings > 0 ? totalEarnings / Math.max(1, new Date().getMonth() + 1) : 0;

    // Get current credit balance for payout calculations
    const availableCredits = doctor.credits;
    const availablePayout = availableCredits * DOCTOR_EARNINGS_PER_CREDIT;

    return {
      earnings: {
        totalEarnings,
        thisMonthEarnings,
        completedAppointments: completedAppointments.length,
        averageEarningsPerMonth,
        availableCredits,
        availablePayout,
      },
    };
  } catch (error) {
    throw new Error("Failed to fetch doctor earnings. Please try again.");
  }
}
