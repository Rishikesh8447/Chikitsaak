import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

/**
 * Get all appointments for the authenticated patient
 */
export async function getPatientAppointments() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const user = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "PATIENT",
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new Error("Patient not found");
    }

    const appointments = await db.appointment.findMany({
      where: {
        patientId: user.id,
      },
      select: {
        id: true,
        doctorId: true,
        startTime: true,
        endTime: true,
        status: true,
        checkoutExpiresAt: true,
        notes: true,
        patientDescription: true,
        consultationMode: true,
        originalAppointmentId: true,
        prescription: {
          select: {
            followUpRequired: true,
            followUpDays: true,
          },
        },
        followUpAppointment: {
          select: {
            id: true,
            status: true,
            startTime: true,
            endTime: true,
          },
        },
        payment: { select: { method: true, status: true, refundStatus: true, amountRupees: true, verifiedAt: true, cashCollection: { select: { collectedAt: true } } } },
        doctor: {
          select: {
            id: true,
            name: true,
            specialty: true,
            imageUrl: true,
          },
        },
        review: { select: { id: true, rating: true, comment: true } },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    return { appointments };
  } catch (error) {
    console.error("Failed to get patient appointments:", error);
    return { error: "Failed to fetch appointments" };
  }
}
