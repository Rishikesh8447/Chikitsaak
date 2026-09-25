"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";

const ACTIVE_STATUSES = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];
const RANGES = new Set([7, 30, 90, 365]);

function rangeWindow(value) {
  const days = RANGES.has(Number(value)) ? Number(value) : 30;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { days, from, to };
}

function trend(records, from, days) {
  const buckets = new Map();
  const bucketCount = days <= 30 ? days : Math.ceil(days / 7);
  for (let index = 0; index < bucketCount; index += 1) {
    const start = new Date(from);
    start.setDate(start.getDate() + (days <= 30 ? index : index * 7));
    const key = start.toISOString().slice(0, 10);
    buckets.set(key, { label: days <= 30 ? start.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : `Week ${index + 1}`, count: 0 });
  }
  for (const record of records) {
    const date = new Date(record.startTime);
    const offset = Math.max(0, Math.floor((date - from) / 86400000));
    const index = days <= 30 ? offset : Math.floor(offset / 7);
    const key = Array.from(buckets.keys())[Math.min(index, bucketCount - 1)];
    if (key) buckets.get(key).count += 1;
  }
  return Array.from(buckets.values());
}

function statusCounts(records) {
  return ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"].map((status) => ({ status, count: records.filter((record) => record.status === status).length }));
}

async function currentUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await db.user.findUnique({ where: { clerkUserId: userId }, select: { id: true, role: true, verificationStatus: true } });
  if (!user) throw new Error("User not found");
  return user;
}

export async function getDoctorAnalytics(range) {
  const user = await currentUser();
  if (user.role !== "DOCTOR" || user.verificationStatus !== "VERIFIED") throw new Error("Only verified doctors can access doctor analytics");
  const window = rangeWindow(range);
  const where = { doctorId: user.id, startTime: { gte: window.from, lte: window.to } };
  const appointments = await db.appointment.findMany({ where, select: { startTime: true, status: true, patientId: true } });
  const completedPatients = await db.appointment.groupBy({ by: ["patientId"], where: { ...where, status: "COMPLETED" } });
  return { range: window.days, metrics: { total: appointments.length, upcoming: appointments.filter((item) => ACTIVE_STATUSES.includes(item.status) && new Date(item.startTime) >= new Date()).length, completed: appointments.filter((item) => item.status === "COMPLETED").length, cancelled: appointments.filter((item) => item.status === "CANCELLED").length, noShow: appointments.filter((item) => item.status === "NO_SHOW").length, patientsTreated: completedPatients.length }, trend: trend(appointments, window.from, window.days), statuses: statusCounts(appointments) };
}

export async function getPatientAnalytics(range) {
  const user = await currentUser();
  if (user.role !== "PATIENT") throw new Error("Only patients can access patient analytics");
  const window = rangeWindow(range);
  const where = { patientId: user.id, startTime: { gte: window.from, lte: window.to } };
  const appointments = await db.appointment.findMany({ where, select: { startTime: true, status: true, doctorId: true } });
  const doctors = await db.appointment.groupBy({ by: ["doctorId"], where });
  return { range: window.days, metrics: { total: appointments.length, upcoming: appointments.filter((item) => ACTIVE_STATUSES.includes(item.status) && new Date(item.startTime) >= new Date()).length, completed: appointments.filter((item) => item.status === "COMPLETED").length, cancelled: appointments.filter((item) => item.status === "CANCELLED").length, doctorsConsulted: new Set(appointments.filter((item) => item.status === "COMPLETED").map((item) => item.doctorId)).size }, trend: trend(appointments, window.from, window.days), statuses: statusCounts(appointments) };
}

export async function getAdminAnalytics(range) {
  const user = await currentUser();
  if (user.role !== "ADMIN") throw new Error("Only admins can access admin analytics");
  const window = rangeWindow(range);
  const appointmentWhere = { startTime: { gte: window.from, lte: window.to } };
  const [users, appointments, verification, userGrowth] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.appointment.findMany({ where: appointmentWhere, select: { startTime: true, status: true } }),
    db.user.groupBy({ by: ["verificationStatus"], _count: { _all: true } }),
    db.user.findMany({ where: { createdAt: { gte: window.from, lte: window.to } }, select: { createdAt: true } }),
  ]);
  const roleCount = (role) => users.find((item) => item.role === role)?._count._all || 0;
  const verificationCounts = verification.map((item) => ({ status: item.verificationStatus || "UNSET", count: item._count._all }));
  return { range: window.days, metrics: { users: users.reduce((sum, item) => sum + item._count._all, 0), doctors: roleCount("DOCTOR"), patients: roleCount("PATIENT"), totalAppointments: appointments.length, completed: appointments.filter((item) => item.status === "COMPLETED").length, cancelled: appointments.filter((item) => item.status === "CANCELLED").length, upcoming: appointments.filter((item) => ACTIVE_STATUSES.includes(item.status) && new Date(item.startTime) >= new Date()).length }, trend: trend(appointments, window.from, window.days), userGrowth: trend(userGrowth.map((item) => ({ startTime: item.createdAt, status: "USER" })), window.from, window.days), statuses: statusCounts(appointments), verification: verificationCounts };
}
