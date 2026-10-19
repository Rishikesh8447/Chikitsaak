"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { verifyAdmin } from "@/actions/admin";
import { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } from "@/lib/laboratory-workflow.mjs";

const appointmentOrderStatuses = ["CONFIRMED", "IN_PROGRESS", "COMPLETED"];
const labRoutes = ["/laboratory", "/doctor/laboratory", "/admin"];
// Multi-write workflow actions include authorization reads, status records, and notifications.
// Neon round-trip latency exceeded Prisma's 5s interactive-transaction default in integration tests.
const laboratoryTransactionOptions = { isolationLevel: "Serializable", timeout: 15_000 };

async function currentUser(tx = db) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await tx.user.findUnique({ where: { clerkUserId: userId } });
  if (!user) throw new Error("User not found");
  return user;
}

async function currentAdmin(tx = db) {
  if (!(await verifyAdmin())) throw new Error("Unauthorized");
  const user = await currentUser(tx);
  if (user.role !== "ADMIN") throw new Error("Unauthorized");
  return user;
}

function text(formData, key, label, maxLength, required = true) {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if ((!value && required) || value.length > maxLength) throw new Error(`${label} is invalid`);
  return value || null;
}

function addAudit(tx, { actorUserId, laboratoryId = null, entityType, entityId, action, fromStatus = null, toStatus = null, reason = null }) {
  return tx.laboratoryAuditEvent.create({
    data: { actorUserId, laboratoryId, entityType, entityId, action, fromStatus, toStatus, reason },
  });
}

function addOrderHistory(tx, { labOrderId, actorUserId, membershipId = null, fromStatus = null, toStatus, note = null }) {
  return tx.labOrderStatusHistory.create({
    data: { labOrderId, actorUserId, membershipId, fromStatus, toStatus, note },
  });
}

async function notifyOrderUsers(tx, order, { key, title, message, laboratoryId = order.laboratoryId }) {
  const userIds = new Set([order.patientId, order.doctorId].filter(Boolean));
  if (laboratoryId) {
    const members = await tx.laboratoryMembership.findMany({
      where: { laboratoryId, status: "ACTIVE" },
      select: { userId: true },
    });
    for (const member of members) userIds.add(member.userId);
  }
  if (!userIds.size) return;
  await tx.notification.createMany({
    data: [...userIds].map((userId) => ({
      userId,
      ...(order.appointmentId ? { appointmentId: order.appointmentId } : {}),
      type: "LAB_ORDER_UPDATE",
      title,
      message,
      dedupeKey: `lab-order:${order.id}:${key}:${userId}`,
    })),
    skipDuplicates: true,
  });
}

async function membershipFor(tx, userId, laboratoryId, allowedRoles = ["OWNER", "MANAGER", "STAFF"]) {
  if (typeof laboratoryId !== "string" || !laboratoryId) throw new Error("Laboratory is required");
  const membership = await tx.laboratoryMembership.findFirst({
    where: { userId, laboratoryId, status: "ACTIVE", role: { in: allowedRoles } },
    include: { laboratory: true },
  });
  if (!membership) throw new Error("Laboratory membership required");
  return membership;
}

async function verifiedMembershipFor(tx, userId, laboratoryId, allowedRoles) {
  const membership = await membershipFor(tx, userId, laboratoryId, allowedRoles);
  if (membership.laboratory.status !== "VERIFIED") throw new Error("Laboratory must be verified and active");
  return membership;
}

export async function submitLaboratoryApplication(formData) {
  const user = await currentUser();
  const resubmissionOfLaboratoryId = text(formData, "resubmissionOfLaboratoryId", "Rejected application", 100, false);
  const data = {
    name: text(formData, "name", "Laboratory name", 160),
    legalName: text(formData, "legalName", "Legal name", 200),
    registrationNumber: text(formData, "registrationNumber", "Registration number", 100),
    contactEmail: text(formData, "contactEmail", "Contact email", 254),
    contactPhone: text(formData, "contactPhone", "Contact phone", 40),
    address: text(formData, "address", "Address", 500),
    city: text(formData, "city", "City", 100),
    state: text(formData, "state", "State", 100),
    country: text(formData, "country", "Country", 100),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) throw new Error("Enter a valid contact email");
  data.registrationNumber = data.registrationNumber.trim();
  const registrationNumberNormalized = normalizeCatalogKey(data.registrationNumber);

  const laboratory = await db.$transaction(async (tx) => {
    const existing = await tx.laboratoryMembership.findFirst({
      where: { userId: user.id, status: "ACTIVE", laboratory: { is: { status: { in: ["PENDING", "VERIFIED", "SUSPENDED"] } } } },
      select: { id: true },
    });
    if (existing) throw new Error("You already belong to a laboratory application or organization");
    if (resubmissionOfLaboratoryId) {
      const rejectedMembership = await tx.laboratoryMembership.findFirst({
        where: { userId: user.id, laboratoryId: resubmissionOfLaboratoryId, role: "OWNER", status: "ACTIVE", laboratory: { is: { status: "REJECTED" } } },
        select: { id: true },
      });
      if (!rejectedMembership) throw new Error("Only the owner of a rejected laboratory application can resubmit it");
    } else {
      const rejectedMembership = await tx.laboratoryMembership.findFirst({
        where: { userId: user.id, status: "ACTIVE", laboratory: { is: { status: "REJECTED" } } },
        select: { id: true },
      });
      if (rejectedMembership) throw new Error("Select the rejected laboratory application to resubmit");
    }
    const created = await tx.laboratory.create({
      data: { ...data, registrationNumberNormalized, memberships: { create: { userId: user.id, role: "OWNER", status: "ACTIVE" } } },
    });
    await addAudit(tx, { actorUserId: user.id, laboratoryId: created.id, entityType: "Laboratory", entityId: created.id, action: "APPLICATION_SUBMITTED", toStatus: "PENDING" });
    return created;
  }, laboratoryTransactionOptions);
  for (const route of labRoutes) revalidatePath(route);
  return { success: true, laboratoryId: laboratory.id };
}

export async function addLaboratoryMember(formData) {
  const user = await currentUser();
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  const email = text(formData, "email", "Member email", 254).normalize("NFKC").trim().toLowerCase();
  const role = text(formData, "role", "Role", 20);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["MANAGER", "STAFF"].includes(role)) throw new Error("Member details are invalid");
  await db.$transaction(async (tx) => {
    const owner = await membershipFor(tx, user.id, laboratoryId, ["OWNER"]);
    const target = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (!target) throw new Error("The member must create a Chikitsaak account before being added");
    if (target.id === user.id) throw new Error("The owner is already a member");
    const existing = await tx.laboratoryMembership.findUnique({ where: { laboratoryId_userId: { laboratoryId, userId: target.id } } });
    if (existing?.status === "ACTIVE") throw new Error("This user is already a member");
    if (existing) {
      await tx.laboratoryMembership.update({ where: { id: existing.id }, data: { status: "ACTIVE", role } });
    } else {
      await tx.laboratoryMembership.create({ data: { laboratoryId, userId: target.id, role, status: "ACTIVE" } });
    }
    await addAudit(tx, { actorUserId: user.id, laboratoryId: owner.laboratoryId, entityType: "LaboratoryMembership", entityId: target.id, action: "MEMBER_ADDED", toStatus: role });
  }, laboratoryTransactionOptions);
  revalidatePath("/laboratory");
  return { success: true };
}

export async function updateLaboratoryMember(formData) {
  const user = await currentUser();
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  const membershipId = text(formData, "membershipId", "Membership", 100);
  const action = text(formData, "action", "Action", 20);
  const role = text(formData, "role", "Role", 20, false);
  if (!["revoke", "change-role"].includes(action) || (action === "change-role" && !["MANAGER", "STAFF"].includes(role))) throw new Error("Membership action is invalid");
  await db.$transaction(async (tx) => {
    await membershipFor(tx, user.id, laboratoryId, ["OWNER"]);
    const member = await tx.laboratoryMembership.findFirst({ where: { id: membershipId, laboratoryId, status: "ACTIVE", role: { in: ["MANAGER", "STAFF"] } }, select: { id: true, role: true, userId: true } });
    if (!member) throw new Error("Active non-owner membership not found");
    const changed = await tx.laboratoryMembership.updateMany({
      where: { id: member.id, laboratoryId, status: "ACTIVE", role: member.role },
      data: action === "revoke" ? { status: "REVOKED" } : { role },
    });
    if (changed.count !== 1) throw new Error("Membership was updated by another user");
    await addAudit(tx, { actorUserId: user.id, laboratoryId, entityType: "LaboratoryMembership", entityId: member.userId, action: action === "revoke" ? "MEMBER_REVOKED" : "MEMBER_ROLE_CHANGED", fromStatus: member.role, toStatus: action === "revoke" ? "REVOKED" : role });
  }, laboratoryTransactionOptions);
  revalidatePath("/laboratory");
  return { success: true };
}

export async function getLaboratoryWorkspace(requestedLaboratoryId) {
  const user = await currentUser();
  const memberships = await db.laboratoryMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { laboratory: { select: { id: true, name: true, status: true, statusReason: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) return { memberships: [], selected: null, offerings: [], orders: [] };
  const selected = memberships.find((membership) => membership.laboratoryId === requestedLaboratoryId) || memberships[0];
  const isVerified = selected.laboratory.status === "VERIFIED";
  const canManageOfferings = ["OWNER", "MANAGER"].includes(selected.role);
  const [offerings, orders, tests, team] = await Promise.all([
    db.laboratoryOffering.findMany({
      where: { laboratoryId: selected.laboratoryId },
      include: { labTest: { select: { id: true, name: true, code: true, category: true } } },
      orderBy: { labTest: { name: "asc" } },
    }),
    db.labOrder.findMany({
      where: { laboratoryId: selected.laboratoryId },
       include: {
        patient: { select: { id: true, name: true } },
        doctor: { select: { name: true } },
        items: { select: { id: true, testName: true, testCategory: true, testDescription: true, priceAtBooking: true } },
        statusHistory: { select: { fromStatus: true, toStatus: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    isVerified && canManageOfferings
      ? db.labTest.findMany({ where: { isActive: true }, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    selected.role === "OWNER" && isVerified
      ? db.laboratoryMembership.findMany({ where: { laboratoryId: selected.laboratoryId, status: "ACTIVE" }, select: { id: true, role: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
  ]);
  return {
    memberships: memberships.map(({ id, laboratoryId, role, laboratory }) => ({ id, laboratoryId, role, laboratory: { ...laboratory, statusReason: role === "OWNER" ? laboratory.statusReason : null } })),
    selected: { ...selected.laboratory, statusReason: selected.role === "OWNER" ? selected.laboratory.statusReason : null, membershipRole: selected.role },
    offerings,
    orders,
    tests,
    team,
  };
}

export async function getAvailableLaboratoryTests() {
  await currentUser();
  const tests = await db.labTest.findMany({
    where: { isActive: true, offerings: { some: { isAvailable: true, laboratory: { is: { status: "VERIFIED" } } } } },
    select: { id: true, name: true, code: true, category: true, description: true },
    orderBy: { name: "asc" },
  });
  const laboratories = await db.laboratory.findMany({
    where: { status: "VERIFIED", offerings: { some: { isAvailable: true, labTest: { is: { isActive: true } } } } },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      offerings: {
        where: { isAvailable: true, labTest: { is: { isActive: true } } },
        select: { id: true, laboratoryId: true, labTestId: true, price: true, preparationInstructions: true, estimatedHours: true, labTest: { select: { name: true, category: true, description: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  return {
    tests,
    laboratories: laboratories.map((laboratory) => ({
      ...laboratory,
      offerings: laboratory.offerings.map((offering) => ({ ...offering, price: offering.price.toFixed(2) })),
    })),
  };
}

export async function getDoctorLabOrderOptions() {
  const doctor = await currentUser();
  if (doctor.role !== "DOCTOR" || doctor.verificationStatus !== "VERIFIED") throw new Error("Only verified doctors can order laboratory tests");
  const [appointments, tests] = await Promise.all([
    db.appointment.findMany({
      where: { doctorId: doctor.id, status: { in: appointmentOrderStatuses }, patient: { is: { role: "PATIENT" } } },
      select: { id: true, startTime: true, status: true, patient: { select: { id: true, name: true } } },
      orderBy: { startTime: "desc" },
      take: 100,
    }),
    db.labTest.findMany({
      where: { isActive: true, offerings: { some: { isAvailable: true, laboratory: { is: { status: "VERIFIED" } } } } },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { appointments, tests };
}

export async function getDoctorLabOrders() {
  const doctor = await currentUser();
  if (doctor.role !== "DOCTOR") throw new Error("Only doctors can view their laboratory orders");
  return db.labOrder.findMany({
    where: { doctorId: doctor.id },
    select: {
      id: true,
      status: true,
      createdAt: true,
      patient: { select: { name: true } },
      laboratory: { select: { name: true } },
      items: { select: { id: true, testName: true, testCategory: true } },
      statusHistory: { select: { fromStatus: true, toStatus: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function createDoctorLabOrder(formData) {
  const doctor = await currentUser();
  if (doctor.role !== "DOCTOR" || doctor.verificationStatus !== "VERIFIED") throw new Error("Only verified doctors can order laboratory tests");
  const appointmentId = text(formData, "appointmentId", "Appointment", 100);
  const labTestIds = normalizeIdList(formData.getAll("labTestIds"));
  const clinicalInstructions = text(formData, "clinicalInstructions", "Clinical instructions", 3000, false);
  if (!labTestIds.length || labTestIds.length > 20) throw new Error("Select between one and twenty tests");

  const order = await db.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirst({
      where: { id: appointmentId, doctorId: doctor.id, status: { in: appointmentOrderStatuses }, patient: { is: { role: "PATIENT" } } },
      select: { id: true, patientId: true },
    });
    if (!appointment) throw new Error("Choose a patient from one of your active or completed appointments");
    const tests = await tx.labTest.findMany({
      where: { id: { in: labTestIds }, isActive: true, offerings: { some: { isAvailable: true, laboratory: { is: { status: "VERIFIED" } } } } },
      select: { id: true, name: true, category: true, description: true },
    });
    if (tests.length !== labTestIds.length) throw new Error("One or more tests are unavailable");
    const created = await tx.labOrder.create({
      data: {
        patientId: appointment.patientId,
        doctorId: doctor.id,
        appointmentId: appointment.id,
        source: "DOCTOR",
        status: "AWAITING_LAB_SELECTION",
        clinicalInstructions,
        items: { create: tests.map((test) => ({ labTestId: test.id, testName: test.name, testCategory: test.category, testDescription: test.description })) },
      },
      include: { items: true },
    });
    await addOrderHistory(tx, { labOrderId: created.id, actorUserId: doctor.id, toStatus: created.status, note: "Test order created by the treating doctor" });
    await addAudit(tx, { actorUserId: doctor.id, entityType: "LabOrder", entityId: created.id, action: "DOCTOR_ORDER_CREATED", toStatus: created.status });
    await notifyOrderUsers(tx, created, { key: created.status, title: "Laboratory tests ordered", message: "Your doctor ordered laboratory tests. Select a laboratory to continue.", laboratoryId: null });
    return created;
  }, laboratoryTransactionOptions);
  for (const route of labRoutes) revalidatePath(route);
  return { success: true, orderId: order.id };
}

export async function createPatientLabOrder(formData) {
  const patient = await currentUser();
  if (patient.role !== "PATIENT") throw new Error("Only patients can book laboratory services");
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  const offeringIds = normalizeIdList(formData.getAll("offeringIds"));
  const clinicalInstructions = text(formData, "clinicalInstructions", "Clinical instructions", 3000, false);
  if (!offeringIds.length || offeringIds.length > 20) throw new Error("Select between one and twenty tests");
  const order = await db.$transaction(async (tx) => {
    const laboratory = await tx.laboratory.findFirst({ where: { id: laboratoryId, status: "VERIFIED" }, select: { id: true } });
    if (!laboratory) throw new Error("This laboratory is not available");
    const offerings = await tx.laboratoryOffering.findMany({
      where: { id: { in: offeringIds }, laboratoryId, isAvailable: true, labTest: { is: { isActive: true } } },
      include: { labTest: { select: { id: true, name: true, category: true, description: true } } },
    });
    if (offerings.length !== offeringIds.length) throw new Error("One or more selected tests are unavailable at this laboratory");
    const created = await tx.labOrder.create({
      data: {
        patientId: patient.id,
        laboratoryId,
        source: "PATIENT",
        status: "REQUESTED",
        clinicalInstructions,
        items: { create: offerings.map((offering) => ({ labTestId: offering.labTestId, laboratoryOfferingId: offering.id, laboratoryId, testName: offering.labTest.name, testCategory: offering.labTest.category, testDescription: offering.labTest.description, priceAtBooking: offering.price })) },
      },
      include: { items: true },
    });
    await addOrderHistory(tx, { labOrderId: created.id, actorUserId: patient.id, toStatus: created.status, note: "Patient requested available laboratory services" });
    await addAudit(tx, { actorUserId: patient.id, laboratoryId, entityType: "LabOrder", entityId: created.id, action: "PATIENT_ORDER_CREATED", toStatus: created.status });
    await notifyOrderUsers(tx, created, { key: created.status, title: "New laboratory order", message: "A patient submitted a laboratory test request." });
    return created;
  }, laboratoryTransactionOptions);
  for (const route of labRoutes) revalidatePath(route);
  return { success: true, orderId: order.id };
}

export async function bookDoctorLabOrder(formData) {
  const patient = await currentUser();
  if (patient.role !== "PATIENT") throw new Error("Only patients can select a laboratory");
  const labOrderId = text(formData, "labOrderId", "Test order", 100);
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  await db.$transaction(async (tx) => {
    const order = await tx.labOrder.findFirst({ where: { id: labOrderId, patientId: patient.id, source: "DOCTOR", status: "AWAITING_LAB_SELECTION" }, include: { items: true } });
    if (!order || !order.items.length) throw new Error("Test order is unavailable");
    const laboratory = await tx.laboratory.findFirst({ where: { id: laboratoryId, status: "VERIFIED" }, select: { id: true } });
    if (!laboratory) throw new Error("This laboratory is not available");
    const offerings = await tx.laboratoryOffering.findMany({
      where: { laboratoryId, labTestId: { in: order.items.map((item) => item.labTestId) }, isAvailable: true, labTest: { is: { isActive: true } } },
    });
    const byTestId = new Map(offerings.map((offering) => [offering.labTestId, offering]));
    if (byTestId.size !== order.items.length) throw new Error("This laboratory does not offer every test in the order");
    const changed = await tx.labOrder.updateMany({ where: { id: order.id, patientId: patient.id, status: "AWAITING_LAB_SELECTION", laboratoryId: null }, data: { laboratoryId, status: "REQUESTED" } });
    if (changed.count !== 1) throw new Error("Test order has already been updated");
    for (const item of order.items) {
      const offering = byTestId.get(item.labTestId);
      const updated = await tx.labOrderItem.updateMany({ where: { id: item.id, labOrderId: order.id, laboratoryOfferingId: null, laboratoryId: null }, data: { laboratoryOfferingId: offering.id, laboratoryId, priceAtBooking: offering.price } });
      if (updated.count !== 1) throw new Error("Test order has already been updated");
    }
    await addOrderHistory(tx, { labOrderId: order.id, actorUserId: patient.id, fromStatus: order.status, toStatus: "REQUESTED", note: "Patient selected a laboratory" });
    await addAudit(tx, { actorUserId: patient.id, laboratoryId, entityType: "LabOrder", entityId: order.id, action: "LABORATORY_SELECTED", fromStatus: order.status, toStatus: "REQUESTED" });
    await notifyOrderUsers(tx, { ...order, laboratoryId }, { key: "REQUESTED", title: "Laboratory selected", message: "The patient selected your laboratory for an ordered test." });
  }, laboratoryTransactionOptions);
  for (const route of labRoutes) revalidatePath(route);
  return { success: true };
}

export async function retryRejectedLabOrder(formData) {
  const patient = await currentUser();
  if (patient.role !== "PATIENT") throw new Error("Only patients can choose another laboratory");
  const labOrderId = text(formData, "labOrderId", "Test order", 100);
  await db.$transaction(async (tx) => {
    const order = await tx.labOrder.findFirst({ where: { id: labOrderId, patientId: patient.id, source: "DOCTOR", status: "REJECTED" }, include: { items: { select: { id: true } } } });
    if (!order || !canTransitionLabOrder(order.status, "AWAITING_LAB_SELECTION")) throw new Error("Rejected test order is unavailable");
    const changed = await tx.labOrder.updateMany({ where: { id: order.id, patientId: patient.id, status: "REJECTED", laboratoryId: order.laboratoryId }, data: { laboratoryId: null, status: "AWAITING_LAB_SELECTION", collectionAt: null, collectionNotes: null } });
    if (changed.count !== 1) throw new Error("Test order was updated by another user");
    for (const item of order.items) {
      const reset = await tx.labOrderItem.updateMany({ where: { id: item.id, labOrderId: order.id }, data: { laboratoryId: null, laboratoryOfferingId: null, priceAtBooking: null } });
      if (reset.count !== 1) throw new Error("Test order was updated by another user");
    }
    const history = await addOrderHistory(tx, { labOrderId: order.id, actorUserId: patient.id, fromStatus: "REJECTED", toStatus: "AWAITING_LAB_SELECTION", note: "Patient may select another laboratory" });
    await addAudit(tx, { actorUserId: patient.id, entityType: "LabOrder", entityId: order.id, action: "LAB_ORDER_REOPENED", fromStatus: "REJECTED", toStatus: "AWAITING_LAB_SELECTION" });
    await notifyOrderUsers(tx, { ...order, laboratoryId: null }, { key: `retry-${history.id}`, title: "Choose another laboratory", message: "The previous laboratory could not accept your order. You can choose another eligible laboratory.", laboratoryId: null });
  }, laboratoryTransactionOptions);
  revalidatePath("/laboratory");
  return { success: true };
}

export async function getMyLabOrders() {
  const patient = await currentUser();
  if (patient.role !== "PATIENT") throw new Error("Only patients can view their laboratory orders");
  const orders = await db.labOrder.findMany({
    where: { patientId: patient.id },
    include: {
      doctor: { select: { name: true } },
      laboratory: { select: { id: true, name: true, status: true } },
      items: { select: { id: true, labTestId: true, testName: true, testCategory: true, testDescription: true, priceAtBooking: true } },
      statusHistory: { select: { fromStatus: true, toStatus: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  const waiting = orders.filter((order) => order.status === "AWAITING_LAB_SELECTION");
  const eligibleLabs = new Map();
  const labs = waiting.length ? await db.laboratory.findMany({
    where: { status: "VERIFIED" },
      select: { id: true, name: true, offerings: { where: { isAvailable: true, labTest: { is: { isActive: true } } }, select: { labTestId: true, isAvailable: true, price: true, estimatedHours: true, preparationInstructions: true, labTest: { select: { name: true, category: true, description: true } } } } },
    orderBy: { name: "asc" },
  }) : [];
  for (const order of waiting) {
    eligibleLabs.set(order.id, getEligibleLaboratories(labs, order.items.map((item) => item.labTestId)).map(({ id, name, offerings }) => ({ id, name, offerings: offerings.map((offering) => ({ ...offering, price: offering.price.toFixed(2) })) })));
  }
  return { orders, eligibleLabs: Object.fromEntries(eligibleLabs) };
}

export async function transitionLabOrder(formData) {
  const user = await currentUser();
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  const labOrderId = text(formData, "labOrderId", "Test order", 100);
  const action = text(formData, "action", "Action", 30);
  const intent = { accept: "ACCEPTED", reject: "REJECTED", schedule: "COLLECTION_SCHEDULED", collect: "COLLECTED" }[action];
  if (!intent) throw new Error("Invalid order action");
  const collectionValue = formData.get("collectionAt");
  const collectionAt = action === "schedule" && typeof collectionValue === "string" ? new Date(collectionValue) : null;
  const collectionNotes = text(formData, "collectionNotes", action === "reject" ? "Rejection reason" : "Collection notes", 1000, action === "reject");
  if (action === "schedule" && (!collectionAt || Number.isNaN(collectionAt.getTime()) || collectionAt.getTime() < Date.now() + 15 * 60_000 || collectionAt.getTime() > Date.now() + 90 * 24 * 60 * 60_000)) {
    throw new Error("Choose a collection time between 15 minutes and 90 days from now");
  }

  await db.$transaction(async (tx) => {
    const membership = await verifiedMembershipFor(tx, user.id, laboratoryId);
    const order = await tx.labOrder.findFirst({ where: { id: labOrderId, laboratoryId }, include: { items: { select: { testName: true } } } });
    if (!order) throw new Error("Laboratory order not found");
    if (!canTransitionLabOrder(order.status, intent)) throw new Error("Laboratory order cannot make that status transition");
    const updateData = {
      status: intent,
      ...(action === "schedule" ? { collectionAt, collectionNotes } : {}),
    };
    const changed = await tx.labOrder.updateMany({ where: { id: order.id, laboratoryId, status: order.status }, data: updateData });
    if (changed.count !== 1) throw new Error("Laboratory order was updated by another user");
    const note = action === "reject" ? collectionNotes : action === "schedule" ? collectionNotes : null;
    await addOrderHistory(tx, { labOrderId: order.id, actorUserId: user.id, membershipId: membership.id, fromStatus: order.status, toStatus: intent, note });
    await addAudit(tx, { actorUserId: user.id, laboratoryId, entityType: "LabOrder", entityId: order.id, action: `ORDER_${intent}`, fromStatus: order.status, toStatus: intent, reason: note });
    const message = intent === "COLLECTION_SCHEDULED"
      ? `The laboratory scheduled sample collection for ${collectionAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`
      : ({
          ACCEPTED: "The laboratory accepted the test order.",
          REJECTED: "The laboratory rejected the test order.",
          COLLECTED: "The laboratory marked your sample as collected.",
        })[intent];
    const notificationTitle = intent === "ACCEPTED" ? "Laboratory accepted your test order"
      : intent === "REJECTED" ? "Laboratory could not accept your test order"
        : intent === "COLLECTION_SCHEDULED" ? "Sample collection scheduled" : "Sample collected";
    await notifyOrderUsers(tx, order, { key: intent, title: notificationTitle, message });
  }, laboratoryTransactionOptions);
  for (const route of labRoutes) revalidatePath(route);
  return { success: true };
}

export async function submitLaboratoryResult(formData) {
  const user = await currentUser();
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  const labOrderId = text(formData, "labOrderId", "Test order", 100);
  const result = text(formData, "result", "Test result", 10_000);

  await db.$transaction(async (tx) => {
    const membership = await verifiedMembershipFor(tx, user.id, laboratoryId);
    const order = await tx.labOrder.findFirst({ where: { id: labOrderId, laboratoryId }, select: { id: true, patientId: true, doctorId: true, appointmentId: true, status: true, laboratoryId: true } });
    if (!order) throw new Error("Laboratory order not found");
    if (order.status !== "COLLECTED") throw new Error("A result can only be submitted after the sample is collected");

    const existingResult = await tx.labOrderStatusHistory.findFirst({ where: { labOrderId, toStatus: "COLLECTED", note: { startsWith: "Laboratory result: " } }, select: { id: true } });
    if (existingResult) throw new Error("A result has already been submitted for this order");

    const history = await addOrderHistory(tx, {
      labOrderId,
      actorUserId: user.id,
      membershipId: membership.id,
      fromStatus: "COLLECTED",
      toStatus: "COLLECTED",
      note: `Laboratory result: ${result}`,
    });
    await addAudit(tx, { actorUserId: user.id, laboratoryId, entityType: "LabOrder", entityId: labOrderId, action: "ORDER_RESULT_SUBMITTED", fromStatus: "COLLECTED", toStatus: "COLLECTED" });
    await notifyOrderUsers(tx, order, { key: `result-${history.id}`, title: "Laboratory result available", message: "Your laboratory has submitted a result for your test order." });
  }, laboratoryTransactionOptions);

  revalidatePath("/laboratory");
  revalidatePath("/doctor/laboratory");
  return { success: true };
}

export async function saveLaboratoryOffering(formData) {
  const user = await currentUser();
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  const labTestId = text(formData, "labTestId", "Test", 100);
  const price = parseMoney(text(formData, "price", "Price", 20));
  const estimatedHoursValue = text(formData, "estimatedHours", "Estimated hours", 5, false);
  const estimatedHours = estimatedHoursValue === null ? null : Number(estimatedHoursValue);
  const preparationInstructions = text(formData, "preparationInstructions", "Preparation instructions", 3000, false);
  if (price === null) throw new Error("Enter a valid non-negative price with up to two decimals");
  if (estimatedHours !== null && (!Number.isInteger(estimatedHours) || estimatedHours < 1 || estimatedHours > 8760)) throw new Error("Estimated hours must be between 1 and 8760");
  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, laboratoryId, ["OWNER", "MANAGER"]);
    const test = await tx.labTest.findFirst({ where: { id: labTestId, isActive: true }, select: { id: true } });
    if (!test) throw new Error("Test is unavailable");
    const offering = await tx.laboratoryOffering.upsert({
      where: { laboratoryId_labTestId: { laboratoryId, labTestId } },
      create: { laboratoryId, labTestId, price, preparationInstructions, estimatedHours, isAvailable: true },
      update: { price, preparationInstructions, estimatedHours, isAvailable: true },
      select: { id: true },
    });
    await addAudit(tx, { actorUserId: user.id, laboratoryId, entityType: "LaboratoryOffering", entityId: offering.id, action: "OFFERING_SAVED" });
  }, laboratoryTransactionOptions);
  revalidatePath("/laboratory");
  revalidatePath("/doctor/laboratory");
  return { success: true };
}

export async function setLaboratoryOfferingAvailability(formData) {
  const user = await currentUser();
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  const offeringId = text(formData, "offeringId", "Offering", 100);
  const available = formData.get("available") === "true";
  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, laboratoryId, ["OWNER", "MANAGER"]);
    const changed = await tx.laboratoryOffering.updateMany({ where: { id: offeringId, laboratoryId }, data: { isAvailable: available } });
    if (changed.count !== 1) throw new Error("Offering not found");
    await addAudit(tx, { actorUserId: user.id, laboratoryId, entityType: "LaboratoryOffering", entityId: offeringId, action: available ? "OFFERING_ENABLED" : "OFFERING_DISABLED" });
  }, laboratoryTransactionOptions);
  for (const route of labRoutes) revalidatePath(route);
  return { success: true };
}

export async function getAdminLaboratoryOverview() {
  const admin = await currentAdmin();
  if (admin.role !== "ADMIN") throw new Error("Unauthorized");
  const [laboratories, tests, orders, auditEvents] = await Promise.all([
    db.laboratory.findMany({
      select: { id: true, name: true, legalName: true, registrationNumber: true, city: true, state: true, country: true, status: true, statusReason: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.labTest.findMany({ orderBy: { name: "asc" }, take: 500 }),
    db.labOrder.findMany({
      select: { source: true, status: true, createdAt: true, collectionAt: true, laboratory: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.laboratoryAuditEvent.findMany({
      select: { entityType: true, action: true, fromStatus: true, toStatus: true, createdAt: true, laboratory: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return { laboratories, tests, orders, auditEvents };
}

export async function updateLaboratoryStatus(formData) {
  const admin = await currentAdmin();
  const laboratoryId = text(formData, "laboratoryId", "Laboratory", 100);
  const status = text(formData, "status", "Status", 20);
  if (!["VERIFIED", "REJECTED", "SUSPENDED"].includes(status)) throw new Error("Invalid laboratory status");
  const reason = text(formData, "reason", "Rejection reason", 1000, status === "REJECTED");
  await db.$transaction(async (tx) => {
    const laboratory = await tx.laboratory.findUnique({ where: { id: laboratoryId }, select: { id: true, name: true, status: true } });
    if (!laboratory || !canTransitionLaboratory(laboratory.status, status)) throw new Error("Laboratory status cannot make that transition");
    const changed = await tx.laboratory.updateMany({ where: { id: laboratoryId, status: laboratory.status }, data: { status, statusReason: reason } });
    if (changed.count !== 1) throw new Error("Laboratory status was updated by another administrator");
    await addAudit(tx, { actorUserId: admin.id, laboratoryId, entityType: "Laboratory", entityId: laboratoryId, action: `LABORATORY_${status}`, fromStatus: laboratory.status, toStatus: status, reason });
    const owners = await tx.laboratoryMembership.findMany({ where: { laboratoryId, status: "ACTIVE", role: "OWNER" }, select: { userId: true } });
    await tx.notification.createMany({
      data: owners.map(({ userId }) => ({ userId, type: "LAB_ORDER_UPDATE", title: "Laboratory application updated", message: `Your laboratory is now ${status.toLowerCase()}.${reason ? ` ${reason}` : ""}`, dedupeKey: `laboratory:${laboratoryId}:status:${status}:${userId}` })),
      skipDuplicates: true,
    });
  }, laboratoryTransactionOptions);
  revalidatePath("/admin");
  revalidatePath("/laboratory");
  revalidatePath("/doctor/laboratory");
  return { success: true };
}

export async function createLabTest(formData) {
  const admin = await currentAdmin();
  const name = text(formData, "name", "Test name", 160);
  const code = text(formData, "code", "Test code", 60, false);
  const category = text(formData, "category", "Category", 100, false);
  const description = text(formData, "description", "Description", 1000, false);
  const test = await db.$transaction(async (tx) => {
    const created = await tx.labTest.create({ data: { name, normalizedName: normalizeCatalogKey(name), code, category, description } });
    await addAudit(tx, { actorUserId: admin.id, entityType: "LabTest", entityId: created.id, action: "CATALOG_TEST_CREATED" });
    return created;
  }, laboratoryTransactionOptions);
  revalidatePath("/admin");
  revalidatePath("/laboratory");
  revalidatePath("/doctor/laboratory");
  return { success: true, testId: test.id };
}

export async function setLabTestActive(formData) {
  const admin = await currentAdmin();
  const labTestId = text(formData, "labTestId", "Test", 100);
  const isActive = formData.get("isActive") === "true";
  await db.$transaction(async (tx) => {
    const changed = await tx.labTest.updateMany({ where: { id: labTestId, isActive: !isActive }, data: { isActive } });
    if (changed.count !== 1) throw new Error("Test catalog entry was updated or removed");
    await addAudit(tx, { actorUserId: admin.id, entityType: "LabTest", entityId: labTestId, action: isActive ? "CATALOG_TEST_ENABLED" : "CATALOG_TEST_DISABLED" });
  }, laboratoryTransactionOptions);
  revalidatePath("/admin");
  revalidatePath("/laboratory");
  revalidatePath("/doctor/laboratory");
  return { success: true };
}
