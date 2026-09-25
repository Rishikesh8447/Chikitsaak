"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

async function getClerkDisplayName(clerkUserId, fallbackName) {
  if (!clerkUserId) {
    return fallbackName;
  }

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(clerkUserId);
    const displayName = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return displayName || fallbackName;
  } catch (error) {
    console.error("Failed to resolve Clerk display name:", error);
    return fallbackName;
  }
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
    console.error("Failed to verify admin:", error);
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
      orderBy: {
        createdAt: "desc",
      },
    });

    return { doctors: await hydrateDoctorNames(pendingDoctors) };
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
      orderBy: {
        name: "asc",
      },
    });

    return { doctors: await hydrateDoctorNames(verifiedDoctors) };
  } catch (error) {
    console.error("Failed to get verified doctors:", error);
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
    await db.user.update({
      where: {
        id: doctorId,
      },
      data: {
        verificationStatus: status,
      },
    });
    await db.notification.createMany({ data: [{ userId: doctorId, type: "DOCTOR_VERIFICATION", title: "Doctor verification updated", message: `Your doctor verification status is now ${status.toLowerCase()}.`, dedupeKey: `doctor:${doctorId}:verification:${status}` }], skipDuplicates: true });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Failed to update doctor status:", error);
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

    await db.user.update({
      where: {
        id: doctorId,
      },
      data: {
        verificationStatus: status,
      },
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Failed to update doctor active status:", error);
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
      include: {
        doctor: {
          select: {
            id: true,
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

    return { payouts: await hydratePayoutDoctorNames(pendingPayouts) };
  } catch (error) {
    console.error("Failed to fetch pending payouts:", error);
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
    });

    await db.$transaction(async (tx) => {
      const payout = await tx.payout.findFirst({ where: { id: payoutId, status: "PROCESSING" }, include: { doctor: true } });
      if (!payout) throw new Error("Payout request not found or already processed");
      // Update payout status to PROCESSED
      const reserved = await tx.user.updateMany({ where: { id: payout.doctorId, credits: { gte: payout.credits } }, data: { credits: { decrement: payout.credits } } });
      if (reserved.count !== 1) throw new Error("Doctor does not have enough available credits");
      await tx.payout.update({ where: { id: payoutId }, data: { status: "PROCESSED", processedAt: new Date(), processedBy: admin?.id || "unknown" } });
      await tx.notification.createMany({ data: [{ userId: payout.doctorId, type: "PAYOUT_STATUS", title: "Payout status updated", message: "Your payout request was processed by an administrator.", dedupeKey: `payout:${payout.id}:processed` }], skipDuplicates: true });

      // Deduct credits from doctor's account
      // Create a transaction record for the deduction
      await tx.creditTransaction.create({
        data: {
          userId: payout.doctorId,
          amount: -payout.credits,
          type: "ADMIN_ADJUSTMENT",
        },
      });
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    console.error("Failed to approve payout:", error);
    throw new Error("Failed to approve payout. Please try again.");
  }
}
