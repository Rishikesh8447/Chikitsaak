"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

// Define credit allocations per plan
const PLAN_CREDITS = {
  free_user: 0, // Basic plan: 2 credits
  standard: 10, // Standard plan: 10 credits per month
  premium: 24, // Premium plan: 24 credits per month
};


/**
 * Checks user's subscription and allocates monthly credits if needed
 * This should be called on app initialization (e.g., in a layout component)
 */
export async function checkAndAllocateCredits() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return null;
    const user = await db.user.findUnique({ where: { clerkUserId } });
    if (!user) return null;

    // Only allocate credits for patients
    if (user.role !== "PATIENT") {
      return user;
    }

    // Check if user has a subscription
    const { has } = await auth();

    // Check which plan the user has
    const hasBasic = has({ plan: "free_user" });
    const hasStandard = has({ plan: "standard" });
    const hasPremium = has({ plan: "premium" });

    let currentPlan = null;
    let creditsToAllocate = 0;

    if (hasPremium) {
      currentPlan = "premium";
      creditsToAllocate = PLAN_CREDITS.premium;
    } else if (hasStandard) {
      currentPlan = "standard";
      creditsToAllocate = PLAN_CREDITS.standard;
    } else if (hasBasic) {
      currentPlan = "free_user";
      creditsToAllocate = PLAN_CREDITS.free_user;
    }

    // If user doesn't have any plan, just return the user
    if (!currentPlan) {
      return user;
    }

    const allocationKey = `${user.id}:${currentPlan}:${new Date().toISOString().slice(0, 7)}`;
    const updatedUser = await db.$transaction(async (tx) => {
      const allocation = await tx.creditTransaction.createMany({
        data: [{ userId: user.id, amount: creditsToAllocate, type: "CREDIT_PURCHASE", packageId: currentPlan, allocationKey }],
        skipDuplicates: true,
      });
      if (allocation.count === 0) return user;

      // Update user's credit balance
      const updatedUser = await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          credits: {
            increment: creditsToAllocate,
          },
        },
      });

      return updatedUser;
    });

    // Revalidate relevant paths to reflect updated credit balance
    revalidatePath("/doctors");
    revalidatePath("/appointments");

    return updatedUser;
  } catch (error) {
    console.error(
      "Failed to check subscription and allocate credits:",
      error.message
    );
    return null;
  }
}

/** Return only the authenticated user's credit ledger. */
export async function getMyCreditTransactions() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Unauthorized");
  const user = await db.user.findUnique({ where: { clerkUserId }, select: { id: true, role: true, credits: true } });
  if (!user) throw new Error("User not found");
  const transactions = await db.creditTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, amount: true, type: true, packageId: true, createdAt: true },
  });
  return { balance: user.credits, transactions };
}
