"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

// Define credit allocations per plan
const PLAN_CREDITS = {
  free_user: 0, // The initial two-credit grant is separate from monthly plan allocation.
  standard: 10, // Standard plan: 10 credits per month
  premium: 24, // Premium plan: 24 credits per month
};

const PLAN_PRIORITY = ["premium", "standard", "free_user"];

function getEntitledPlan(has) {
  if (typeof has !== "function") return null;
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

  let plan;
  try {
    plan = getEntitledPlan(has);
  } catch {
    return {
      plan: null,
      monthlyCredits: null,
      error: "We couldn't verify your Clerk subscription. Refresh this page to try again.",
    };
  }
  return {
    plan,
    monthlyCredits: plan ? PLAN_CREDITS[plan] : null,
    ...(!plan ? { error: "Clerk has not confirmed a supported credit plan yet." } : {}),
  };
}


/**
 * Checks user's subscription and allocates monthly credits if needed
 * This should be called on app initialization (e.g., in a layout component)
 */
export async function checkAndAllocateCredits() {
  try {
    const { userId: clerkUserId, has } = await auth();
    if (!clerkUserId) {
      return { success: false, code: "UNAUTHENTICATED", message: "Sign in to sync your credits." };
    }
    const user = await db.user.findUnique({ where: { clerkUserId } });
    if (!user) {
      return { success: false, code: "USER_NOT_FOUND", message: "Your account could not be found. Please try again." };
    }

    // Only allocate credits for patients
    if (user.role !== "PATIENT") {
      return { success: true, allocated: false, balance: user.credits, plan: null };
    }

    // Plan entitlement comes from Clerk; the balance and grant ledger stay in Prisma.
    if (typeof has !== "function") {
      return {
        success: false,
        code: "PLAN_LOOKUP_UNAVAILABLE",
        message: "We couldn't verify your Clerk subscription. Refresh this page to try again.",
      };
    }
    let currentPlan;
    try {
      currentPlan = getEntitledPlan(has);
    } catch {
      return {
        success: false,
        code: "PLAN_LOOKUP_FAILED",
        message: "We couldn't verify your Clerk subscription. Refresh this page to try again.",
      };
    }
    const creditsToAllocate = currentPlan ? PLAN_CREDITS[currentPlan] : 0;

    // Do not silently report success when Billing has no matching configured plan.
    if (!currentPlan) {
      return {
        success: false,
        code: "PLAN_NOT_RESOLVED",
        message: "Clerk has not confirmed a supported credit plan yet. Refresh this page after subscription completes.",
      };
    }

    const billingMonth = new Date().toISOString().slice(0, 7);
    const allocationKey = `${user.id}:monthly:${billingMonth}`;
    const previousPlanAllocationKeys = Object.keys(PLAN_CREDITS).map(
      (plan) => `${user.id}:${plan}:${billingMonth}`
    );
    const allocated = await db.$transaction(async (tx) => {
      // Respect allocations made earlier this month with the former plan-specific key.
      const previousAllocation = await tx.creditTransaction.findFirst({
        where: {
          userId: user.id,
          type: "CREDIT_PURCHASE",
          allocationKey: { in: previousPlanAllocationKeys },
        },
      });
      if (previousAllocation) return false;

      const allocation = await tx.creditTransaction.createMany({
        data: [{ userId: user.id, amount: creditsToAllocate, type: "CREDIT_PURCHASE", packageId: currentPlan, allocationKey }],
        skipDuplicates: true,
      });
      if (allocation.count === 0) return false;

      // Update user's credit balance
      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          credits: {
            increment: creditsToAllocate,
          },
        },
      });

      return true;
    });

    const currentUser = await db.user.findUnique({
      where: { id: user.id },
      select: { credits: true },
    });

    // Revalidate views that display the current Prisma credit balance.
    revalidatePath("/credits");
    revalidatePath("/doctors");
    revalidatePath("/appointments");

    return {
      success: true,
      allocated,
      plan: currentPlan,
      monthlyCredits: creditsToAllocate,
      balance: currentUser?.credits ?? user.credits,
    };
  } catch (error) {
    console.error(
      "Failed to check subscription and allocate credits:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return {
      success: false,
      code: "ALLOCATION_FAILED",
      message: "We couldn't sync your subscription credits. Refresh this page to try again.",
    };
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
