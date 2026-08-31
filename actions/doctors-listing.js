"use server";

import { db } from "@/lib/prisma";
import { getAvailableTimeSlots } from "./appointments";
import { resolveDoctorPublicNames } from "@/lib/doctor-name";

const publicDoctorSelect = {
  id: true,
  clerkUserId: true,
  name: true,
  imageUrl: true,
  specialty: true,
  experience: true,
  description: true,
  city: true,
  state: true,
  country: true,
};

/**
 * Get doctors by specialty
 */
export async function getDoctorsBySpecialty(specialty) {
  try {
    const doctors = await db.user.findMany({
      where: {
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
        specialty: specialty.split("%20").join(" "),
      },
      orderBy: {
        name: "asc",
      },
      select: publicDoctorSelect,
    });

    return { doctors: await resolveDoctorPublicNames(doctors) };
  } catch (error) {
    console.error("Failed to fetch doctors by specialty:", error);
    return { error: "Failed to fetch doctors" };
  }
}

export async function searchDoctors({ query = "", specialty = "", city = "", state = "", country = "", minExperience, maxExperience, availableToday = false, sortBy = "name" } = {}) {
  const normalizedSpecialty = decodeURIComponent(specialty || "").trim();
  const normalizedCity = String(city || "").trim();
  const normalizedState = String(state || "").trim();
  const normalizedCountry = String(country || "").trim();
  const normalizedQuery = String(query || "").trim();
  const doctors = await db.user.findMany({
    where: {
      role: "DOCTOR",
      verificationStatus: "VERIFIED",
      ...(normalizedSpecialty ? { specialty: normalizedSpecialty } : {}),
      ...(normalizedCity ? { city: { equals: normalizedCity, mode: "insensitive" } } : {}),
      ...(normalizedState ? { state: { equals: normalizedState, mode: "insensitive" } } : {}),
      ...(normalizedCountry ? { country: { equals: normalizedCountry, mode: "insensitive" } } : {}),
      ...(normalizedQuery ? { OR: [{ name: { contains: normalizedQuery, mode: "insensitive" } }, { specialty: { contains: normalizedQuery, mode: "insensitive" } }, { city: { contains: normalizedQuery, mode: "insensitive" } }, { state: { contains: normalizedQuery, mode: "insensitive" } }, { country: { contains: normalizedQuery, mode: "insensitive" } }] } : {}),
      ...(Number.isFinite(Number(minExperience)) ? { experience: { gte: Number(minExperience) } } : {}),
      ...(Number.isFinite(Number(maxExperience)) ? { experience: { lte: Number(maxExperience) } } : {}),
    },
    orderBy: sortBy === "experience" ? { experience: "desc" } : { name: "asc" },
    select: publicDoctorSelect,
  });
  if (!availableToday) return { doctors: await resolveDoctorPublicNames(doctors) };
  const today = new Date().toISOString();
  const available = await Promise.all(doctors.map(async (doctor) => {
    const result = await getAvailableTimeSlots(doctor.id, today);
    return result.days[0]?.slots.length ? doctor : null;
  }));
  return { doctors: await resolveDoctorPublicNames(available.filter(Boolean)) };
}
