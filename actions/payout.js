"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { eligiblePaymentWhere, releasePaymentPayoutAllocations, reservePaymentCollections, sumAllocationPaise } from "@/lib/payment-payouts.mjs";
import { withSerializableRetries } from "@/lib/appointment-payment-reconciliation.mjs";
import { measureServerTiming } from "@/lib/server-timing.mjs";

function payoutDto(payout) {
  return {
    ...payout,
    amountPaise: payout.amountPaise == null ? null : payout.amountPaise.toString(),
    platformFeePaise: payout.platformFeePaise == null ? null : payout.platformFeePaise.toString(),
    netAmountPaise: payout.netAmountPaise == null ? null : payout.netAmountPaise.toString(),
    allocations: payout.allocations?.map((allocation) => ({
      ...allocation,
      amountPaise: allocation.amountPaise.toString(),
    })),
  };
}

export async function requestPaymentPayout(formData) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const requestKey = formData.get("requestKey");
  if (typeof requestKey !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) {
    throw new Error("A valid payout request key is required");
  }

  const doctor = await db.user.findUnique({
    where: { clerkUserId: userId, role: "DOCTOR", verificationStatus: "VERIFIED" },
    select: { id: true },
  });
  if (!doctor) throw new Error("Doctor not found or not verified");

  const existing = await db.payout.findUnique({ where: { requestKey } });
  if (existing) {
    if (existing.doctorId !== doctor.id) throw new Error("Payout request key is unavailable");
    return { success: true, alreadyRequested: true, payout: payoutDto(existing) };
  }

  try {
    const result = await withSerializableRetries(() => db.$transaction(async (tx) => {
      const txDoctor = await tx.user.findUnique({
        where: { id: doctor.id, role: "DOCTOR", verificationStatus: "VERIFIED" },
        select: { id: true },
      });
      if (!txDoctor) throw new Error("Doctor not found or not verified");
      const duplicate = await tx.payout.findUnique({ where: { requestKey } });
      if (duplicate) {
        if (duplicate.doctorId !== doctor.id) throw new Error("Payout request key is unavailable");
        return { payout: duplicate, alreadyRequested: true };
      }
      return { payout: await reservePaymentCollections(tx, { doctorId: doctor.id, requestKey }), alreadyRequested: false };
    }, { isolationLevel: "Serializable" }));

    revalidatePath("/doctor");
    revalidatePath("/admin");
    return { success: true, alreadyRequested: result.alreadyRequested, payout: payoutDto(result.payout) };
  } catch (error) {
    if (error?.code === "P2002") {
      const winner = await db.payout.findUnique({ where: { requestKey } });
      if (winner?.doctorId === doctor.id) {
        return { success: true, alreadyRequested: true, payout: payoutDto(winner) };
      }
    }
    if (error instanceof Error && ["No collected appointment payments are available for payout", "Doctor not found or not verified"].includes(error.message)) throw error;
    throw new Error("Unable to reserve collected payments for payout. Refresh and retry with the same request.");
  }
}

export async function cancelPaymentPayoutRequest(payoutId) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  if (typeof payoutId !== "string" || !payoutId) throw new Error("Invalid payout request");
  const doctor = await db.user.findUnique({
    where: { clerkUserId: userId, role: "DOCTOR", verificationStatus: "VERIFIED" },
    select: { id: true },
  });
  if (!doctor) throw new Error("Not authorized");
  const payout = await db.payout.findFirst({
    where: { id: payoutId, doctorId: doctor.id },
    select: { id: true, status: true, reviewRequiredAt: true },
  });
  if (!payout) throw new Error("Payout request not found");
  if (payout.reviewRequiredAt) throw new Error("An administrator must resolve the transfer outcome before this payout can be cancelled");
  if (payout.status === "FAILED") return { success: true, alreadyCancelled: true };
  if (payout.status !== "PROCESSING") throw new Error("A transferred payout cannot be cancelled");
  await db.$transaction(async (tx) => {
    await releasePaymentPayoutAllocations(tx, payout.id, { processedBy: doctor.id });
  }, { isolationLevel: "Serializable" });
  revalidatePath("/doctor");
  revalidatePath("/admin");
  return { success: true };
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

    return { payouts: payouts.map(payoutDto) };
  } catch (error) {
    throw new Error("Failed to fetch payouts. Please try again.");
  }
}

/**
 * Get doctor's earnings summary
 */
export async function getDoctorEarnings() {
  const { userId } = await measureServerTiming("doctorEarnings.auth", () => auth());

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const doctor = await measureServerTiming("doctorEarnings.doctorLookup", () => db.user.findFirst({
      where: {
        clerkUserId: userId,
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
      select: { id: true },
    }));

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    // Get all completed appointments for this doctor
    const [completedAppointments, collectedPayments, availablePayments, reservedAllocations, paidAllocations] = await Promise.all([
      measureServerTiming("doctorEarnings.completedAppointmentsQuery", () =>
        db.appointment.count({ where: { doctorId: doctor.id, status: "COMPLETED" } })
      ),
      measureServerTiming("doctorEarnings.collectedPaymentsQuery", () => db.appointmentPayment.findMany({
        where: { ...eligiblePaymentWhere(doctor.id) },
        select: { id: true, amountPaise: true },
      })),
      measureServerTiming("doctorEarnings.availablePaymentsQuery", () => db.appointmentPayment.findMany({
        where: {
          ...eligiblePaymentWhere(doctor.id),
          payoutAllocations: { none: { status: { in: ["RESERVED", "PAID"] } } },
        },
        select: { id: true, amountPaise: true },
      })),
      measureServerTiming("doctorEarnings.reservedAllocationsQuery", () =>
        db.payoutPaymentAllocation.findMany({ where: { payout: { doctorId: doctor.id }, status: "RESERVED" }, select: { amountPaise: true } })
      ),
      measureServerTiming("doctorEarnings.paidAllocationsQuery", () =>
        db.payoutPaymentAllocation.findMany({ where: { payout: { doctorId: doctor.id }, status: "PAID" }, select: { amountPaise: true } })
      ),
    ]);
    const sumPayments = (payments) => payments.reduce((sum, payment) => sum + BigInt(payment.amountPaise), 0n);
    const collectedPaise = sumPayments(collectedPayments);
    const availablePaise = sumPayments(availablePayments);
    const reservedPaise = sumAllocationPaise(reservedAllocations);
    const paidOutPaise = sumAllocationPaise(paidAllocations);

    return {
      earnings: {
        completedAppointments,
        paymentCollections: {
          currency: "INR",
          collectedPaise: collectedPaise.toString(),
          availablePaise: availablePaise.toString(),
          reservedPaise: reservedPaise.toString(),
          paidOutPaise: paidOutPaise.toString(),
        },
      },
    };
  } catch (error) {
    throw new Error("Failed to fetch doctor earnings. Please try again.");
  }
}
