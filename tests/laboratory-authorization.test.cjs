const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } = require("../lib/laboratory-workflow.mjs");

const sourcePromise = readFile(join(cwd(), "actions", "laboratory.js"), "utf8");

class FormValues extends Map {
  getAll(key) { return this.get(`${key}[]`) || []; }
}

function values(entries = []) { return new FormValues(entries); }

async function loadActions({
  user = { id: "doctor-a", clerkUserId: "clerk-a", role: "DOCTOR", verificationStatus: "VERIFIED" },
  appointment = { id: "appointment-a", doctorId: "doctor-a", patientId: "patient-a" },
  membership = { id: "membership-a", userId: "lab-staff", laboratoryId: "lab-a", role: "STAFF", status: "ACTIVE", laboratory: { id: "lab-a", status: "VERIFIED" } },
  laboratoryRecord = { id: "lab-a", name: "Test lab", status: "PENDING" },
  order = { id: "order-a", patientId: "patient-a", doctorId: "doctor-a", appointmentId: "appointment-a", laboratoryId: "lab-a", status: "REQUESTED", items: [{ id: "item-a", labOrderId: "order-a", labTestId: "test-a", laboratoryId: "lab-a", laboratoryOfferingId: "offering-old", priceAtBooking: "25.00", testName: "CBC" }] },
  doctorOrders = [],
  updateCount = 1,
  notificationsFail = false,
  workspaceMemberships,
} = {}) {
  const source = await sourcePromise;
  const state = { queries: [], orderLookups: [], membershipLookups: [], creates: [], laboratoryCreates: [], history: [], audits: [], notifications: [], updates: [], doctorOrderQueries: [], adminLaboratoryQueries: [], adminOrderQueries: [], adminAuditQueries: [] };
  const record = (type) => async (query) => { state[type].push(query); return { id: `${type}-${state[type].length}`, count: query?.data?.length || 1 }; };
  const transaction = {
    appointment: { findFirst: async (query) => { state.queries.push({ model: "appointment", ...query }); return query.where.doctorId === appointment?.doctorId && query.where.id === appointment?.id ? appointment : null; } },
    labTest: { findMany: async (query) => { state.queries.push({ model: "labTest", ...query }); return query.where?.id?.in ? query.where.id.in.map((id) => ({ id, name: id === "test-a" ? "CBC" : "Metabolic panel" })) : []; } },
    laboratory: {
      findFirst: async (query) => ["lab-a", "lab-b"].includes(query.where.id) && query.where.status === "VERIFIED" ? { id: query.where.id } : null,
      findUnique: async () => laboratoryRecord,
      create: async (query) => { state.laboratoryCreates.push(query); return { id: "laboratory-new", ...query.data }; },
      updateMany: async (query) => { state.updates.push(query); return { count: updateCount }; },
      findMany: async (query) => { state.adminLaboratoryQueries.push(query); return []; },
    },
    laboratoryOffering: {
      findMany: async (query) => (query.where.id?.in || query.where.labTestId?.in || []).map((id, index) => ({ id: `offering-${index + 1}`, labTestId: id, price: "25.00" })),
      updateMany: async (query) => { state.updates.push(query); return { count: 1 }; },
    },
    labOrder: {
      create: async (query) => { state.creates.push(query); return { id: "order-new", status: query.data.status, ...query.data, items: query.data.items.create }; },
      findFirst: async (query) => { state.queries.push({ model: "labOrder", ...query }); state.orderLookups.push(query); return query.where.id === order?.id && (!query.where.laboratoryId || query.where.laboratoryId === order?.laboratoryId) && (!query.where.patientId || query.where.patientId === order?.patientId) && (!query.where.status || query.where.status === order?.status) ? structuredClone(order) : null; },
      updateMany: async (query) => { state.updates.push(query); const matches = query.where.id === order?.id && (!query.where.patientId || query.where.patientId === order.patientId) && (!query.where.laboratoryId || query.where.laboratoryId === order.laboratoryId) && (!query.where.status || query.where.status === order.status); if (updateCount === 1 && matches) Object.assign(order, query.data); return { count: matches ? updateCount : 0 }; },
      findMany: async (query) => { if (query.where?.doctorId) { state.doctorOrderQueries.push(query); return doctorOrders; } state.adminOrderQueries.push(query); return []; },
    },
    labOrderItem: { updateMany: async (query) => { state.updates.push(query); const item = order?.items?.find((candidate) => candidate.id === query.where.id && candidate.labOrderId === query.where.labOrderId); if (item) Object.assign(item, query.data); return { count: item ? 1 : 0 }; } },
    labOrderStatusHistory: {
      create: record("history"),
      findFirst: async (query) => { state.queries.push({ model: "history", ...query }); return state.history.some((entry) => entry.data.labOrderId === query.where.labOrderId && entry.data.toStatus === query.where.toStatus && entry.data.note.startsWith(query.where.note.startsWith)) ? { id: "existing-result" } : null; },
    },
    laboratoryAuditEvent: { create: record("audits"), findMany: async (query) => { state.adminAuditQueries.push(query); return []; } },
    laboratoryMembership: {
      findFirst: async (query) => {
        state.queries.push({ model: "membership", ...query });
        state.membershipLookups.push(query);
        const matchesUser = query.where.userId === membership?.userId && membership?.status === "ACTIVE";
        const requestedRole = query.where.role;
        const matchesRole = !requestedRole || requestedRole === membership?.role || requestedRole.in?.includes(membership?.role);
        const laboratoryStatus = query.where.laboratory?.is?.status;
        if (query.where.laboratoryId) return matchesUser && query.where.laboratoryId === membership?.laboratoryId && matchesRole && (!laboratoryStatus || laboratoryStatus === membership?.laboratory?.status) ? membership : null;
        if (laboratoryStatus?.in) return matchesUser && laboratoryStatus.in.includes(membership?.laboratory?.status) ? membership : null;
        if (laboratoryStatus) return matchesUser && laboratoryStatus === membership?.laboratory?.status ? membership : null;
        return null;
      },
      findMany: async (query) => {
        state.queries.push({ model: "members", ...query });
        if (workspaceMemberships !== undefined) return query.where.laboratoryId ? [] : workspaceMemberships;
        return [{ userId: "lab-staff" }];
      },
    },
    notification: { createMany: async (query) => { if (notificationsFail) throw new Error("notification failure"); state.notifications.push(query); return { count: query.data.length }; } },
  };
  const dependencies = {
    auth: async () => ({ userId: user?.clerkUserId || null }),
    revalidatePath() {},
    db: {
      user: { findUnique: async () => user },
      $transaction: async (callback) => {
        const lengths = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? value.length : null]));
        try {
          return await callback(transaction);
        } catch (error) {
          for (const [key, length] of Object.entries(lengths)) if (length !== null) state[key].length = length;
          throw error;
        }
      },
      ...transaction,
    },
    verifyAdmin: async () => user?.role === "ADMIN",
    canTransitionLabOrder,
    canTransitionLaboratory,
    getEligibleLaboratories,
    normalizeCatalogKey,
    normalizeIdList,
    parseMoney,
  };
  const transformed = source
    .replaceAll('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { verifyAdmin } from "@/actions/admin";', "const { verifyAdmin } = dependencies;")
    .replace('import { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } from "@/lib/laboratory-workflow.mjs";', "const { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { submitLaboratoryApplication, getLaboratoryWorkspace, createDoctorLabOrder, getDoctorLabOrders, bookDoctorLabOrder, retryRejectedLabOrder, transitionLabOrder, submitLaboratoryResult, updateLaboratoryStatus, getAdminLaboratoryOverview };");
  return { ...new Function("dependencies", transformed)(dependencies), state };
}

test("doctor order derives patient from a doctor-owned eligible appointment", async () => {
  const { createDoctorLabOrder, state } = await loadActions();
  const form = values([["appointmentId", "appointment-a"], ["labTestIds[]", ["test-a"]], ["patientId", "patient-attacker"]]);
  const result = await createDoctorLabOrder(form);
  assert.equal(result.success, true);
  assert.equal(state.creates[0].data.patientId, "patient-a");
  assert.equal(state.creates[0].data.doctorId, "doctor-a");
  assert.deepEqual(state.queries.find((query) => query.model === "appointment").where, {
    id: "appointment-a", doctorId: "doctor-a", status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] }, patient: { is: { role: "PATIENT" } },
  });
});

test("doctor cannot create an order for an appointment not assigned to them", async () => {
  const { createDoctorLabOrder, state } = await loadActions({
    user: { id: "doctor-b", clerkUserId: "clerk-b", role: "DOCTOR", verificationStatus: "VERIFIED" },
  });
  await assert.rejects(createDoctorLabOrder(values([["appointmentId", "appointment-a"], ["labTestIds[]", ["test-a"]]])), /Choose a patient from one of your active or completed appointments/);
  assert.equal(state.creates.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("doctor order history is scoped to the authenticated doctor's orders", async () => {
  const doctorOrder = { id: "order-doctor-a", status: "COLLECTED", items: [{ testName: "CBC" }] };
  const { getDoctorLabOrders, state } = await loadActions({ doctorOrders: [doctorOrder] });
  assert.deepEqual(await getDoctorLabOrders(), [doctorOrder]);
  assert.deepEqual(state.doctorOrderQueries[0].where, { doctorId: "doctor-a" });
  assert.equal(state.doctorOrderQueries[0].select.patient.select.name, true);
  assert.equal(state.doctorOrderQueries[0].select.statusHistory.select.note, true);
});

test("non-doctor cannot read doctor laboratory orders", async () => {
  const { getDoctorLabOrders, state } = await loadActions({ user: { id: "patient-a", clerkUserId: "clerk-patient", role: "PATIENT" } });
  await assert.rejects(getDoctorLabOrders(), /Only doctors can view their laboratory orders/);
  assert.equal(state.doctorOrderQueries.length, 0);
});

test("patient cannot select a laboratory for another patient's doctor order", async () => {
  const { bookDoctorLabOrder, state } = await loadActions({
    user: { id: "patient-b", clerkUserId: "clerk-b", role: "PATIENT" },
    order: { id: "order-a", patientId: "patient-a", doctorId: "doctor-a", source: "DOCTOR", status: "AWAITING_LAB_SELECTION", laboratoryId: null, items: [{ id: "item-a", labTestId: "test-a", testName: "CBC", laboratoryOfferingId: null }] },
  });
  await assert.rejects(bookDoctorLabOrder(values([["labOrderId", "order-a"], ["laboratoryId", "lab-a"]])), /Test order is unavailable/);
  assert.equal(state.updates.length, 0);
  assert.equal(state.updates.length, 0);
});

test("valid Lab A member cannot act on an order belonging to Lab B", async () => {
  const { transitionLabOrder, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
    membership: { id: "membership-a", userId: "lab-staff", laboratoryId: "lab-a", role: "STAFF", status: "ACTIVE", laboratory: { id: "lab-a", status: "VERIFIED" } },
  });
  await assert.rejects(transitionLabOrder(values([["laboratoryId", "lab-b"], ["labOrderId", "order-a"], ["action", "accept"]])), /Laboratory membership required/);
  assert.equal(state.orderLookups.length, 0);
  assert.equal(state.updates.length, 0);
});

test("laboratory rejection requires a nonempty trimmed reason before writing", async () => {
  const { transitionLabOrder, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
  });
  for (const reason of [undefined, "", "   \t  "]) {
    const fields = [["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["action", "reject"]];
    if (reason !== undefined) fields.push(["collectionNotes", reason]);
    await assert.rejects(transitionLabOrder(values(fields)), /Rejection reason is invalid/);
  }
  assert.equal(state.updates.length, 0);
  assert.equal(state.history.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("authorized rejection trims and records its reason in history and audit", async () => {
  const { transitionLabOrder, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
  });
  await transitionLabOrder(values([
    ["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["action", "reject"], ["collectionNotes", "  Unable to process this sample  "],
  ]));
  assert.deepEqual(state.updates[0].data, { status: "REJECTED" });
  assert.equal(state.history[0].data.fromStatus, "REQUESTED");
  assert.equal(state.history[0].data.toStatus, "REJECTED");
  assert.equal(state.history[0].data.note, "Unable to process this sample");
  assert.equal(state.audits[0].data.reason, "Unable to process this sample");
});

test("rejection still requires membership in the laboratory assigned to the order", async () => {
  const { transitionLabOrder, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
  });
  await assert.rejects(transitionLabOrder(values([
    ["laboratoryId", "lab-b"], ["labOrderId", "order-a"], ["action", "reject"], ["collectionNotes", "Unavailable"],
  ])), /Laboratory membership required/);
  assert.equal(state.orderLookups.length, 0);
  assert.equal(state.updates.length, 0);
});

test("pending laboratory membership cannot fulfil orders", async () => {
  const { transitionLabOrder, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
    membership: { id: "membership-a", userId: "lab-staff", laboratoryId: "lab-a", role: "STAFF", status: "ACTIVE", laboratory: { id: "lab-a", status: "PENDING" } },
  });
  await assert.rejects(transitionLabOrder(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["action", "accept"]])), /Laboratory must be verified and active/);
  assert.equal(state.queries.some((query) => query.model === "labOrder"), false);
});

test("stale order update records neither history nor notifications", async () => {
  const { transitionLabOrder, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
    updateCount: 0,
  });
  await assert.rejects(transitionLabOrder(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["action", "accept"]])), /updated by another user/);
  assert.equal(state.history.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("invalid order transition is rejected before any write", async () => {
  const { transitionLabOrder, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
    order: { id: "order-a", patientId: "patient-a", doctorId: "doctor-a", appointmentId: "appointment-a", laboratoryId: "lab-a", status: "ACCEPTED", items: [{ testName: "CBC" }] },
  });
  await assert.rejects(transitionLabOrder(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["action", "accept"]])), /cannot make that status transition/);
  assert.equal(state.updates.length, 0);
  assert.equal(state.history.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("notification failure rolls back mocked writes in the transaction harness", async () => {
  const { transitionLabOrder, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
    notificationsFail: true,
  });
  await assert.rejects(transitionLabOrder(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["action", "accept"]])), /notification failure/);
  assert.equal(state.updates.length, 0);
  assert.equal(state.history.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("accepted order writes status history, audit, and patient/doctor/lab notifications", async () => {
  const { transitionLabOrder, state } = await loadActions({ user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" } });
  await transitionLabOrder(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["action", "accept"]]));
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].data.fromStatus, "REQUESTED");
  assert.equal(state.history[0].data.toStatus, "ACCEPTED");
  assert.equal(state.audits[0].data.action, "ORDER_ACCEPTED");
  assert.deepEqual(new Set(state.notifications[0].data.map((item) => item.userId)), new Set(["patient-a", "doctor-a", "lab-staff"]));
});

test("verified laboratory member submits a result once and notifies order participants", async () => {
  const { submitLaboratoryResult, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
    order: { id: "order-a", patientId: "patient-a", doctorId: "doctor-a", appointmentId: "appointment-a", laboratoryId: "lab-a", status: "COLLECTED", items: [] },
  });
  await submitLaboratoryResult(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["result", "CBC: within reference range"]]));
  assert.equal(state.history[0].data.note, "Laboratory result: CBC: within reference range");
  assert.equal(state.history[0].data.membershipId, "membership-a");
  assert.equal(state.audits[0].data.action, "ORDER_RESULT_SUBMITTED");
  assert.deepEqual(new Set(state.notifications[0].data.map((item) => item.userId)), new Set(["patient-a", "doctor-a", "lab-staff"]));
  await assert.rejects(submitLaboratoryResult(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["result", "Replacement result"]])), /already been submitted/);
  assert.equal(state.history.length, 1);
});

test("result submission rejects non-collected orders and members of another laboratory", async () => {
  const notCollected = await loadActions({ user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" } });
  await assert.rejects(notCollected.submitLaboratoryResult(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["result", "Result"]])), /only be submitted after the sample is collected/);
  assert.equal(notCollected.state.history.length, 0);

  const wrongLab = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-lab", role: "PATIENT" },
    membership: { id: "membership-a", userId: "lab-staff", laboratoryId: "lab-a", role: "STAFF", status: "ACTIVE", laboratory: { id: "lab-a", status: "VERIFIED" } },
    order: { id: "order-a", patientId: "patient-a", doctorId: "doctor-a", appointmentId: "appointment-a", laboratoryId: "lab-b", status: "COLLECTED", items: [] },
  });
  await assert.rejects(wrongLab.submitLaboratoryResult(values([["laboratoryId", "lab-a"], ["labOrderId", "order-a"], ["result", "Result"]])), /Laboratory order not found/);
  assert.equal(wrongLab.state.history.length, 0);
});

test("patient reopens a rejected doctor order and books it with another eligible laboratory", async () => {
  const order = {
    id: "order-a", patientId: "patient-a", doctorId: "doctor-a", appointmentId: "appointment-a",
    source: "DOCTOR", laboratoryId: "lab-a", status: "REJECTED", collectionAt: new Date(), collectionNotes: "Old schedule",
    items: [{ id: "item-a", labOrderId: "order-a", labTestId: "test-a", laboratoryId: "lab-a", laboratoryOfferingId: "offering-old", priceAtBooking: "25.00", testName: "CBC" }],
  };
  const { retryRejectedLabOrder, bookDoctorLabOrder, state } = await loadActions({
    user: { id: "patient-a", clerkUserId: "clerk-patient", role: "PATIENT" }, order,
  });

  await retryRejectedLabOrder(values([["labOrderId", "order-a"]]));

  assert.equal(order.laboratoryId, null);
  assert.equal(order.status, "AWAITING_LAB_SELECTION");
  assert.equal(order.collectionAt, null);
  assert.equal(order.collectionNotes, null);
  assert.equal(order.items[0].laboratoryId, null);
  assert.equal(order.items[0].laboratoryOfferingId, null);
  assert.equal(order.items[0].priceAtBooking, null);
  assert.deepEqual(state.updates[1].data, { laboratoryId: null, laboratoryOfferingId: null, priceAtBooking: null });
  assert.equal(state.history[0].data.fromStatus, "REJECTED");
  assert.equal(state.history[0].data.toStatus, "AWAITING_LAB_SELECTION");
  assert.equal(state.audits[0].data.action, "LAB_ORDER_REOPENED");
  assert.deepEqual(new Set(state.notifications[0].data.map((item) => item.userId)), new Set(["patient-a", "doctor-a"]));

  await bookDoctorLabOrder(values([["labOrderId", "order-a"], ["laboratoryId", "lab-b"]]));

  assert.equal(order.laboratoryId, "lab-b");
  assert.equal(order.status, "REQUESTED");
  assert.equal(order.items[0].laboratoryId, "lab-b");
  assert.equal(order.items[0].laboratoryOfferingId, "offering-1");
  assert.equal(order.items[0].priceAtBooking, "25.00");
  assert.equal(state.updates[2].data.status, "REQUESTED");
  assert.equal(state.updates[2].data.laboratoryId, "lab-b");
  assert.deepEqual(state.updates[3].data, { laboratoryOfferingId: "offering-1", laboratoryId: "lab-b", priceAtBooking: "25.00" });
  assert.equal(state.history[1].data.fromStatus, "AWAITING_LAB_SELECTION");
  assert.equal(state.history[1].data.toStatus, "REQUESTED");
  assert.equal(state.audits[1].data.action, "LABORATORY_SELECTED");
  assert.equal(state.audits[1].data.laboratoryId, "lab-b");
  assert.deepEqual(new Set(state.notifications[1].data.map((item) => item.userId)), new Set(["patient-a", "doctor-a", "lab-staff"]));
  assert.equal(state.queries.some((query) => query.model === "members" && query.where.laboratoryId === "lab-b"), true);
});

test("non-admin cannot verify a laboratory partner", async () => {
  const { updateLaboratoryStatus, state } = await loadActions({ user: { id: "patient-a", clerkUserId: "clerk-a", role: "PATIENT" } });
  await assert.rejects(updateLaboratoryStatus(values([["laboratoryId", "lab-a"], ["status", "VERIFIED"]])), /Unauthorized/);
  assert.equal(state.updates.length, 0);
  assert.equal(state.audits.length, 0);
});

test("admin partner verification records audit and notifies active owners", async () => {
  const { updateLaboratoryStatus, state } = await loadActions({
    user: { id: "admin-a", clerkUserId: "clerk-admin", role: "ADMIN" },
  });
  await updateLaboratoryStatus(values([["laboratoryId", "lab-a"], ["status", "VERIFIED"]]));
  assert.equal(state.updates[0].where.status, "PENDING");
  assert.deepEqual(state.updates[0].data, { status: "VERIFIED", statusReason: null });
  assert.equal(state.audits[0].data.action, "LABORATORY_VERIFIED");
  assert.equal(state.audits[0].data.reason, null);
  assert.equal(state.notifications[0].data[0].userId, "lab-staff");
});

test("admin rejection requires a trimmed nonempty explanation before writing", async () => {
  const { updateLaboratoryStatus, state } = await loadActions({
    user: { id: "admin-a", clerkUserId: "clerk-admin", role: "ADMIN" },
  });
  for (const reason of [undefined, "", "  \t  "]) {
    const fields = [["laboratoryId", "lab-a"], ["status", "REJECTED"]];
    if (reason !== undefined) fields.push(["reason", reason]);
    await assert.rejects(updateLaboratoryStatus(values(fields)), /Rejection reason is invalid/);
  }
  assert.equal(state.updates.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(state.notifications.length, 0);
});

test("admin rejection saves trimmed feedback for the owner and audit trail", async () => {
  const { updateLaboratoryStatus, state } = await loadActions({
    user: { id: "admin-a", clerkUserId: "clerk-admin", role: "ADMIN" },
  });
  await updateLaboratoryStatus(values([["laboratoryId", "lab-a"], ["status", "REJECTED"], ["reason", "  Registration document is unreadable  "]]));
  assert.deepEqual(state.updates[0].data, { status: "REJECTED", statusReason: "Registration document is unreadable" });
  assert.equal(state.audits[0].data.reason, "Registration document is unreadable");
  assert.match(state.notifications[0].data[0].message, /Registration document is unreadable/);
});

test("non-admin cannot reject an application even with a valid reason", async () => {
  const { updateLaboratoryStatus, state } = await loadActions({ user: { id: "patient-a", clerkUserId: "clerk-a", role: "PATIENT" } });
  await assert.rejects(updateLaboratoryStatus(values([["laboratoryId", "lab-a"], ["status", "REJECTED"], ["reason", "Incomplete registration"]])), /Unauthorized/);
  assert.equal(state.updates.length, 0);
  assert.equal(state.audits.length, 0);
});

test("laboratory workspace includes rejection feedback only for its owner", async () => {
  const workspaceFor = async (role) => {
    const membership = {
      id: "membership-a", userId: "lab-member", laboratoryId: "lab-a", role, status: "ACTIVE",
      laboratory: { id: "lab-a", name: "Test lab", status: "REJECTED", statusReason: "Registration document is unreadable" },
    };
    const { getLaboratoryWorkspace } = await loadActions({
      user: { id: "lab-member", clerkUserId: "clerk-member", role: "PATIENT" },
      membership,
      workspaceMemberships: [membership],
    });
    return getLaboratoryWorkspace();
  };
  const ownerWorkspace = await workspaceFor("OWNER");
  const staffWorkspace = await workspaceFor("STAFF");
  assert.equal(ownerWorkspace.selected.statusReason, "Registration document is unreadable");
  assert.equal(ownerWorkspace.memberships[0].laboratory.statusReason, "Registration document is unreadable");
  assert.equal(staffWorkspace.selected.statusReason, null);
  assert.equal(staffWorkspace.memberships[0].laboratory.statusReason, null);
});

test("rejected laboratory owner can submit a new application", async () => {
  const { submitLaboratoryApplication, state } = await loadActions({
    user: { id: "lab-owner", clerkUserId: "clerk-owner", role: "PATIENT" },
    membership: { id: "membership-owner", userId: "lab-owner", laboratoryId: "lab-rejected", role: "OWNER", status: "ACTIVE", laboratory: { id: "lab-rejected", status: "REJECTED" } },
  });
  const result = await submitLaboratoryApplication(values([
    ["resubmissionOfLaboratoryId", "lab-rejected"], ["name", "Updated Lab"], ["legalName", "Updated Laboratory LLC"],
    ["registrationNumber", "REG-UPDATED"], ["contactEmail", "contact@example.test"], ["contactPhone", "123456789"],
    ["address", "1 Clinic Road"], ["city", "Test City"], ["state", "Test State"], ["country", "Test Country"],
  ]));
  assert.equal(result.success, true);
  assert.equal(result.laboratoryId, "laboratory-new");
  assert.equal(state.laboratoryCreates[0].data.name, "Updated Lab");
  assert.deepEqual(state.laboratoryCreates[0].data.memberships.create, { userId: "lab-owner", role: "OWNER", status: "ACTIVE" });
  assert.equal(state.audits[0].data.action, "APPLICATION_SUBMITTED");
});

test("non-owner cannot resubmit a rejected laboratory application", async () => {
  const { submitLaboratoryApplication, state } = await loadActions({
    user: { id: "lab-staff", clerkUserId: "clerk-staff", role: "PATIENT" },
    membership: { id: "membership-staff", userId: "lab-staff", laboratoryId: "lab-rejected", role: "STAFF", status: "ACTIVE", laboratory: { id: "lab-rejected", status: "REJECTED" } },
  });
  await assert.rejects(submitLaboratoryApplication(values([[
    "resubmissionOfLaboratoryId", "lab-rejected"], ["name", "Updated Lab"], ["legalName", "Updated Laboratory LLC"],
    ["registrationNumber", "REG-UPDATED"], ["contactEmail", "contact@example.test"], ["contactPhone", "123456789"],
    ["address", "1 Clinic Road"], ["city", "Test City"], ["state", "Test State"], ["country", "Test Country"],
  ])), /Only the owner of a rejected laboratory application can resubmit it/);
  assert.equal(state.laboratoryCreates.length, 0);
  assert.equal(state.audits.length, 0);
});

test("admin operational overview omits patient identity and clinical content", async () => {
  const { getAdminLaboratoryOverview, state } = await loadActions({
    user: { id: "admin-a", clerkUserId: "clerk-admin", role: "ADMIN" },
  });
  await getAdminLaboratoryOverview();
  const laboratorySelect = state.adminLaboratoryQueries[0].select;
  const orderSelect = state.adminOrderQueries[0].select;
  const auditSelect = state.adminAuditQueries[0].select;
  assert.equal(Object.hasOwn(laboratorySelect, "memberships"), false);
  assert.equal(Object.hasOwn(laboratorySelect, "contactEmail"), false);
  assert.equal(Object.hasOwn(laboratorySelect, "contactPhone"), false);
  assert.equal(Object.hasOwn(orderSelect, "id"), false);
  assert.equal(Object.hasOwn(orderSelect, "patient"), false);
  assert.equal(Object.hasOwn(orderSelect, "clinicalInstructions"), false);
  assert.equal(Object.hasOwn(orderSelect, "items"), false);
  assert.deepEqual(orderSelect._count, { select: { items: true } });
  assert.equal(Object.hasOwn(auditSelect, "id"), false);
  assert.equal(Object.hasOwn(auditSelect, "entityId"), false);
  assert.equal(Object.hasOwn(auditSelect, "reason"), false);
  assert.equal(Object.hasOwn(auditSelect, "actor"), false);
});
