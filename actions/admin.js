"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const ADMIN_DOCTOR_REVIEW_SELECT = {
  id: true,
  clerkUserId: true,
  name: true,
  email: true,
  createdAt: true,
  specialty: true,
  experience: true,
  credentialUrl: true,
  description: true,
};

const ADMIN_VERIFIED_DOCTOR_SELECT = {
  id: true,
  clerkUserId: true,
  name: true,
  email: true,
  specialty: true,
  experience: true,
  verificationStatus: true,
};

function serializeDoctorForAdmin(doctor) {
  const { clerkUserId, ...publicFields } = doctor;
  return publicFields;
}

function hasValidPayoutDetails(payout) {
  return Number.isSafeInteger(payout?.credits) && payout.credits > 0 &&
    payout.amount === payout.credits * 10 &&
    payout.platformFee === payout.credits * 2 &&
    payout.netAmount === payout.credits * 8 &&
    typeof payout.paypalEmail === "string" &&
    payout.paypalEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payout.paypalEmail);
}

function hasValidReservation(reservation, payout) {
  return reservation.userId === payout.doctorId &&
    reservation.amount === -payout.credits &&
    reservation.type === "ADMIN_ADJUSTMENT";
}

async function getClerkDisplayName(clerkUserId, fallbackName) {
  const databaseName = normalizeDoctorName(fallbackName);

  if (!clerkUserId) {
    return databaseName;
  }

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    const displayName = [clerkUser.firstName, clerkUser.lastName]
      .map(normalizeDoctorName)
      .filter(Boolean)
      .join(" ")
      .trim();

    return displayName || databaseName;
  } catch (error) {
    console.error("Failed to resolve Clerk display name.");
    return databaseName;
  }
}

function normalizeDoctorName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && !/^(null|undefined)(\s+(null|undefined))*$/i.test(name)
    ? name
    : null;
}

async function hydrateDoctorNames(doctors) {
  return Promise.all(
    doctors.map(async (doctor) => ({
      ...doctor,
      name: await getClerkDisplayName(doctor.clerkUserId, doctor.name),
    }))
  );
}

async function hydratePayoutDoctorNames(payouts) {
  return Promise.all(
    payouts.map(async (payout) => ({
      ...payout,
      doctor: {
        ...payout.doctor,
        name: await getClerkDisplayName(
          payout.doctor.clerkUserId,
          payout.doctor.name
        ),
      },
    }))
  );
}

/**
 * Verifies if current user has admin role
 */
export async function verifyAdmin() {
  const { userId } = await auth();

  if (!userId) {
    return false;
  }

  try {
    const user = await db.user.findUnique({
      where: {
        clerkUserId: userId,
      },
    });

    return user?.role === "ADMIN";
  } catch (error) {
    console.error("Failed to verify admin.");
    return false;
  }
}

/**
 * Gets all doctors with pending verification
 */
export async function getPendingDoctors() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  try {
    const pendingDoctors = await db.user.findMany({
      where: {
        role: "DOCTOR",
        verificationStatus: "PENDING",
      },
      select: ADMIN_DOCTOR_REVIEW_SELECT,
      orderBy: {
        createdAt: "desc",
      },
    });

    const doctorsWithNames = await hydrateDoctorNames(pendingDoctors);
    return { doctors: doctorsWithNames.map(serializeDoctorForAdmin) };
  } catch (error) {
    throw new Error("Failed to fetch pending doctors");
  }
}

/**
 * Gets all verified doctors
 */
export async function getVerifiedDoctors() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  try {
    const verifiedDoctors = await db.user.findMany({
      where: {
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
      },
      select: ADMIN_VERIFIED_DOCTOR_SELECT,
      orderBy: {
        name: "asc",
      },
    });

    const doctorsWithNames = await hydrateDoctorNames(verifiedDoctors);
    return { doctors: doctorsWithNames.map(serializeDoctorForAdmin) };
  } catch (error) {
    console.error("Failed to fetch verified doctors.");
    return { error: "Failed to fetch verified doctors" };
  }
}

/**
 * Updates a doctor's verification status
 */
export async function updateDoctorStatus(formData) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const doctorId = formData.get("doctorId");
  const status = formData.get("status");

  if (!doctorId || !["VERIFIED", "REJECTED"].includes(status)) {
    throw new Error("Invalid input");
  }

  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: doctorId,
          role: "DOCTOR",
          verificationStatus: "PENDING",
        },
        data: {
          verificationStatus: status,
        },
      });
      if (changed.count !== 1) throw new Error("Doctor is not awaiting verification");
      if (status === "REJECTED") await tx.notification.createMany({ data: [{ userId: doctorId, type: "DOCTOR_VERIFICATION", title: "Doctor verification updated", message: "Your doctor verification status is now rejected. Please update your profile and resubmit for review.", dedupeKey: `doctor:${doctorId}:verification:REJECTED` }], skipDuplicates: true });
      else await tx.notification.createMany({ data: [{ userId: doctorId, type: "DOCTOR_VERIFICATION", title: "Doctor verification updated", message: `Your doctor verification status is now ${status.toLowerCase()}.`, dedupeKey: `doctor:${doctorId}:verification:${status}` }], skipDuplicates: true });
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Failed to update doctor status.");
    if (error instanceof Error && error.message === "Doctor is not awaiting verification") throw error;
    throw new Error("Failed to update doctor status. Please try again.");
  }
}

/**
 * Suspends or reinstates a doctor
 */
export async function updateDoctorActiveStatus(formData) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const doctorId = formData.get("doctorId");
  const suspend = formData.get("suspend") === "true";

  if (!doctorId) {
    throw new Error("Doctor ID is required");
  }

  try {
    const status = suspend ? "PENDING" : "VERIFIED";

    const changed = await db.user.updateMany({
      where: {
        id: doctorId,
        role: "DOCTOR",
        verificationStatus: suspend ? "VERIFIED" : "PENDING",
      },
      data: {
        verificationStatus: status,
      },
    });
    if (changed.count !== 1) throw new Error("Doctor status could not be updated");

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Failed to update doctor active status.");
    throw new Error("Failed to update doctor status. Please try again.");
  }
}

/**
 * Gets all pending payouts that need admin approval
 */
export async function getPendingPayouts() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  try {
    const pendingPayouts = await db.payout.findMany({
      where: {
        status: "PROCESSING",
      },
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        credits: true,
        platformFee: true,
        netAmount: true,
        paypalEmail: true,
        doctor: {
          select: {
            id: true,
            clerkUserId: true,
            name: true,
            email: true,
            specialty: true,
            credits: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const payoutsWithNames = await hydratePayoutDoctorNames(pendingPayouts);
    return {
      payouts: payoutsWithNames.map(({ doctor, ...payout }) => ({
        ...payout,
        doctor: serializeDoctorForAdmin(doctor),
      })),
    };
  } catch (error) {
    console.error("Failed to fetch pending payouts.");
    throw new Error("Failed to fetch pending payouts");
  }
}

/**
 * Approves a payout request and deducts credits from doctor's account
 */
export async function approvePayout(formData) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) throw new Error("Unauthorized");

  const payoutId = formData.get("payoutId");

  if (!payoutId) {
    throw new Error("Payout ID is required");
  }

  try {
    // Get admin user info
    const { userId } = await auth();
    const admin = await db.user.findUnique({
      where: { clerkUserId: userId },
      select: { id: true, role: true },
    });
    if (admin?.role !== "ADMIN") throw new Error("Unauthorized");

    await db.$transaction(async (tx) => {
      const payout = await tx.payout.findFirst({
        where: { id: payoutId, status: "PROCESSING" },
        include: { doctor: { select: { id: true, role: true } } },
      });
      if (!payout) throw new Error("Payout request not found or already processed");
      if (
        payout.doctor?.role !== "DOCTOR" ||
        payout.doctor.id === admin.id ||
        !hasValidPayoutDetails(payout)
      ) throw new Error("Payout request is invalid");
      const reservation = await tx.creditTransaction.findUnique({ where: { allocationKey: `payout:${payout.id}:credit-reservation` } });
      if (reservation && !hasValidReservation(reservation, payout)) {
        throw new Error("Payout reservation is invalid");
      }
      if (!reservation) {
        const legacyDebit = await tx.user.updateMany({ where: { id: payout.doctorId, credits: { gte: payout.credits } }, data: { credits: { decrement: payout.credits } } });
        if (legacyDebit.count !== 1) throw new Error("Doctor does not have enough available credits");
        await tx.creditTransaction.create({ data: { userId: payout.doctorId, amount: -payout.credits, type: "ADMIN_ADJUSTMENT", allocationKey: `payout:${payout.id}:reserved-credit-debit` } });
      }
      const changed = await tx.payout.updateMany({ where: { id: payoutId, status: "PROCESSING" }, data: { status: "PROCESSED", processedAt: new Date(), processedBy: admin?.id || "unknown" } });
      if (changed.count !== 1) throw new Error("Payout request not found or already processed");
      await tx.notification.createMany({ data: [{ userId: payout.doctorId, type: "PAYOUT_STATUS", title: "Payout status updated", message: "Your payout request was processed by an administrator.", dedupeKey: `payout:${payout.id}:processed` }], skipDuplicates: true });
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Failed to approve payout.");
    throw new Error("Failed to approve payout. Please try again.");
  }
}

/** Reject a payout and release its reserved credits back to the doctor's balance. */
export async function rejectPayout(formData) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) throw new Error("Unauthorized");
  const payoutId = formData.get("payoutId");
  if (typeof payoutId !== "string" || !payoutId) throw new Error("Payout ID is required");
  const { userId } = await auth();
  try {
    const admin = await db.user.findUnique({ where: { clerkUserId: userId }, select: { id: true, role: true } });
    if (admin?.role !== "ADMIN") throw new Error("Unauthorized");
    await db.$transaction(async (tx) => {
      const payout = await tx.payout.findFirst({
        where: { id: payoutId, status: "PROCESSING" },
        include: { doctor: { select: { id: true, role: true } } },
      });
      if (!payout) throw new Error("Payout request not found or already processed");
      if (payout.doctor?.role !== "DOCTOR" || payout.doctor.id === admin.id || !Number.isSafeInteger(payout.credits) || payout.credits <= 0) {
        throw new Error("Payout request is invalid");
      }
      const reservation = await tx.creditTransaction.findUnique({ where: { allocationKey: `payout:${payout.id}:credit-reservation` } });
      if (reservation && !hasValidReservation(reservation, payout)) {
        throw new Error("Payout reservation is invalid");
      }
      const changed = await tx.payout.updateMany({ where: { id: payout.id, status: "PROCESSING" }, data: { status: "FAILED", processedAt: new Date(), processedBy: admin.id } });
      if (changed.count !== 1) throw new Error("Payout request not found or already processed");
      if (reservation) {
        await tx.user.update({ where: { id: payout.doctorId }, data: { credits: { increment: payout.credits } } });
        await tx.creditTransaction.create({ data: { userId: payout.doctorId, amount: payout.credits, type: "ADMIN_ADJUSTMENT", allocationKey: `payout:${payout.id}:reserved-credit-release` } });
      }
      await tx.notification.createMany({ data: [{ userId: payout.doctorId, type: "PAYOUT_STATUS", title: "Payout request declined", message: "Your payout request was declined and its credits were returned to your balance.", dedupeKey: `payout:${payout.id}:declined` }], skipDuplicates: true });
    });
    revalidatePath("/admin");
    revalidatePath("/doctor");
    return { success: true };
  } catch (error) {
    console.error("Failed to reject payout.");
    if (error instanceof Error && ["Unauthorized", "Payout ID is required", "Payout request not found or already processed", "Payout request is invalid", "Payout reservation is invalid"].includes(error.message)) {
      throw error;
    }
    throw new Error("Failed to reject payout. Please try again.");
  }
}
