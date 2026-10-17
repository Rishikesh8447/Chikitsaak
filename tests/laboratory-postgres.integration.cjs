// Opt-in real PostgreSQL contract tests. Run only against the guarded .env.lab-test target:
// $env:RUN_LAB_PG_INTEGRATION='1'; node --test tests/laboratory-postgres.integration.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const {
  canTransitionLabOrder,
  canTransitionLaboratory,
  getEligibleLaboratories,
  normalizeCatalogKey,
  normalizeIdList,
  parseMoney,
} = require("../lib/laboratory-workflow.mjs");

class FormValues extends Map {
  getAll(key) { return this.get(`${key}[]`) || []; }
}

function values(entries = []) { return new FormValues(entries); }

const enabled = process.env.RUN_LAB_PG_INTEGRATION === "1";
test("PostgreSQL laboratory workflow database contracts", { skip: !enabled }, async () => {
  const parsed = dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env.lab-test")));
  if (!parsed.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.lab-test");
  process.env.DATABASE_URL = parsed.DATABASE_URL;
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const endpointExpected = "ep-spring-wildflower-ad466s14";
  const roleExpected = "neondb_owner";
  const tag = `lab-it-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const ids = { users: [], labs: [], tests: [], appointments: [], orders: [] };
  const say = (scenario) => console.log(`PostgreSQL integration verified: ${scenario}`);

  function actionsFor(clerkUserId) {
    const db = new Proxy(prisma, {
      get(target, property) {
        if (property === "$transaction") return async (...args) => {
          const started = Date.now();
          try { return await target.$transaction(...args); }
          finally { console.log(`Action transaction duration: ${Date.now() - started}ms`); }
        };
        return Reflect.get(target, property, target);
      },
    });
    const dependencies = {
      auth: async () => ({ userId: clerkUserId }),
      revalidatePath() {},
      db,
      verifyAdmin: async () => (await prisma.user.findUnique({ where: { clerkUserId }, select: { role: true } }))?.role === "ADMIN",
      canTransitionLabOrder,
      canTransitionLaboratory,
      getEligibleLaboratories,
      normalizeCatalogKey,
      normalizeIdList,
      parseMoney,
    };
    const source = fs.readFileSync(path.join(__dirname, "..", "actions", "laboratory.js"), "utf8");
    const transformed = source
      .replaceAll('"use server";', "")
      .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
      .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
      .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
      .replace('import { verifyAdmin } from "@/actions/admin";', "const { verifyAdmin } = dependencies;")
      .replace('import { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } from "@/lib/laboratory-workflow.mjs";', "const { canTransitionLabOrder, canTransitionLaboratory, getEligibleLaboratories, normalizeCatalogKey, normalizeIdList, parseMoney } = dependencies;")
      .replaceAll("export async function", "async function")
      .concat("\nreturn { submitLaboratoryApplication, addLaboratoryMember, updateLaboratoryMember, getLaboratoryWorkspace, getDoctorLabOrderOptions, createDoctorLabOrder, createPatientLabOrder, bookDoctorLabOrder, retryRejectedLabOrder, getMyLabOrders, transitionLabOrder, submitLaboratoryResult, saveLaboratoryOffering, setLaboratoryOfferingAvailability, updateLaboratoryStatus, createLabTest, setLabTestActive, getAdminLaboratoryOverview };");
    return new Function("dependencies", transformed)(dependencies);
  }

  async function verifyTarget() {
    const [identity] = await prisma.$queryRaw`
      SELECT current_database() AS database_name, current_schema() AS schema_name,
             current_user AS role_name, version() AS postgres_version
    `;
    const [privileges] = await prisma.$queryRaw`
      SELECT has_schema_privilege(current_user, 'public', 'USAGE') AS can_use,
             has_schema_privilege(current_user, 'public', 'CREATE') AS can_create
    `;
    const endpoint = new URL(parsed.DATABASE_URL).hostname.split(".")[0];
    assert.equal(endpoint, endpointExpected, "explicit test endpoint");
    assert.equal(identity.database_name, "chikitsaak");
    assert.equal(identity.schema_name, "public");
    assert.equal(identity.role_name, roleExpected);
    assert.match(identity.postgres_version, /^PostgreSQL 18\./);
    assert.equal(privileges.can_use, true);
    assert.equal(privileges.can_create, true);
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `;
    assert.equal(tables.filter(({ table_name }) => table_name !== "_prisma_migrations").length, 18);
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM "_prisma_migrations" ORDER BY started_at
    `;
    const names = ["000000000000_baseline", "20261012000000_laboratory_workflow"];
    const succeeded = migrations.filter((row) => row.finished_at !== null && row.rolled_back_at === null);
    assert.equal(succeeded.length, 2);
    for (const name of names) assert.equal(succeeded.filter((row) => row.migration_name === name).length, 1);
    const other = migrations.filter((row) => !(row.finished_at !== null && row.rolled_back_at === null));
    assert.ok(other.every((row) => row.migration_name === "000000000000_baseline" && row.finished_at === null && row.rolled_back_at !== null && row.applied_steps_count === 0));
    assert.ok(other.length <= 1);
    console.log(`Integration target verified: ${endpoint}, chikitsaak/public, PostgreSQL 18, role neondb_owner; expected migrations applied.`);
  }

  async function cleanup() {
    if (ids.orders.length) {
      await prisma.labOrderItem.deleteMany({ where: { labOrderId: { in: ids.orders } } });
      await prisma.labOrderStatusHistory.deleteMany({ where: { labOrderId: { in: ids.orders } } });
      await prisma.labOrder.deleteMany({ where: { id: { in: ids.orders } } });
    }
    if (ids.appointments.length) await prisma.appointment.deleteMany({ where: { id: { in: ids.appointments } } });
    if (ids.users.length) {
      await prisma.notification.deleteMany({ where: { userId: { in: ids.users } } });
      await prisma.laboratoryAuditEvent.deleteMany({ where: { actorUserId: { in: ids.users } } });
      await prisma.labOrderStatusHistory.deleteMany({ where: { actorUserId: { in: ids.users } } });
      await prisma.laboratoryMembership.deleteMany({ where: { userId: { in: ids.users } } });
    }
    if (ids.labs.length) {
      await prisma.laboratoryAuditEvent.deleteMany({ where: { laboratoryId: { in: ids.labs } } });
      await prisma.laboratoryOffering.deleteMany({ where: { laboratoryId: { in: ids.labs } } });
      await prisma.laboratoryMembership.deleteMany({ where: { laboratoryId: { in: ids.labs } } });
      await prisma.laboratory.deleteMany({ where: { id: { in: ids.labs } } });
    }
    if (ids.tests.length) await prisma.labTest.deleteMany({ where: { id: { in: ids.tests } } });
    if (ids.users.length) await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  }

  try {
    await verifyTarget();
    const roles = [["ADMIN", null], ["DOCTOR", "VERIFIED"], ["PATIENT", null], ["UNASSIGNED", null], ["UNASSIGNED", null], ["PATIENT", null], ["UNASSIGNED", null], ["UNASSIGNED", null], ["DOCTOR", "VERIFIED"]];
    const users = [];
    for (const [index, [role, verificationStatus]] of roles.entries()) {
      const user = await prisma.user.create({ data: {
        clerkUserId: `${tag}-clerk-${index}`, email: `${tag}-${index}@example.invalid`, name: `${tag} ${index}`, role, verificationStatus,
      } });
      users.push(user);
      ids.users.push(user.id);
    }
    const [admin, doctor, patient, owner, staff, otherPatient, applicant, rejectedApplicant, unauthorizedDoctor] = users;

    const labA = await prisma.laboratory.create({ data: {
      name: `${tag} Lab A`, legalName: `${tag} Laboratory A`, registrationNumber: `${tag}-REG-A`, registrationNumberNormalized: "deliberately-wrong",
      contactEmail: `${tag}-a@example.invalid`, contactPhone: "0000000000", address: "Test address", city: "Test city", state: "Test state", country: "Test country",
      memberships: { create: [{ userId: owner.id, role: "OWNER" }, { userId: staff.id, role: "STAFF" }] },
    } });
    ids.labs.push(labA.id);
    const labB = await prisma.laboratory.create({ data: {
      name: `${tag} Lab B`, legalName: `${tag} Laboratory B`, registrationNumber: `${tag}-REG-B`, registrationNumberNormalized: "also-wrong",
      contactEmail: `${tag}-b@example.invalid`, contactPhone: "0000000000", address: "Test address", city: "Test city", state: "Test state", country: "Test country",
    } });
    ids.labs.push(labB.id);
    await prisma.laboratory.update({ where: { id: labA.id }, data: { registrationNumber: `  ${tag}-REG-A-UPDATED  `, registrationNumberNormalized: "bad-update-key", status: "VERIFIED" } });
    await prisma.laboratory.update({ where: { id: labB.id }, data: { status: "VERIFIED" } });
    const normalizedLab = await prisma.laboratory.findUnique({ where: { id: labA.id }, select: { registrationNumber: true, registrationNumberNormalized: true } });
    assert.equal(normalizedLab.registrationNumberNormalized, normalizedLab.registrationNumber.trim().toLowerCase());
    await prisma.laboratoryMembership.update({ where: { laboratoryId_userId: { laboratoryId: labA.id, userId: staff.id } }, data: { role: "MANAGER" } });
    await prisma.laboratoryMembership.update({ where: { laboratoryId_userId: { laboratoryId: labA.id, userId: staff.id } }, data: { status: "REVOKED" } });
    await prisma.laboratoryMembership.update({ where: { laboratoryId_userId: { laboratoryId: labA.id, userId: staff.id } }, data: { status: "ACTIVE" } });
    await prisma.laboratory.update({ where: { id: labB.id }, data: { status: "SUSPENDED" } });
    await prisma.laboratory.update({ where: { id: labB.id }, data: { status: "VERIFIED" } });
    say("organization create/update, membership role/status, and lab status persistence");

    const applicationForm = (name, registrationNumber) => values([
      ["name", name], ["legalName", `${name} Legal`], ["registrationNumber", registrationNumber],
      ["contactEmail", `${tag}-application@example.invalid`], ["contactPhone", "0000000000"], ["address", "Synthetic address"],
      ["city", "Test city"], ["state", "Test state"], ["country", "Test country"],
    ]);
    const applicationActions = actionsFor(applicant.clerkUserId);
    const application = await applicationActions.submitLaboratoryApplication(applicationForm(`${tag} Application Lab`, `${tag}-APP`));
    ids.labs.push(application.laboratoryId);
    const reviewActions = actionsFor(admin.clerkUserId);
    await reviewActions.updateLaboratoryStatus(values([["laboratoryId", application.laboratoryId], ["status", "VERIFIED"], ["reason", "Synthetic integration review"]]));
    await reviewActions.updateLaboratoryStatus(values([["laboratoryId", application.laboratoryId], ["status", "SUSPENDED"], ["reason", "Synthetic integration suspension"]]));
    await reviewActions.updateLaboratoryStatus(values([["laboratoryId", application.laboratoryId], ["status", "VERIFIED"], ["reason", "Synthetic reactivation"]]));
    await applicationActions.addLaboratoryMember(values([["laboratoryId", application.laboratoryId], ["email", otherPatient.email], ["role", "MANAGER"]]));
    const member = await prisma.laboratoryMembership.findUnique({ where: { laboratoryId_userId: { laboratoryId: application.laboratoryId, userId: otherPatient.id } } });
    const applicantOwnerActions = actionsFor(applicant.clerkUserId);
    await applicantOwnerActions.updateLaboratoryMember(values([["laboratoryId", application.laboratoryId], ["membershipId", member.id], ["action", "change-role"], ["role", "STAFF"]]));
    await applicantOwnerActions.updateLaboratoryMember(values([["laboratoryId", application.laboratoryId], ["membershipId", member.id], ["action", "revoke"], ["role", "STAFF"]]));
    await applicantOwnerActions.addLaboratoryMember(values([["laboratoryId", application.laboratoryId], ["email", otherPatient.email], ["role", "MANAGER"]]));
    assert.equal((await prisma.laboratoryMembership.findUnique({ where: { laboratoryId_userId: { laboratoryId: application.laboratoryId, userId: otherPatient.id } } })).status, "ACTIVE");
    const rejectedApplication = await actionsFor(rejectedApplicant.clerkUserId).submitLaboratoryApplication(applicationForm(`${tag} Rejected Lab`, `${tag}-REJ`));
    ids.labs.push(rejectedApplication.laboratoryId);
    await reviewActions.updateLaboratoryStatus(values([["laboratoryId", rejectedApplication.laboratoryId], ["status", "REJECTED"], ["reason", "Synthetic rejection test"]]));
    assert.equal((await prisma.laboratory.findUnique({ where: { id: rejectedApplication.laboratoryId }, select: { status: true } })).status, "REJECTED");
    say("real server actions: application submission, admin verify/reject/suspend/reactivate, and member role/revoke/reactivate");

    const catalogActions = actionsFor(admin.clerkUserId);
    const createdTest = await catalogActions.createLabTest(values([["name", `  ${tag} CBC  `], ["code", `${tag}-CBC`]]));
    const labTest = await prisma.labTest.findUnique({ where: { id: createdTest.testId } });
    ids.tests.push(labTest.id);
    await prisma.labTest.update({ where: { id: labTest.id }, data: { name: ` ${tag} cBc updated `, normalizedName: "wrong-update" } });
    const normalizedTest = await prisma.labTest.findUnique({ where: { id: labTest.id }, select: { name: true, normalizedName: true } });
    assert.equal(normalizedTest.normalizedName, normalizedTest.name.trim().toLowerCase());
    await assert.rejects(prisma.labTest.create({ data: { name: normalizedTest.name.toUpperCase(), normalizedName: "whatever", code: `${tag}-DUP` } }));
    await prisma.laboratoryMembership.create({ data: { laboratoryId: labB.id, userId: owner.id, role: "OWNER" } });
    const ownerActions = actionsFor(owner.clerkUserId);
    const offeringForm = (laboratoryId, price, preparationInstructions, estimatedHours) => values([
      ["laboratoryId", laboratoryId], ["labTestId", labTest.id], ["price", price],
      ["preparationInstructions", preparationInstructions], ["estimatedHours", String(estimatedHours)],
    ]);
    await ownerActions.saveLaboratoryOffering(offeringForm(labA.id, "34.50", "Fast for 8 hours", 24));
    await ownerActions.saveLaboratoryOffering(offeringForm(labB.id, "41.25", "Bring ID", 48));
    const offerA = await prisma.laboratoryOffering.findUnique({ where: { laboratoryId_labTestId: { laboratoryId: labA.id, labTestId: labTest.id } } });
    const offerB = await prisma.laboratoryOffering.findUnique({ where: { laboratoryId_labTestId: { laboratoryId: labB.id, labTestId: labTest.id } } });
    await assert.rejects(prisma.laboratoryOffering.create({ data: { laboratoryId: labA.id, labTestId: labTest.id, price: "1.00" } }));
    await ownerActions.saveLaboratoryOffering(offeringForm(labA.id, "35.00", "Fast for 8 hours", 24));
    await ownerActions.setLaboratoryOfferingAvailability(values([["laboratoryId", labA.id], ["offeringId", offerA.id], ["available", "false"]]));
    await ownerActions.setLaboratoryOfferingAvailability(values([["laboratoryId", labA.id], ["offeringId", offerA.id], ["available", "true"]]));
    const updatedOfferA = await prisma.laboratoryOffering.findUnique({ where: { id: offerA.id } });
    assert.equal(updatedOfferA.price.toFixed(2), "35.00");
    say("database normalization triggers, case-insensitive duplicate prevention, and offering CRUD");

    const appointment = await prisma.appointment.create({ data: {
      doctorId: doctor.id, patientId: patient.id, startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 60_000), status: "CONFIRMED",
    } });
    ids.appointments.push(appointment.id);
    const doctorActions = actionsFor(doctor.clerkUserId);
    const doctorOptions = await doctorActions.getDoctorLabOrderOptions();
    assert.ok(doctorOptions.appointments.some(({ id }) => id === appointment.id));
    assert.ok(doctorOptions.tests.some(({ id }) => id === labTest.id));
    await assert.rejects(actionsFor(unauthorizedDoctor.clerkUserId).createDoctorLabOrder(values([["appointmentId", appointment.id], ["labTestIds[]", [labTest.id]]])), /Choose a patient from one of your active or completed appointments/);
    const doctorOrderResult = await doctorActions.createDoctorLabOrder(values([
      ["appointmentId", appointment.id], ["labTestIds[]", [labTest.id]], ["clinicalInstructions", "Synthetic clinical instruction"], ["patientId", otherPatient.id],
    ]));
    const doctorOrder = await prisma.labOrder.findUnique({ where: { id: doctorOrderResult.orderId }, include: { items: true } });
    ids.orders.push(doctorOrder.id);
    assert.equal(doctorOrder.items[0].laboratoryId, null);
    assert.equal(doctorOrder.patientId, patient.id);
    assert.equal(doctorOrder.doctorId, doctor.id);
    assert.equal(doctorOrder.appointmentId, appointment.id);
    assert.equal(doctorOrder.clinicalInstructions, "Synthetic clinical instruction");
    const patientActions = actionsFor(patient.clerkUserId);
    await assert.rejects(actionsFor(otherPatient.clerkUserId).bookDoctorLabOrder(values([["labOrderId", doctorOrder.id], ["laboratoryId", labA.id]])), /Test order is unavailable/);
    await patientActions.bookDoctorLabOrder(values([["labOrderId", doctorOrder.id], ["laboratoryId", labA.id]]));
    const labActions = actionsFor(staff.clerkUserId);
    await assert.rejects(labActions.submitLaboratoryResult(values([["laboratoryId", labA.id], ["labOrderId", doctorOrder.id], ["result", "Premature result"]])), /only be submitted after the sample is collected/);
    await assert.rejects(ownerActions.submitLaboratoryResult(values([["laboratoryId", labB.id], ["labOrderId", doctorOrder.id], ["result", "Wrong laboratory"]])), /Laboratory order not found/);
    await labActions.transitionLabOrder(values([["laboratoryId", labA.id], ["labOrderId", doctorOrder.id], ["action", "accept"]]));
    const collectionAt = new Date(Date.now() + 60 * 60_000).toISOString();
    await labActions.transitionLabOrder(values([["laboratoryId", labA.id], ["labOrderId", doctorOrder.id], ["action", "schedule"], ["collectionAt", collectionAt], ["collectionNotes", "Synthetic collection"]]));
    await labActions.transitionLabOrder(values([["laboratoryId", labA.id], ["labOrderId", doctorOrder.id], ["action", "collect"]]));
    const completedOrder = await prisma.labOrder.findUnique({ where: { id: doctorOrder.id }, include: { items: true, statusHistory: { orderBy: { createdAt: "asc" } } } });
    assert.deepEqual(completedOrder.statusHistory.slice(-4).map(({ toStatus }) => toStatus), ["AWAITING_LAB_SELECTION", "REQUESTED", "ACCEPTED", "COLLECTION_SCHEDULED", "COLLECTED"].slice(-4));
    assert.equal(completedOrder.collectionAt.toISOString(), collectionAt);
    assert.ok(await prisma.notification.count({ where: { dedupeKey: { startsWith: `lab-order:${doctorOrder.id}:` } } }) >= 3);
    say("real server actions: doctor appointment ownership despite forged patient ID, patient order ownership, selection, fulfilment lifecycle, history, and notifications");

    await labActions.submitLaboratoryResult(values([["laboratoryId", labA.id], ["labOrderId", doctorOrder.id], ["result", "Synthetic CBC result: within reference range"]]));
    const resultHistory = await prisma.labOrderStatusHistory.findFirst({ where: { labOrderId: doctorOrder.id, toStatus: "COLLECTED", note: { startsWith: "Laboratory result: " } } });
    assert.equal(resultHistory.note, "Laboratory result: Synthetic CBC result: within reference range");
    assert.equal(resultHistory.actorUserId, staff.id);
    assert.equal(resultHistory.membershipId, (await prisma.laboratoryMembership.findUnique({ where: { laboratoryId_userId: { laboratoryId: labA.id, userId: staff.id } } })).id);
    await assert.rejects(labActions.submitLaboratoryResult(values([["laboratoryId", labA.id], ["labOrderId", doctorOrder.id], ["result", "Duplicate result"]])), /already been submitted/);
    const resultAudit = await prisma.laboratoryAuditEvent.findFirst({ where: { entityId: doctorOrder.id, action: "ORDER_RESULT_SUBMITTED" } });
    assert.equal(resultAudit.actorUserId, staff.id);
    assert.equal(resultAudit.laboratoryId, labA.id);
    const resultNotifications = await prisma.notification.findMany({ where: { dedupeKey: { startsWith: `lab-order:${doctorOrder.id}:result-` } }, select: { userId: true } });
    assert.deepEqual(new Set(resultNotifications.map(({ userId }) => userId)), new Set([patient.id, doctor.id, owner.id, staff.id]));
    assert.equal((await prisma.labOrder.findUnique({ where: { id: doctorOrder.id }, select: { status: true } })).status, "COLLECTED");
    say("real server action: collected result persistence, duplicate and cross-lab rejection, audit, and participant notifications");

    await assert.rejects(prisma.$transaction(async (tx) => {
      const invalid = await tx.labOrder.create({ data: {
        patientId: otherPatient.id, doctorId: doctor.id, appointmentId: appointment.id, source: "DOCTOR", status: "AWAITING_LAB_SELECTION",
        items: { create: { labTestId: labTest.id, testName: normalizedTest.name } },
      } });
      ids.orders.push(invalid.id);
    }));
    await assert.rejects(prisma.$transaction(async (tx) => {
      const invalid = await tx.labOrder.create({ data: {
        patientId: patient.id, doctorId: unauthorizedDoctor.id, appointmentId: appointment.id, source: "DOCTOR", status: "AWAITING_LAB_SELECTION",
        items: { create: { labTestId: labTest.id, testName: normalizedTest.name } },
      } });
      ids.orders.push(invalid.id);
    }));
    say("deferred trigger rejects doctor order with mismatched appointment patient");

    const reassignmentResult = await doctorActions.createDoctorLabOrder(values([["appointmentId", appointment.id], ["labTestIds[]", [labTest.id]]]));
    const reassignmentOrderId = reassignmentResult.orderId;
    ids.orders.push(reassignmentOrderId);
    await patientActions.bookDoctorLabOrder(values([["labOrderId", reassignmentOrderId], ["laboratoryId", labA.id]]));
    await labActions.transitionLabOrder(values([["laboratoryId", labA.id], ["labOrderId", reassignmentOrderId], ["action", "reject"], ["collectionNotes", "Synthetic rejection"]]));
    await patientActions.retryRejectedLabOrder(values([["labOrderId", reassignmentOrderId]]));
    const reopenedOrder = await prisma.labOrder.findUnique({ where: { id: reassignmentOrderId }, include: { items: true } });
    assert.equal(reopenedOrder.laboratoryId, null);
    assert.equal(reopenedOrder.items[0].laboratoryId, null);
    assert.equal(reopenedOrder.items[0].laboratoryOfferingId, null);
    assert.equal(reopenedOrder.items[0].priceAtBooking, null);
    await patientActions.bookDoctorLabOrder(values([["labOrderId", reassignmentOrderId], ["laboratoryId", labB.id]]));
    const reassigned = await prisma.labOrder.findUnique({ where: { id: reassignmentOrderId }, include: { items: true, statusHistory: { orderBy: { createdAt: "asc" } } } });
    assert.equal(reassigned.laboratoryId, labB.id);
    assert.equal(reassigned.items[0].laboratoryId, labB.id);
    assert.equal(reassigned.items[0].laboratoryOfferingId, offerB.id);
    assert.equal(reassigned.items[0].priceAtBooking.toFixed(2), "41.25");
    assert.deepEqual(reassigned.statusHistory.slice(-4).map(({ toStatus }) => toStatus), ["REQUESTED", "REJECTED", "AWAITING_LAB_SELECTION", "REQUESTED"]);
    assert.ok(await prisma.laboratoryAuditEvent.count({ where: { entityId: reassignmentOrderId } }) >= 4);
    assert.ok(await prisma.notification.count({ where: { dedupeKey: { startsWith: `lab-order:${reassignmentOrderId}:` } } }) >= 6);
    say("real server actions: rejection reset, cleared item assignment, reassignment to Lab B, status history, audits, and notifications");

    const patientOrderResult = await patientActions.createPatientLabOrder(values([
      ["laboratoryId", labA.id], ["offeringIds[]", [offerA.id]], ["clinicalInstructions", "Synthetic patient booking"],
    ]));
    const patientOrder = await prisma.labOrder.findUnique({ where: { id: patientOrderResult.orderId }, include: { items: true } });
    ids.orders.push(patientOrder.id);
    assert.equal(patientOrder.doctorId, null);
    assert.equal(patientOrder.appointmentId, null);
    assert.equal(patientOrder.items[0].priceAtBooking.toFixed(2), "35.00");
    const myOrders = await patientActions.getMyLabOrders();
    assert.ok(myOrders.orders.some(({ id }) => id === patientOrder.id));
    assert.equal(myOrders.orders.some(({ patientId }) => patientId === otherPatient.id), false);
    const labWorkspace = await labActions.getLaboratoryWorkspace(labA.id);
    assert.ok(labWorkspace.orders.every(({ laboratoryId }) => laboratoryId === labA.id));
    await assert.rejects(labActions.transitionLabOrder(values([["laboratoryId", labB.id], ["labOrderId", reassignmentOrderId], ["action", "accept"]])), /Laboratory membership required/);
    await assert.rejects(actionsFor(patient.clerkUserId).updateLaboratoryStatus(values([["laboratoryId", labA.id], ["status", "SUSPENDED"]])), /Unauthorized/);
    const adminOverview = await reviewActions.getAdminLaboratoryOverview();
    assert.ok(adminOverview.orders.every((order) => !("id" in order) && !("patient" in order) && !("items" in order) && !("clinicalInstructions" in order)));
    assert.ok(adminOverview.auditEvents.every((event) => !("entityId" in event) && !("actor" in event)));
    say("real server actions: patient self-booking/ownership, lab organization isolation, and minimized admin response fields");

    const duplicateNotification = { userId: patient.id, type: "LAB_ORDER_UPDATE", title: "Deduplication test", message: "Synthetic test", dedupeKey: `${tag}:dedupe` };
    const firstNotification = await prisma.notification.createMany({ data: [duplicateNotification], skipDuplicates: true });
    const duplicateNotificationResult = await prisma.notification.createMany({ data: [duplicateNotification], skipDuplicates: true });
    assert.equal(firstNotification.count, 1);
    assert.equal(duplicateNotificationResult.count, 0);
    say("notification dedupe key safely suppresses duplicate notification requests");

    const raceResults = await Promise.allSettled([
      prisma.$transaction(async (tx) => (await tx.labOrder.updateMany({ where: { id: patientOrder.id, status: "REQUESTED" }, data: { status: "ACCEPTED" } })).count, { isolationLevel: "Serializable" }),
      prisma.$transaction(async (tx) => (await tx.labOrder.updateMany({ where: { id: patientOrder.id, status: "REQUESTED" }, data: { status: "REJECTED" } })).count, { isolationLevel: "Serializable" }),
    ]);
    const winners = raceResults.filter((result) => result.status === "fulfilled" && result.value === 1);
    assert.equal(winners.length, 1);
    const raceOrder = await prisma.labOrder.findUnique({ where: { id: patientOrder.id }, select: { status: true } });
    assert.ok(["ACCEPTED", "REJECTED"].includes(raceOrder.status));
    say("concurrent conditional status updates have a single database winner");

    for (const mask of [1, 2, 3, 4, 5, 6]) {
      const parent = await prisma.labOrder.create({ data: { patientId: patient.id, laboratoryId: labA.id, source: "PATIENT", status: "REQUESTED" } });
      ids.orders.push(parent.id);
      const fields = {};
      if (mask & 1) fields.laboratoryId = labA.id;
      if (mask & 2) fields.laboratoryOfferingId = offerA.id;
      if (mask & 4) fields.priceAtBooking = "35.00";
      await assert.rejects(prisma.labOrderItem.create({ data: { labOrderId: parent.id, labTestId: labTest.id, testName: normalizedTest.name, ...fields } }), undefined, `partial assignment mask ${mask} rejected`);
    }
    const mismatchedParent = await prisma.labOrder.create({ data: { patientId: patient.id, laboratoryId: labA.id, source: "PATIENT", status: "REQUESTED" } });
    ids.orders.push(mismatchedParent.id);
    await assert.rejects(prisma.labOrderItem.create({ data: { labOrderId: mismatchedParent.id, labTestId: labTest.id, testName: normalizedTest.name } }));
    const crossParent = await prisma.labOrder.create({ data: { patientId: patient.id, laboratoryId: labA.id, source: "PATIENT", status: "REQUESTED" } });
    ids.orders.push(crossParent.id);
    await assert.rejects(prisma.labOrderItem.create({ data: { labOrderId: crossParent.id, labTestId: labTest.id, laboratoryId: labB.id, laboratoryOfferingId: offerB.id, priceAtBooking: offerB.price, testName: normalizedTest.name } }));
    say("all six partial assignment tuples, assigned-parent/all-null mismatch, and cross-lab offering mismatch rejected");

    const rollbackBefore = await prisma.labOrder.findUnique({ where: { id: patientOrder.id }, select: { status: true } });
    const auditsBefore = await prisma.laboratoryAuditEvent.count({ where: { entityId: patientOrder.id } });
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.labOrder.update({ where: { id: patientOrder.id }, data: { status: "COLLECTED" } });
      await tx.laboratoryAuditEvent.create({ data: { actorUserId: owner.id, laboratoryId: labA.id, entityType: "LabOrder", entityId: patientOrder.id, action: "SHOULD_ROLL_BACK" } });
      await tx.notification.create({ data: { userId: `${tag}-missing-user`, type: "LAB_ORDER_UPDATE", title: "Fail", message: "Force FK rollback", dedupeKey: `${tag}:rollback-failure` } });
    }));
    const rollbackAfter = await prisma.labOrder.findUnique({ where: { id: patientOrder.id }, select: { status: true } });
    assert.deepEqual(rollbackAfter, rollbackBefore);
    assert.equal(await prisma.laboratoryAuditEvent.count({ where: { entityId: patientOrder.id } }), auditsBefore);
    say("real PostgreSQL transaction rolled back order and audit writes after notification FK failure");

    await assert.rejects(prisma.appointment.delete({ where: { id: appointment.id } }));
    say("appointment deletion is restricted while doctor-order provenance references it");
  } finally {
    try {
      await cleanup();
    } finally {
      await prisma.$disconnect();
    }
  }
});
