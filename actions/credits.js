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

const PLAN_PRIORITY = ["premium", "standard", "free_user"];

function getEntitledPlan(has) {
  return PLAN_PRIORITY.find((plan) => has({ plan })) || null;
}

/** Read the authenticated patient's current Clerk plan entitlement server-side. */
export async function getMyCreditPlan() {
  const { userId, has } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    select: { role: true },
  });
  if (!user) throw new Error("User not found");
  if (user.role !== "PATIENT") return { plan: null, monthlyCredits: null };

  const plan = getEntitledPlan(has);
  return {
    plan,
    monthlyCredits: plan ? PLAN_CREDITS[plan] : null,
  };
}


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

    // Plan entitlement comes from Clerk; the balance and grant ledger stay in Prisma.
    const { has } = await auth();
    const currentPlan = getEntitledPlan(has);
    const creditsToAllocate = currentPlan ? PLAN_CREDITS[currentPlan] : 0;

    // If user doesn't have any plan, just return the user
    if (!currentPlan) {
      return user;
    }

    const billingMonth = new Date().toISOString().slice(0, 7);
    const allocationKey = `${user.id}:monthly:${billingMonth}`;
    const previousPlanAllocationKeys = Object.keys(PLAN_CREDITS).map(
      (plan) => `${user.id}:${plan}:${billingMonth}`
    );
    const updatedUser = await db.$transaction(async (tx) => {
      // Respect allocations made earlier this month with the former plan-specific key.
      const previousAllocation = await tx.creditTransaction.findFirst({
        where: {
          userId: user.id,
          type: "CREDIT_PURCHASE",
          allocationKey: { in: previousPlanAllocationKeys },
        },
      });
      if (previousAllocation) return user;

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
