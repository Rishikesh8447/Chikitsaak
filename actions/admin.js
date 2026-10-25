"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { flagPaymentPayoutsForReview, releasePaymentPayoutAllocations, recordPaymentPayoutTransfer } from "@/lib/payment-payouts.mjs";

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
    const errorName = error instanceof Error ? error.name : "UnknownError";
    const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "Unavailable";
    console.error("Failed to verify admin.", { errorName, errorCode });
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
        status: true,
        createdAt: true,
        currency: true,
        amountPaise: true,
        platformFeePaise: true,
        netAmountPaise: true,
        reviewRequiredAt: true,
        reviewReason: true,
        doctor: {
          select: {
            id: true,
            clerkUserId: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const paymentPayoutIssues = await db.payout.findMany({
      where: { status: "PROCESSED", reviewRequiredAt: { not: null } },
      select: {
        id: true,
        currency: true,
        netAmountPaise: true,
        transferReference: true,
        reviewRequiredAt: true,
        reviewReason: true,
        processedAt: true,
        doctor: { select: { id: true, clerkUserId: true, name: true, email: true, specialty: true } },
      },
      orderBy: { reviewRequiredAt: "desc" },
    });

    const payoutsWithNames = await hydratePayoutDoctorNames(pendingPayouts);
    const payoutIssuesWithNames = await hydratePayoutDoctorNames(paymentPayoutIssues);
    return {
      payouts: payoutsWithNames.map(({ doctor, ...payout }) => ({
        ...payout,
        amountPaise: payout.amountPaise?.toString() ?? null,
        platformFeePaise: payout.platformFeePaise?.toString() ?? null,
        netAmountPaise: payout.netAmountPaise?.toString() ?? null,
        doctor: serializeDoctorForAdmin(doctor),
      })),
      paymentPayoutIssues: payoutIssuesWithNames.map(({ doctor, ...payout }) => ({
        ...payout,
        netAmountPaise: payout.netAmountPaise?.toString() ?? null,
        doctor: serializeDoctorForAdmin(doctor),
      })),
    };
  } catch (error) {
    console.error("Failed to fetch pending payouts.");
    throw new Error("Failed to fetch pending payouts");
  }
}

/** Resolve a payment payout only after an administrator confirms the manual transfer outcome. */
export async function resolvePaymentPayoutOutcomeAction(formData) {
  const admin = await getPersistedAdmin();
  const payoutId = formData.get("payoutId");
  const resolution = formData.get("resolution");
  if (typeof payoutId !== "string" || !payoutId) throw new Error("Payout ID is required");
  if (resolution !== "NOT_SENT" && resolution !== "TRANSFER_SENT") throw new Error("Confirm whether the transfer was sent");
  if (resolution === "NOT_SENT" && formData.get("transferNotSentConfirmed") !== "true") {
    throw new Error("Confirm that no transfer occurred before releasing the reservation");
  }
  const transferReference = formData.get("transferReference");
  if (resolution === "TRANSFER_SENT") {
    if (formData.get("transferConfirmed") !== "true") throw new Error("Confirm that the manual transfer has already completed");
    if (typeof transferReference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{2,199}$/.test(transferReference.trim())) {
      throw new Error("A valid manual transfer reference is required");
    }
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const payout = await tx.payout.findFirst({
        where: { id: payoutId },
        include: { doctor: { select: { id: true, role: true } } },
      });
      if (!payout || payout.doctor?.role !== "DOCTOR" || payout.doctor.id === admin.id) {
        throw new Error("Payout request is invalid");
      }

      if (resolution === "NOT_SENT") {
        if (payout.status === "FAILED") {
          const allocations = await tx.payoutPaymentAllocation.findMany({
            where: { payoutId, status: { in: ["RESERVED", "RELEASED", "PAID"] } },
            select: { status: true, activePaymentId: true },
          });
          if (allocations.length && allocations.every((allocation) => allocation.status === "RELEASED" && allocation.activePaymentId === null)) {
            return { alreadyResolved: true };
          }
        }
        if (payout.status !== "PROCESSING") throw new Error("Payment payout is no longer pending");
        await releasePaymentPayoutAllocations(tx, payout.id, {
          processedBy: admin.id,
          allowReviewRelease: Boolean(payout.reviewRequiredAt),
        });
        await tx.notification.createMany({ data: [{ userId: payout.doctorId, type: "PAYOUT_STATUS", title: "Payout request declined", message: "An administrator confirmed that no manual transfer occurred; reserved collections were released.", dedupeKey: `payout:${payout.id}:declined` }], skipDuplicates: true });
        return { alreadyResolved: false };
      }

      await recordPaymentPayoutTransfer(tx, {
        payout,
        adminId: admin.id,
        transferReference: transferReference.trim(),
        allowReviewRequired: Boolean(payout.reviewRequiredAt),
      });
      await tx.notification.createMany({ data: [{ userId: payout.doctorId, type: "PAYOUT_STATUS", title: "INR payout recorded", message: "An administrator recorded the confirmed manual transfer for your INR payout.", dedupeKey: `payout:${payout.id}:manual-transfer-recorded` }], skipDuplicates: true });
      return { alreadyResolved: payout.status === "PROCESSED" };
    }, { isolationLevel: "Serializable" });
    revalidatePath("/admin");
    revalidatePath("/doctor");
    return { success: true, ...result };
  } catch (error) {
    if (error instanceof Error && [
      "Unauthorized", "Payout ID is required", "Payout request is invalid", "Payment payout is no longer pending",
      "Confirm that no transfer occurred before releasing the reservation", "Confirm that the manual transfer has already completed",
      "A valid manual transfer reference is required", "Payout requires explicit refund-review resolution", "Payout is not flagged for refund review",
      "Payout allocations are no longer eligible", "Payout allocation total does not match the reserved amount",
      "Payout changed before transfer confirmation was recorded", "Payout allocations changed before transfer confirmation was recorded",
    ].includes(error.message)) throw error;
    throw new Error("Unable to resolve the payment payout. Confirm its transfer outcome and current state before retrying.");
  }
}

/** Record an externally completed manual transfer; this action never initiates a transfer. */
export async function recordPaymentPayoutTransferAction(formData) {
  const { userId } = await auth();
  if (!userId || !(await verifyAdmin())) throw new Error("Unauthorized");
  const payoutId = formData.get("payoutId");
  const transferReference = formData.get("transferReference");
  const transferConfirmed = formData.get("transferConfirmed");
  if (typeof payoutId !== "string" || !payoutId) throw new Error("Payout ID is required");
  if (transferConfirmed !== "true") throw new Error("Confirm the manual transfer before recording it");
  if (typeof transferReference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{2,199}$/.test(transferReference.trim())) {
    throw new Error("A valid manual transfer reference is required");
  }
  const admin = await db.user.findUnique({ where: { clerkUserId: userId }, select: { id: true, role: true } });
  if (admin?.role !== "ADMIN") throw new Error("Unauthorized");
  const reference = transferReference.trim();
  try {
    await db.$transaction(async (tx) => {
      const payout = await tx.payout.findFirst({ where: { id: payoutId }, include: { doctor: { select: { id: true, role: true } } } });
      if (payout?.doctor?.role !== "DOCTOR" || payout.doctor.id === admin.id) throw new Error("Payout request is invalid");
      await recordPaymentPayoutTransfer(tx, { payout, adminId: admin.id, transferReference: reference });
      await tx.notification.createMany({ data: [{ userId: payout.doctorId, type: "PAYOUT_STATUS", title: "INR payout recorded", message: "An administrator recorded the confirmed manual transfer for your INR payout.", dedupeKey: `payout:${payout.id}:manual-transfer-recorded` }], skipDuplicates: true });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Error && ["Payout request is invalid", "Payment payout is no longer pending", "Payout requires manual refund review before transfer", "Payout allocations are no longer eligible", "Payout allocation total does not match the reserved amount", "Payout changed before transfer confirmation was recorded", "Payout allocations changed before transfer confirmation was recorded"].includes(error.message)) throw error;
    throw new Error("Unable to record the manual transfer. Confirm its reference and payout state before retrying.");
  }
  revalidatePath("/admin");
  revalidatePath("/doctor");
  return { success: true };
}

async function getPersistedAdmin() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const admin = await db.user.findUnique({ where: { clerkUserId: userId }, select: { id: true, role: true } });
  if (admin?.role !== "ADMIN") throw new Error("Unauthorized");
  return admin;
}

/** Return only the information needed by the admin refund-review queue. */
export async function getAppointmentRefundReviews() {
  await getPersistedAdmin();
  try {
    const payments = await db.appointmentPayment.findMany({
      where: { refundStatus: "REVIEW_REQUIRED" },
      include: {
        appointment: { select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          patient: { select: { name: true } },
          doctor: { select: { name: true } },
        } },
        webhookEvents: { where: { status: "REVIEW_REQUIRED" }, select: {
          razorpayPaymentId: true,
          amountPaise: true,
          currency: true,
          receivedAt: true,
        } },
      },
      orderBy: { createdAt: "asc" },
    });
    return { reviews: payments.map((payment) => ({
      id: payment.id,
      amountRupees: payment.amountRupees,
      currency: payment.currency,
      razorpayPaymentId: payment.razorpayPaymentId,
      createdAt: payment.createdAt,
      appointment: payment.appointment,
      capturedEvents: payment.webhookEvents || [],
    })) };
  } catch {
    throw new Error("Failed to fetch appointment refund reviews");
  }
}

/** Record one durable admin approval or rejection; this does not issue a provider refund. */
export async function decideAppointmentRefundReview(formData) {
  const admin = await getPersistedAdmin();
  const paymentId = formData.get("paymentId");
  const decision = formData.get("decision");
  const note = formData.get("note");
  if (typeof paymentId !== "string" || !paymentId || !["APPROVED", "REJECTED"].includes(decision)) {
    throw new Error("Invalid refund review decision");
  }
  if (typeof note !== "string" || note.trim().length < 3 || note.trim().length > 2000) {
    throw new Error("Add an audit note between 3 and 2,000 characters");
  }

  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.appointmentPayment.updateMany({
        where: { id: paymentId, refundStatus: "REVIEW_REQUIRED" },
        data: { refundStatus: decision },
      });
      if (changed.count !== 1) throw new Error("Refund review was already decided or is unavailable");
      await flagPaymentPayoutsForReview(tx, paymentId, `Refund review decision recorded: ${decision}`);
      await tx.appointmentRefundDecision.create({ data: {
        paymentId,
        adminUserId: admin.id,
        decision,
        note: note.trim(),
      } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Error && error.message === "Refund review was already decided or is unavailable") throw error;
    throw new Error("Failed to record refund decision");
  }
  revalidatePath("/admin");
  return { success: true, decision };
}
