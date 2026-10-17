"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { verifyAdmin } from "@/actions/admin";
import { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey } from "@/lib/pharmacy-workflow.mjs";

const transactionOptions = { isolationLevel: "Serializable", timeout: 15_000 };

async function currentUser(tx = db) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  const user = await tx.user.findUnique({ where: { clerkUserId: userId } });
  if (!user) throw new Error("User not found");
  return user;
}

async function currentAdmin() {
  if (!(await verifyAdmin())) throw new Error("Unauthorized");
  const user = await currentUser();
  if (user.role !== "ADMIN") throw new Error("Unauthorized");
  return user;
}

function field(formData, key, label, maxLength, required = true) {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  if ((!value && required) || value.length > maxLength) throw new Error(`${label} is invalid`);
  return value || null;
}

async function membershipFor(tx, userId, pharmacyId, roles = ["OWNER", "MANAGER", "STAFF"]) {
  if (typeof pharmacyId !== "string" || !pharmacyId) throw new Error("Pharmacy is required");
  const membership = await tx.pharmacyMembership.findFirst({
    where: { pharmacyId, userId, status: "ACTIVE", role: { in: roles } },
    include: { pharmacy: true },
  });
  if (!membership) throw new Error("Active pharmacy membership required");
  return membership;
}

async function verifiedMembershipFor(tx, userId, pharmacyId, roles = ["OWNER", "MANAGER"]) {
  const membership = await membershipFor(tx, userId, pharmacyId, roles);
  if (!canManagePharmacy({ userId, pharmacyId, membership })) throw new Error("A verified pharmacy and authorized membership are required");
  return membership;
}

function audit(tx, data) {
  return tx.pharmacyAuditEvent.create({ data });
}

export async function submitPharmacyApplication(formData) {
  const user = await currentUser();
  if (user.role === "ADMIN") throw new Error("Administrators cannot apply as pharmacy partners");
  const resubmissionId = field(formData, "resubmissionOfPharmacyId", "Rejected application", 100, false);
  const data = {
    name: field(formData, "name", "Pharmacy name", 160),
    legalName: field(formData, "legalName", "Legal name", 200),
    licenseNumber: field(formData, "licenseNumber", "Pharmacy license number", 100),
    contactEmail: field(formData, "contactEmail", "Contact email", 254),
    contactPhone: field(formData, "contactPhone", "Contact phone", 40),
    address: field(formData, "address", "Address", 500),
    city: field(formData, "city", "City", 100),
    state: field(formData, "state", "State", 100),
    country: field(formData, "country", "Country", 100),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) throw new Error("Enter a valid contact email");
  const licenseNumberNormalized = normalizeLicenseKey(data.licenseNumber);
  if (!licenseNumberNormalized) throw new Error("Pharmacy license number is required");

  const pharmacy = await db.$transaction(async (tx) => {
    const currentMembership = await tx.pharmacyMembership.findFirst({
      where: { userId: user.id, status: "ACTIVE", pharmacy: { is: { status: { in: ["PENDING", "VERIFIED", "SUSPENDED"] } } } },
      select: { id: true },
    });
    if (currentMembership) throw new Error("You already belong to a pending or active pharmacy");
    if (resubmissionId) {
      const rejected = await tx.pharmacyMembership.findFirst({
        where: { userId: user.id, pharmacyId: resubmissionId, role: "OWNER", status: "ACTIVE", pharmacy: { is: { status: "REJECTED" } } },
        select: { id: true },
      });
      if (!rejected) throw new Error("Only the owner of a rejected pharmacy application can resubmit it");
    } else {
      const rejected = await tx.pharmacyMembership.findFirst({ where: { userId: user.id, status: "ACTIVE", pharmacy: { is: { status: "REJECTED" } } }, select: { id: true } });
      if (rejected) throw new Error("Select the rejected pharmacy application to resubmit");
    }
    let pharmacy;
    if (resubmissionId) {
      pharmacy = await tx.pharmacy.update({ where: { id: resubmissionId }, data: { ...data, licenseNumberNormalized, status: "PENDING", statusReason: null } });
    } else {
      pharmacy = await tx.pharmacy.create({ data: { ...data, licenseNumberNormalized, memberships: { create: { userId: user.id, role: "OWNER", status: "ACTIVE" } } } });
    }
    await audit(tx, { actorUserId: user.id, pharmacyId: pharmacy.id, entityId: pharmacy.id, action: resubmissionId ? "APPLICATION_RESUBMITTED" : "APPLICATION_SUBMITTED", fromStatus: resubmissionId ? "REJECTED" : null, toStatus: "PENDING" });
    return pharmacy;
  }, transactionOptions);
  revalidatePath("/pharmacy");
  revalidatePath("/pharmacy/workspace");
  revalidatePath("/admin/pharmacy");
  return { success: true, pharmacyId: pharmacy.id };
}

export async function getPharmacyWorkspace(pharmacyId) {
  const user = await currentUser();
  const memberships = await db.pharmacyMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { id: true, pharmacyId: true, role: true, pharmacy: { select: { id: true, name: true, status: true, statusReason: true, city: true, state: true, country: true } } },
    orderBy: { createdAt: "asc" },
  });
  const selectedMembership = pharmacyId ? memberships.find((entry) => entry.pharmacyId === pharmacyId) : memberships[0];
  if (!selectedMembership) return { selected: null, memberships: [] };
  const verified = selectedMembership.pharmacy.status === "VERIFIED";
  const isOwner = selectedMembership.role === "OWNER";
  const [products, auditEvents, team] = await Promise.all([
    verified ? db.pharmacyProduct.findMany({ where: { pharmacyId: selectedMembership.pharmacyId }, orderBy: { name: "asc" }, take: 200 }) : [],
    verified ? db.pharmacyAuditEvent.findMany({ where: { pharmacyId: selectedMembership.pharmacyId }, select: { action: true, fromStatus: true, toStatus: true, ...(isOwner ? { reason: true } : {}), createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }) : [],
    selectedMembership.role === "OWNER" && verified ? db.pharmacyMembership.findMany({ where: { pharmacyId: selectedMembership.pharmacyId, status: "ACTIVE" }, select: { id: true, role: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  return {
    selected: { ...selectedMembership.pharmacy, statusReason: isOwner ? selectedMembership.pharmacy.statusReason : null, membershipRole: selectedMembership.role },
    memberships: memberships.map((membership) => ({ ...membership, pharmacy: { ...membership.pharmacy, statusReason: membership.role === "OWNER" ? membership.pharmacy.statusReason : null } })),
    products,
    auditEvents,
    team,
  };
}

export async function addPharmacyMember(formData) {
  const user = await currentUser();
  const pharmacyId = field(formData, "pharmacyId", "Pharmacy", 100);
  const email = field(formData, "email", "Member email", 254).normalize("NFKC").toLowerCase();
  const role = field(formData, "role", "Role", 20);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["MANAGER", "STAFF"].includes(role)) throw new Error("Member details are invalid");
  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, pharmacyId, ["OWNER"]);
    const target = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (!target) throw new Error("The member must create a Chikitsaak account before being added");
    if (target.id === user.id) throw new Error("The owner is already a member");
    const existing = await tx.pharmacyMembership.findUnique({ where: { pharmacyId_userId: { pharmacyId, userId: target.id } } });
    if (existing?.status === "ACTIVE") throw new Error("This user is already a member");
    if (existing) await tx.pharmacyMembership.update({ where: { id: existing.id }, data: { status: "ACTIVE", role } });
    else await tx.pharmacyMembership.create({ data: { pharmacyId, userId: target.id, role, status: "ACTIVE" } });
    await audit(tx, { actorUserId: user.id, pharmacyId, entityId: target.id, action: "MEMBER_ADDED", toStatus: role });
  }, transactionOptions);
  revalidatePath("/pharmacy/workspace");
  return { success: true };
}

export async function updatePharmacyMember(formData) {
  const user = await currentUser();
  const pharmacyId = field(formData, "pharmacyId", "Pharmacy", 100);
  const membershipId = field(formData, "membershipId", "Membership", 100);
  const action = field(formData, "action", "Action", 20);
  const role = field(formData, "role", "Role", 20, action !== "revoke");
  if (!["change-role", "revoke"].includes(action) || (action === "change-role" && !["MANAGER", "STAFF"].includes(role))) throw new Error("Membership action is invalid");
  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, pharmacyId, ["OWNER"]);
    const membership = await tx.pharmacyMembership.findFirst({ where: { id: membershipId, pharmacyId, status: "ACTIVE", role: { in: ["MANAGER", "STAFF"] } } });
    if (!membership) throw new Error("Active pharmacy member not found");
    const updated = await tx.pharmacyMembership.updateMany({ where: { id: membershipId, pharmacyId, status: "ACTIVE" }, data: action === "revoke" ? { status: "REVOKED" } : { role } });
    if (updated.count !== 1) throw new Error("Pharmacy membership changed; refresh and try again");
    await audit(tx, { actorUserId: user.id, pharmacyId, entityId: membership.userId, action: action === "revoke" ? "MEMBER_REVOKED" : "MEMBER_ROLE_CHANGED", fromStatus: membership.role, toStatus: action === "revoke" ? "REVOKED" : role });
  }, transactionOptions);
  revalidatePath("/pharmacy/workspace");
  return { success: true };
}

export async function savePharmacyProduct(formData) {
  const user = await currentUser();
  const pharmacyId = field(formData, "pharmacyId", "Pharmacy", 100);
  const productId = field(formData, "productId", "Product", 100, false);
  const name = field(formData, "name", "Product name", 160);
  const description = field(formData, "description", "Description", 1000, false);
  const priceText = field(formData, "price", "Price", 20);
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(priceText)) throw new Error("Enter a non-negative price with up to two decimal places");
  const price = Number(priceText);
  if (!Number.isFinite(price) || price > 99_999_999.99) throw new Error("Price is invalid");

  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, pharmacyId);
    if (productId) {
      const changed = await tx.pharmacyProduct.updateMany({ where: { id: productId, pharmacyId }, data: { name, description, price } });
      if (changed.count !== 1) throw new Error("Product does not belong to this pharmacy");
      await audit(tx, { actorUserId: user.id, pharmacyId, entityId: productId, action: "PRODUCT_UPDATED" });
    } else {
      const product = await tx.pharmacyProduct.create({ data: { pharmacyId, name, description, price } });
      await audit(tx, { actorUserId: user.id, pharmacyId, entityId: product.id, action: "PRODUCT_CREATED" });
    }
  }, transactionOptions);
  revalidatePath("/pharmacy/workspace");
  return { success: true };
}

export async function setPharmacyProductAvailability(formData) {
  const user = await currentUser();
  const pharmacyId = field(formData, "pharmacyId", "Pharmacy", 100);
  const productId = field(formData, "productId", "Product", 100);
  const availableValue = formData.get("available");
  if (availableValue !== "true" && availableValue !== "false") throw new Error("Product availability is invalid");
  const available = availableValue === "true";
  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, pharmacyId);
    const changed = await tx.pharmacyProduct.updateMany({ where: { id: productId, pharmacyId }, data: { isAvailable: available } });
    if (changed.count !== 1) throw new Error("Product does not belong to this pharmacy");
    await audit(tx, { actorUserId: user.id, pharmacyId, entityId: productId, action: available ? "PRODUCT_ENABLED" : "PRODUCT_DISABLED" });
  }, transactionOptions);
  revalidatePath("/pharmacy/workspace");
  return { success: true };
}

export async function getAdminPharmacyOverview() {
  await currentAdmin();
  const [pharmacies, auditEvents] = await Promise.all([
    db.pharmacy.findMany({ select: { id: true, name: true, legalName: true, licenseNumber: true, contactEmail: true, contactPhone: true, address: true, city: true, state: true, country: true, status: true, statusReason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.pharmacyAuditEvent.findMany({ select: { action: true, fromStatus: true, toStatus: true, reason: true, createdAt: true, actor: { select: { name: true, email: true } }, pharmacy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return { pharmacies, auditEvents };
}

export async function updatePharmacyStatus(formData) {
  const admin = await currentAdmin();
  const pharmacyId = field(formData, "pharmacyId", "Pharmacy", 100);
  const status = field(formData, "status", "Status", 20);
  if (!["VERIFIED", "REJECTED", "SUSPENDED"].includes(status)) throw new Error("Invalid pharmacy status");
  const reason = field(formData, "reason", "Review reason", 1000, status !== "VERIFIED");
  await db.$transaction(async (tx) => {
    const pharmacy = await tx.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true, status: true } });
    if (!pharmacy || !canTransitionPharmacy(pharmacy.status, status)) throw new Error("Pharmacy status cannot make that transition");
    const changed = await tx.pharmacy.updateMany({ where: { id: pharmacyId, status: pharmacy.status }, data: { status, statusReason: reason } });
    if (changed.count !== 1) throw new Error("Pharmacy status was updated by another administrator");
    await audit(tx, { actorUserId: admin.id, pharmacyId, entityId: pharmacyId, action: `PHARMACY_${status}`, fromStatus: pharmacy.status, toStatus: status, reason });
  }, transactionOptions);
  revalidatePath("/admin");
  revalidatePath("/admin/pharmacy");
  revalidatePath("/pharmacy/workspace");
  return { success: true };
}
