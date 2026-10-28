"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

/**
 * Get dashboard summary data for the authenticated patient
 */
export async function getPatientDashboardSummary() {
  const { userId } = await auth();
  if (!userId) {
    return { user: null, nextAppointment: null, recentPrescriptions: [], recentLabOrders: [] };
  }

  try {
    const user = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "PATIENT",
      },
      select: {
        id: true,
        name: true,
        email: true,
        bloodGroup: true,
        allergies: true,
        existingConditions: true,
        currentMedications: true,
      },
    });

    if (!user) {
      return { user: null, nextAppointment: null, recentPrescriptions: [], recentLabOrders: [] };
    }

    const now = new Date();

    const [nextAppointment, recentPrescriptions, recentLabOrders] = await Promise.all([
      db.appointment.findFirst({
        where: {
          patientId: user.id,
          startTime: { gte: now },
          status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "PAYMENT_PENDING"] },
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          consultationMode: true,
          videoSessionId: true,
          payment: {
            select: {
              method: true,
              status: true,
              amountRupees: true,
            },
          },
          doctor: {
            select: {
              id: true,
              name: true,
              specialty: true,
              imageUrl: true,
            },
          },
        },
        orderBy: { startTime: "asc" },
      }),
      db.prescription.findMany({
        where: { patientId: user.id },
        select: {
          id: true,
          diagnosis: true,
          createdAt: true,
          followUpRequired: true,
          followUpDays: true,
          doctor: { select: { name: true, specialty: true } },
          medicines: { select: { id: true, name: true, dosage: true, frequency: true, duration: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      db.labOrder.findMany({
        where: { patientId: user.id },
        select: {
          id: true,
          status: true,
          createdAt: true,
          items: { select: { id: true, testName: true } },
          laboratory: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

    return {
      user,
      nextAppointment,
      recentPrescriptions,
      recentLabOrders,
    };
  } catch (error) {
    console.error("Failed to load patient dashboard summary:", error);
    return { user: null, nextAppointment: null, recentPrescriptions: [], recentLabOrders: [] };
  }
}
