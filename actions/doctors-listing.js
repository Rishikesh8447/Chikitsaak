"use server";

import { db } from "@/lib/prisma";
import { addMinutes, endOfDay, format } from "date-fns";
import { resolveDoctorPublicNames } from "@/lib/doctor-name";
import { unstable_cache } from "next/cache";

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

function normalizeSpecialty(specialty) {
  if (typeof specialty !== "string") return "";
  try {
    return decodeURIComponent(specialty).split("%20").join(" ").trim();
  } catch {
    return specialty.split("%20").join(" ").trim();
  }
}

async function fetchAllVerifiedDoctors() {
  const doctors = await db.user.findMany({
    where: {
      role: "DOCTOR",
      verificationStatus: "VERIFIED",
    },
    orderBy: {
      name: "asc",
    },
    select: publicDoctorSelect,
  });

  return resolveDoctorPublicNames(doctors);
}

async function fetchVerifiedDoctorsBySpecialty(specialty) {
  const normalized = normalizeSpecialty(specialty);

  const doctors = await db.user.findMany({
    where: {
      role: "DOCTOR",
      verificationStatus: "VERIFIED",
      specialty: normalized,
    },
    orderBy: {
      name: "asc",
    },
    select: publicDoctorSelect,
  });

  return resolveDoctorPublicNames(doctors);
}

const getCachedAllDoctors = unstable_cache(
  async () => fetchAllVerifiedDoctors(),
  ["all-verified-doctors"],
  {
    revalidate: 60,
    tags: ["doctors-directory"],
  }
);

const getCachedDoctorsBySpecialty = unstable_cache(
  async (specialty) => fetchVerifiedDoctorsBySpecialty(specialty),
  ["doctors-by-specialty"],
  {
    revalidate: 60,
    tags: ["doctors-directory"],
  }
);

/**
 * Get doctors by specialty
 */
export async function getDoctorsBySpecialty(specialty) {
  try {
    const normalized = normalizeSpecialty(specialty);
    if (!normalized) {
      return { doctors: [] };
    }

    const doctors = await getCachedDoctorsBySpecialty(normalized);
    return { doctors };
  } catch (error) {
    console.error("Failed to fetch doctors by specialty:", error);
    return { error: "Failed to fetch doctors" };
  }
}

export async function searchDoctors({
  query = "",
  specialty = "",
  city = "",
  state = "",
  country = "",
  minExperience,
  maxExperience,
  availableToday = false,
  sortBy = "name",
} = {}) {
  try {
    const normalizedSpecialty = normalizeSpecialty(specialty);
    const normalizedCity = String(city || "").trim();
    const normalizedState = String(state || "").trim();
    const normalizedCountry = String(country || "").trim();
    const normalizedQuery = String(query || "").trim();

    const hasMinExp =
      minExperience !== "" &&
      minExperience !== null &&
      minExperience !== undefined &&
      Number.isFinite(Number(minExperience));
    const hasMaxExp =
      maxExperience !== "" &&
      maxExperience !== null &&
      maxExperience !== undefined &&
      Number.isFinite(Number(maxExperience));
    const isDefaultSort = !sortBy || sortBy === "name";

    const isDefaultAll =
      !normalizedQuery &&
      !normalizedSpecialty &&
      !normalizedCity &&
      !normalizedState &&
      !normalizedCountry &&
      !hasMinExp &&
      !hasMaxExp &&
      !availableToday &&
      isDefaultSort;

    if (isDefaultAll) {
      const doctors = await getCachedAllDoctors();
      return { doctors };
    }

    const isSpecialtyOnly =
      Boolean(normalizedSpecialty) &&
      !normalizedQuery &&
      !normalizedCity &&
      !normalizedState &&
      !normalizedCountry &&
      !hasMinExp &&
      !hasMaxExp &&
      !availableToday &&
      isDefaultSort;

    if (isSpecialtyOnly) {
      const doctors = await getCachedDoctorsBySpecialty(normalizedSpecialty);
      return { doctors };
    }

    const doctors = await db.user.findMany({
      where: {
        role: "DOCTOR",
        verificationStatus: "VERIFIED",
        ...(normalizedSpecialty ? { specialty: normalizedSpecialty } : {}),
        ...(normalizedCity ? { city: { equals: normalizedCity, mode: "insensitive" } } : {}),
        ...(normalizedState ? { state: { equals: normalizedState, mode: "insensitive" } } : {}),
        ...(normalizedCountry ? { country: { equals: normalizedCountry, mode: "insensitive" } } : {}),
        ...(normalizedQuery
          ? {
              OR: [
                { name: { contains: normalizedQuery, mode: "insensitive" } },
                { specialty: { contains: normalizedQuery, mode: "insensitive" } },
                { city: { contains: normalizedQuery, mode: "insensitive" } },
                { state: { contains: normalizedQuery, mode: "insensitive" } },
                { country: { contains: normalizedQuery, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(hasMinExp ? { experience: { gte: Number(minExperience) } } : {}),
        ...(hasMaxExp ? { experience: { lte: Number(maxExperience) } } : {}),
      },
      orderBy: sortBy === "experience" ? { experience: "desc" } : { name: "asc" },
      select: publicDoctorSelect,
    });

    if (!availableToday) return { doctors: await resolveDoctorPublicNames(doctors) };

    const now = new Date();
    const firstDay = new Date(now);
    firstDay.setHours(0, 0, 0, 0);
    const lastDay = endOfDay(firstDay);
    const doctorIds = doctors.map((doctor) => doctor.id);
    const [availability, appointments] = await Promise.all([
      db.availability.findMany({ where: { doctorId: { in: doctorIds }, status: "AVAILABLE" } }),
      db.appointment.findMany({
        where: {
          doctorId: { in: doctorIds },
          OR: [
            { status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] } },
            { status: "PAYMENT_PENDING", checkoutExpiresAt: { gt: now } },
          ],
          startTime: { lt: lastDay },
          endTime: { gt: firstDay },
        },
        select: { doctorId: true, startTime: true, endTime: true },
      }),
    ]);
    const available = doctors.filter((doctor) => {
      const windows = availability.filter(
        (window) =>
          window.doctorId === doctor.id &&
          (window.dayOfWeek === null || window.dayOfWeek === now.getDay()) &&
          (!window.blockedDate || format(new Date(window.blockedDate), "yyyy-MM-dd") !== format(now, "yyyy-MM-dd"))
      );
      return windows.some((window) => {
        const start = new Date(firstDay);
        start.setHours(window.startTime.getHours(), window.startTime.getMinutes(), 0, 0);
        const end = new Date(firstDay);
        end.setHours(window.endTime.getHours(), window.endTime.getMinutes(), 0, 0);
        for (let slotStart = start; slotStart < end; slotStart = addMinutes(slotStart, 20)) {
          const slotEnd = addMinutes(slotStart, 20);
          if (slotStart <= now || slotEnd > end) continue;
          if (
            !appointments.some(
              (appointment) =>
                appointment.doctorId === doctor.id &&
                appointment.startTime < slotEnd &&
                appointment.endTime > slotStart
            )
          )
            return true;
        }
        return false;
      });
    });
    return { doctors: await resolveDoctorPublicNames(available.filter(Boolean)) };
  } catch (error) {
    console.error("Failed to search doctors:", error);
    return { error: "Failed to search doctors", doctors: [] };
  }
}
