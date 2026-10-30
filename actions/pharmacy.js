"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/prisma";
import { verifyAdmin } from "@/actions/admin";
import { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey, validateProductDates, isProductExpired, parseDateOnly, formatDateOnly, serializePharmacyProduct } from "@/lib/pharmacy-workflow.mjs";

const transactionOptions = { isolationLevel: "Serializable", timeout: 15_000, maxWait: 10_000 };

let dateColumnsSupported = null;
async function checkProductDateColumnsSupport(tx) {
  if (dateColumnsSupported !== null) return dateColumnsSupported;
  if (!tx || typeof tx.$queryRawUnsafe !== "function") return false;
  try {
    const res = await tx.$queryRawUnsafe(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'PharmacyProduct' AND column_name = 'expiryDate' LIMIT 1;
    `);
    dateColumnsSupported = Array.isArray(res) && res.length > 0;
  } catch {
    dateColumnsSupported = false;
  }
  return dateColumnsSupported;
}

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
    select: {
      id: true,
      pharmacyId: true,
      role: true,
      pharmacy: {
        select: {
          id: true,
          name: true,
          legalName: true,
          licenseNumber: true,
          contactEmail: true,
          contactPhone: true,
          address: true,
          city: true,
          state: true,
          country: true,
          status: true,
          statusReason: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const selectedMembership = pharmacyId ? memberships.find((entry) => entry.pharmacyId === pharmacyId) : memberships[0];
  if (!selectedMembership) return { selected: null, memberships: [] };
  const verified = selectedMembership.pharmacy.status === "VERIFIED";
  const isOwner = selectedMembership.role === "OWNER";
  const [rawProducts, auditEvents, team] = await Promise.all([
    verified ? db.pharmacyProduct.findMany({ where: { pharmacyId: selectedMembership.pharmacyId }, orderBy: { name: "asc" }, take: 200 }) : [],
    verified ? db.pharmacyAuditEvent.findMany({ where: { pharmacyId: selectedMembership.pharmacyId }, select: { action: true, fromStatus: true, toStatus: true, ...(isOwner ? { reason: true } : {}), createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }) : [],
    selectedMembership.role === "OWNER" && verified ? db.pharmacyMembership.findMany({ where: { pharmacyId: selectedMembership.pharmacyId, status: "ACTIVE" }, select: { id: true, role: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  const products = rawProducts.map(serializePharmacyProduct);
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

  const isAvailableRaw = formData.get("isAvailable");
  const isAvailable = isAvailableRaw !== null && isAvailableRaw !== undefined
    ? isAvailableRaw === "true" || isAvailableRaw === "on"
    : undefined;

  const manufactureDateRaw = formData.get("manufactureDate");
  const expiryDateRaw = formData.get("expiryDate");
  const dateValidation = validateProductDates({
    manufactureDate: manufactureDateRaw ? String(manufactureDateRaw).trim() : null,
    expiryDate: expiryDateRaw ? String(expiryDateRaw).trim() : null,
  });
  if (!dateValidation.valid) throw new Error(dateValidation.error);
  const { manufactureDate, expiryDate } = dateValidation;
  const expired = isProductExpired(expiryDate);

  if (isAvailable && expired) {
    throw new Error("Expired products cannot be made available for dispensing");
  }

  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, pharmacyId);
    const hasColumns = await checkProductDateColumnsSupport(tx);
    const dateData = hasColumns ? {
      ...(manufactureDate !== undefined ? { manufactureDate } : {}),
      ...(expiryDate !== undefined ? { expiryDate } : {}),
    } : {};

    if (productId) {
      const changed = await tx.pharmacyProduct.updateMany({
        where: { id: productId, pharmacyId },
        data: {
          name,
          description,
          price,
          ...(isAvailable !== undefined ? { isAvailable: expired ? false : isAvailable } : (expired ? { isAvailable: false } : {})),
          ...dateData,
        },
      });
      if (changed.count !== 1) throw new Error("Product does not belong to this pharmacy");
      await audit(tx, { actorUserId: user.id, pharmacyId, entityId: productId, action: "PRODUCT_UPDATED" });
    } else {
      // Rapid duplicate click protection: check if identical product was created in last 30s
      if (typeof tx.pharmacyProduct.findFirst === "function") {
        const recentDuplicate = await tx.pharmacyProduct.findFirst({
          where: {
            pharmacyId,
            name,
            createdAt: { gte: new Date(Date.now() - 30_000) },
          },
          select: { id: true, price: true, description: true },
        });
        if (
          recentDuplicate &&
          Number(recentDuplicate.price) === price &&
          (recentDuplicate.description || null) === (description || null)
        ) {
          // Idempotent success without creating multiple copies
          return;
        }
      }

      const product = await tx.pharmacyProduct.create({
        data: {
          pharmacyId,
          name,
          description,
          price,
          isAvailable: expired ? false : (isAvailable !== undefined ? isAvailable : true),
          ...dateData,
        },
      });
      await audit(tx, { actorUserId: user.id, pharmacyId, entityId: product.id, action: "PRODUCT_CREATED" });
    }
  }, transactionOptions);
  revalidatePath("/pharmacy/workspace");
  revalidatePath("/pharmacy");
  return { success: true };
}

export async function deletePharmacyProduct(formData) {
  const user = await currentUser();
  const pharmacyId = field(formData, "pharmacyId", "Pharmacy", 100);
  const productId = field(formData, "productId", "Product", 100);

  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, pharmacyId, ["OWNER", "MANAGER"]);
    const deleted = await tx.pharmacyProduct.deleteMany({
      where: { id: productId, pharmacyId },
    });
    if (deleted.count !== 1) {
      throw new Error("Product not found or does not belong to this pharmacy");
    }
    await audit(tx, { actorUserId: user.id, pharmacyId, entityId: productId, action: "PRODUCT_DELETED" });
  }, transactionOptions);

  revalidatePath("/pharmacy/workspace");
  revalidatePath("/pharmacy");
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
    if (available) {
      const hasColumns = await checkProductDateColumnsSupport(tx);
      if (hasColumns && typeof tx.pharmacyProduct.findFirst === "function") {
        const existing = await tx.pharmacyProduct.findFirst({
          where: { id: productId, pharmacyId },
          select: { expiryDate: true },
        });
        if (existing?.expiryDate && isProductExpired(existing.expiryDate)) {
          throw new Error("Expired products cannot be made available for dispensing");
        }
      }
    }
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

export async function getAvailablePharmacyProducts() {
  const products = await db.pharmacyProduct.findMany({
    where: {
      isAvailable: true,
      pharmacy: { status: "VERIFIED" },
    },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      isAvailable: true,
      pharmacy: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          state: true,
          contactPhone: true,
          contactEmail: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return {
    products: products.map((product) => ({
      ...product,
      price: Number(product.price).toFixed(2),
    })),
  };
}

export async function submitPharmacyDispensingRequest(formData) {
  const user = await currentUser();
  const pharmacyId = field(formData, "pharmacyId", "Pharmacy", 100);
  const itemsRaw = field(formData, "items", "Selected items", 10000);
  const patientNote = field(formData, "patientNote", "Patient note", 500, false);
  const prescriptionId = field(formData, "prescriptionId", "Prescription", 100, false);

  let items = [];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    throw new Error("Invalid items payload");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one medicine must be selected");
  }

  for (const item of items) {
    if (!item.productId || typeof item.quantity !== "number" || item.quantity <= 0) {
      throw new Error("Invalid item or quantity in request");
    }
  }

  const requestId = crypto.randomUUID();

  await db.$transaction(async (tx) => {
    const pharmacy = await tx.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, status: true, name: true },
    });
    if (!pharmacy || pharmacy.status !== "VERIFIED") {
      throw new Error("Pharmacy not found or not currently active for dispensing");
    }

    const hasColumns = await checkProductDateColumnsSupport(tx);
    const productIds = items.map((i) => i.productId);
    const dbProducts = await tx.pharmacyProduct.findMany({
      where: { id: { in: productIds }, pharmacyId },
      select: { id: true, name: true, price: true, isAvailable: true, ...(hasColumns ? { expiryDate: true } : {}) },
    });

    if (dbProducts.length !== productIds.length) {
      throw new Error("One or more selected products do not belong to this pharmacy");
    }

    const enrichedItems = [];
    for (const item of items) {
      const prod = dbProducts.find((p) => p.id === item.productId);
      if (!prod.isAvailable) {
        throw new Error(`${prod.name} is currently unavailable`);
      }
      if (prod.expiryDate && isProductExpired(prod.expiryDate)) {
        throw new Error(`${prod.name} has expired and cannot be dispensed`);
      }
      enrichedItems.push({
        productId: prod.id,
        name: prod.name,
        price: Number(prod.price).toFixed(2),
        quantity: item.quantity,
      });
    }

    const payload = {
      requestId,
      items: enrichedItems,
      patientNote: patientNote || null,
      prescriptionId: prescriptionId || null,
      patientName: user.name || "Patient",
      patientEmail: user.email,
    };

    await audit(tx, {
      actorUserId: user.id,
      pharmacyId,
      entityId: requestId,
      action: "DISPENSING_REQUEST_CREATED",
      fromStatus: null,
      toStatus: "AWAITING_STORE_CONFIRMATION",
      reason: JSON.stringify(payload),
    });
  }, transactionOptions);

  revalidatePath("/pharmacy");
  revalidatePath("/pharmacy/workspace");
  return { success: true, requestId };
}

export async function getPharmacyDispensingRequests(pharmacyId) {
  const user = await currentUser();
  if (typeof pharmacyId !== "string" || !pharmacyId) throw new Error("Pharmacy is required");

  await membershipFor(db, user.id, pharmacyId);

  const events = await db.pharmacyAuditEvent.findMany({
    where: {
      pharmacyId,
      action: { in: ["DISPENSING_REQUEST_CREATED", "DISPENSING_REQUEST_STATUS_UPDATED"] },
    },
    orderBy: { createdAt: "asc" },
  });

  const requestsMap = new Map();
  for (const ev of events) {
    let details = {};
    try {
      details = JSON.parse(ev.reason || "{}");
    } catch {}

    if (ev.action === "DISPENSING_REQUEST_CREATED") {
      requestsMap.set(ev.entityId, {
        id: ev.entityId,
        pharmacyId: ev.pharmacyId,
        patientId: ev.actorUserId,
        patientName: details.patientName || "Patient",
        patientEmail: details.patientEmail,
        items: details.items || [],
        patientNote: details.patientNote || null,
        prescriptionId: details.prescriptionId || null,
        status: ev.toStatus || "AWAITING_STORE_CONFIRMATION",
        createdAt: ev.createdAt,
        updatedAt: ev.createdAt,
        history: [{
          action: ev.action,
          status: ev.toStatus,
          actorName: details.patientName || "Patient",
          createdAt: ev.createdAt,
          note: null,
        }],
      });
    } else if (requestsMap.has(ev.entityId)) {
      const existing = requestsMap.get(ev.entityId);
      existing.status = ev.toStatus || existing.status;
      existing.updatedAt = ev.createdAt;
      existing.history.push({
        action: ev.action,
        status: ev.toStatus,
        actorName: details.updatedBy || "Staff",
        createdAt: ev.createdAt,
        note: details.note || null,
      });
    }
  }

  const requests = Array.from(requestsMap.values()).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  return { requests };
}

export async function updatePharmacyDispensingRequestStatus(formData) {
  const user = await currentUser();
  const pharmacyId = field(formData, "pharmacyId", "Pharmacy", 100);
  const requestId = field(formData, "requestId", "Request ID", 100);
  const status = field(formData, "status", "Status", 50);
  const note = field(formData, "note", "Note", 500, false);

  const allowedStatuses = ["CONFIRMED", "READY_FOR_PICKUP", "COMPLETED", "REJECTED"];
  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid request status transition");
  }

  await db.$transaction(async (tx) => {
    await verifiedMembershipFor(tx, user.id, pharmacyId, ["OWNER", "MANAGER", "STAFF"]);

    const latestEvent = await tx.pharmacyAuditEvent.findFirst({
      where: {
        pharmacyId,
        entityId: requestId,
        action: { in: ["DISPENSING_REQUEST_CREATED", "DISPENSING_REQUEST_STATUS_UPDATED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!latestEvent) {
      throw new Error("Dispensing request not found");
    }

    const currentStatus = latestEvent.toStatus;
    if (currentStatus === "COMPLETED" || currentStatus === "REJECTED" || currentStatus === "CANCELLED") {
      throw new Error(`Cannot update a request that is already ${currentStatus.toLowerCase()}`);
    }

    const payload = {
      note: note || null,
      updatedBy: user.name || "Pharmacy Staff",
    };

    await audit(tx, {
      actorUserId: user.id,
      pharmacyId,
      entityId: requestId,
      action: "DISPENSING_REQUEST_STATUS_UPDATED",
      fromStatus: currentStatus,
      toStatus: status,
      reason: JSON.stringify(payload),
    });
  }, transactionOptions);

  revalidatePath("/pharmacy/workspace");
  revalidatePath("/pharmacy");
  return { success: true };
}

export async function getPatientDispensingRequests() {
  const user = await currentUser();

  const createdEvents = await db.pharmacyAuditEvent.findMany({
    where: {
      action: "DISPENSING_REQUEST_CREATED",
      actorUserId: user.id,
    },
    orderBy: { createdAt: "asc" },
    include: {
      pharmacy: {
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          contactPhone: true,
        },
      },
    },
  });

  if (createdEvents.length === 0) {
    return { requests: [] };
  }

  const requestsMap = new Map();
  const requestIds = [];

  for (const ev of createdEvents) {
    let details = {};
    try { details = JSON.parse(ev.reason || "{}"); } catch {}
    requestsMap.set(ev.entityId, {
      id: ev.entityId,
      pharmacyId: ev.pharmacyId,
      pharmacy: ev.pharmacy,
      items: details.items || [],
      patientNote: details.patientNote || null,
      prescriptionId: details.prescriptionId || null,
      status: ev.toStatus || "AWAITING_STORE_CONFIRMATION",
      createdAt: ev.createdAt,
      updatedAt: ev.createdAt,
      latestNote: null,
    });
    requestIds.push(ev.entityId);
  }

  const updateEvents = await db.pharmacyAuditEvent.findMany({
    where: {
      action: "DISPENSING_REQUEST_STATUS_UPDATED",
      entityId: { in: requestIds },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const ev of updateEvents) {
    const existing = requestsMap.get(ev.entityId);
    if (existing) {
      existing.status = ev.toStatus || existing.status;
      existing.updatedAt = ev.createdAt;
      let details = {};
      try { details = JSON.parse(ev.reason || "{}"); } catch {}
      if (details.note) existing.latestNote = details.note;
    }
  }

  const requests = Array.from(requestsMap.values()).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  return { requests };
}

export async function cancelPatientDispensingRequest(formData) {
  const user = await currentUser();
  const requestId = typeof formData === "string" ? formData : field(formData, "requestId", "Request ID", 100);

  await db.$transaction(async (tx) => {
    const createdEvent = await tx.pharmacyAuditEvent.findFirst({
      where: {
        entityId: requestId,
        action: "DISPENSING_REQUEST_CREATED",
        actorUserId: user.id,
      },
    });
    if (!createdEvent) throw new Error("Request not found or unauthorized");

    const latestEvent = await tx.pharmacyAuditEvent.findFirst({
      where: {
        entityId: requestId,
        action: { in: ["DISPENSING_REQUEST_CREATED", "DISPENSING_REQUEST_STATUS_UPDATED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!latestEvent || latestEvent.toStatus !== "AWAITING_STORE_CONFIRMATION") {
      throw new Error("Only pending requests can be cancelled");
    }

    await audit(tx, {
      actorUserId: user.id,
      pharmacyId: createdEvent.pharmacyId,
      entityId: requestId,
      action: "DISPENSING_REQUEST_STATUS_UPDATED",
      fromStatus: latestEvent.toStatus,
      toStatus: "CANCELLED",
      reason: JSON.stringify({ note: "Cancelled by patient", updatedBy: user.name || "Patient" }),
    });
  }, transactionOptions);

  revalidatePath("/pharmacy");
  revalidatePath("/pharmacy/workspace");
  return { success: true };
}
