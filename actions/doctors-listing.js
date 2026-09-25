"use server";

import { db } from "@/lib/prisma";
import { addMinutes, endOfDay, format } from "date-fns";
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
  const now = new Date();
  const firstDay = new Date(now);
  firstDay.setHours(0, 0, 0, 0);
  const lastDay = endOfDay(firstDay);
  const doctorIds = doctors.map((doctor) => doctor.id);
  const [availability, appointments] = await Promise.all([
    db.availability.findMany({ where: { doctorId: { in: doctorIds }, status: "AVAILABLE" } }),
    db.appointment.findMany({ where: { doctorId: { in: doctorIds }, status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] }, startTime: { lt: lastDay }, endTime: { gt: firstDay } }, select: { doctorId: true, startTime: true, endTime: true } }),
  ]);
  const available = doctors.filter((doctor) => {
    const windows = availability.filter((window) => window.doctorId === doctor.id && (window.dayOfWeek === null || window.dayOfWeek === now.getDay()) && (!window.blockedDate || format(new Date(window.blockedDate), "yyyy-MM-dd") !== format(now, "yyyy-MM-dd")));
    return windows.some((window) => {
      const start = new Date(firstDay);
      start.setHours(window.startTime.getHours(), window.startTime.getMinutes(), 0, 0);
      const end = new Date(firstDay);
      end.setHours(window.endTime.getHours(), window.endTime.getMinutes(), 0, 0);
      for (let slotStart = start; slotStart < end; slotStart = addMinutes(slotStart, 30)) {
        const slotEnd = addMinutes(slotStart, 30);
        if (slotStart <= now || slotEnd > end) continue;
        if (!appointments.some((appointment) => appointment.doctorId === doctor.id && appointment.startTime < slotEnd && appointment.endTime > slotStart)) return true;
      }
      return false;
    });
  });
  return { doctors: await resolveDoctorPublicNames(available.filter(Boolean)) };
}
