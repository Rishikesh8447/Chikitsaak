const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey, validateProductDates, isProductExpired, parseDateOnly, formatDateOnly } = require("../lib/pharmacy-workflow.mjs");

const sourcePromise = readFile(join(__dirname, "..", "actions", "pharmacy.js"), "utf8");

function form(fields) { return { get: (key) => fields[key] ?? null }; }

async function loadActions({
  role = "PATIENT",
  userId = "user-patient",
  userName = "Patient User",
  userEmail = "patient@example.com",
  membership = null,
  pharmacyStatus = "VERIFIED",
  products = [],
  auditEvents = [],
  updateCount = 1,
} = {}) {
  const source = await sourcePromise;
  const state = {
    membershipQueries: [],
    productWrites: [],
    audits: [],
    events: [...auditEvents],
    transactions: 0,
  };

  const tx = {
    pharmacyMembership: {
      findFirst: async (query) => {
        state.membershipQueries.push(query);
        if (!membership) return null;
        if (query?.where?.pharmacyId && membership.pharmacyId !== query.where.pharmacyId) return null;
        return membership;
      },
      findMany: async () => membership ? [membership] : [],
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    pharmacyProduct: {
      create: async (query) => { state.productWrites.push({ type: "create", ...query }); return { id: "product-new", ...query.data }; },
      updateMany: async (query) => { state.productWrites.push({ type: "update", ...query }); return { count: updateCount }; },
      deleteMany: async () => ({ count: 1 }),
      findFirst: async () => null,
      findMany: async (query) => {
        if (query?.where?.id?.in) {
          return products.filter((p) => query.where.id.in.includes(p.id) && (!query.where.pharmacyId || p.pharmacyId === query.where.pharmacyId));
        }
        return products;
      },
    },
    pharmacyAuditEvent: {
      create: async (query) => {
        const record = { id: `audit-${state.events.length + 1}`, createdAt: new Date(), ...query.data };
        state.audits.push(record);
        state.events.push(record);
        return record;
      },
      findFirst: async (query) => {
        const matches = state.events.filter((e) => {
          if (query?.where?.pharmacyId && e.pharmacyId !== query.where.pharmacyId) return false;
          if (query?.where?.entityId && typeof query.where.entityId === "string" && e.entityId !== query.where.entityId) return false;
          if (query?.where?.actorUserId && e.actorUserId !== query.where.actorUserId) return false;
          if (query?.where?.action?.in && !query.where.action.in.includes(e.action)) return false;
          if (query?.where?.action && typeof query.where.action === "string" && e.action !== query.where.action) return false;
          return true;
        });
        if (query?.orderBy?.createdAt === "desc") {
          return matches.reverse()[0] || null;
        }
        return matches[0] || null;
      },
      findMany: async (query) => {
        return state.events.filter((e) => {
          if (query?.where?.pharmacyId && e.pharmacyId !== query.where.pharmacyId) return false;
          if (query?.where?.actorUserId && e.actorUserId !== query.where.actorUserId) return false;
          if (query?.where?.entityId && typeof query.where.entityId === "string" && e.entityId !== query.where.entityId) return false;
          if (query?.where?.entityId?.in && !query.where.entityId.in.includes(e.entityId)) return false;
          if (query?.where?.action?.in && !query.where.action.in.includes(e.action)) return false;
          if (query?.where?.action && typeof query.where.action === "string" && e.action !== query.where.action) return false;
          return true;
        });
      },
    },
    pharmacy: {
      findUnique: async () => ({ id: "pharmacy-a", name: "Green Cross Pharmacy", status: pharmacyStatus }),
      updateMany: async () => ({ count: 1 }),
    },
    $queryRawUnsafe: async () => [{ column_name: "expiryDate" }],
  };

  const dependencies = {
    auth: async () => ({ userId }),
    revalidatePath() {},
    db: {
      user: { findUnique: async () => ({ id: userId, clerkUserId: userId, role, name: userName, email: userEmail }) },
      $transaction: async (callback) => { state.transactions += 1; return callback(tx); },
      ...tx,
    },
    verifyAdmin: async () => role === "ADMIN",
    canManagePharmacy,
    canTransitionPharmacy,
    normalizeLicenseKey,
    validateProductDates,
    isProductExpired,
    parseDateOnly,
    formatDateOnly,
  };

  const transformed = source
    .replace('"use server";', "")
    .replace('import { auth } from "@clerk/nextjs/server";', "const { auth } = dependencies;")
    .replace('import { revalidatePath } from "next/cache";', "const { revalidatePath } = dependencies;")
    .replace('import { db } from "@/lib/prisma";', "const { db } = dependencies;")
    .replace('import { verifyAdmin } from "@/actions/admin";', "const { verifyAdmin } = dependencies;")
    .replace(/import \{[\s\S]*?\} from ["']@\/lib\/pharmacy-workflow\.mjs["'];/, "const { canManagePharmacy, canTransitionPharmacy, normalizeLicenseKey, validateProductDates, isProductExpired, parseDateOnly, formatDateOnly } = dependencies;")
    .replaceAll("export async function", "async function")
    .concat("\nreturn { savePharmacyProduct, setPharmacyProductAvailability, submitPharmacyDispensingRequest, getPharmacyDispensingRequests, updatePharmacyDispensingRequestStatus, getPatientDispensingRequests, cancelPatientDispensingRequest };");

  return { ...new Function("dependencies", transformed)(dependencies), state };
}

const verifiedManager = {
  id: "membership-mgr",
  userId: "user-mgr",
  pharmacyId: "pharmacy-a",
  role: "MANAGER",
  status: "ACTIVE",
  pharmacy: { id: "pharmacy-a", status: "VERIFIED" },
};

test("1 & 2. A pharmacy can edit an existing medicine and valid edit persists availability and dates", async () => {
  const { savePharmacyProduct, state } = await loadActions({
    role: "PATIENT",
    userId: "user-mgr",
    membership: verifiedManager,
  });

  const result = await savePharmacyProduct(form({
    pharmacyId: "pharmacy-a",
    productId: "prod-101",
    name: "Amoxicillin 500mg",
    price: "120.50",
    isAvailable: "true",
    manufactureDate: "2026-01-01",
    expiryDate: "2027-12-31",
    description: "Broad spectrum antibiotic",
  }));

  assert.equal(result.success, true);
  assert.equal(state.productWrites.length, 1);
  const write = state.productWrites[0];
  assert.equal(write.type, "update");
  assert.deepEqual(write.where, { id: "prod-101", pharmacyId: "pharmacy-a" });
  assert.equal(write.data.name, "Amoxicillin 500mg");
  assert.equal(write.data.price, 120.5);
  assert.equal(write.data.isAvailable, true);
  assert.ok(write.data.manufactureDate);
  assert.ok(write.data.expiryDate);
  assert.equal(state.audits[0].action, "PRODUCT_UPDATED");
});

test("3. An invalid edit shows a useful validation message", async () => {
  const { savePharmacyProduct } = await loadActions({
    role: "PATIENT",
    userId: "user-mgr",
    membership: verifiedManager,
  });

  // Negative price
  await assert.rejects(
    savePharmacyProduct(form({ pharmacyId: "pharmacy-a", productId: "p-1", name: "Paracetamol", price: "-5.00" })),
    /Enter a non-negative price/
  );

  // Expiry date before manufacturing date
  await assert.rejects(
    savePharmacyProduct(form({
      pharmacyId: "pharmacy-a",
      productId: "p-1",
      name: "Paracetamol",
      price: "15.00",
      manufactureDate: "2026-06-01",
      expiryDate: "2026-01-01",
    })),
    /Expiry date cannot be before manufacturing date/
  );

  // Expired product marked available
  await assert.rejects(
    savePharmacyProduct(form({
      pharmacyId: "pharmacy-a",
      productId: "p-1",
      name: "Paracetamol",
      price: "15.00",
      isAvailable: "true",
      expiryDate: "2020-01-01",
    })),
    /Expired products cannot be made available for dispensing/
  );
});

test("4 & 5. A patient can submit a valid dispensing request and the intended pharmacy can see it", async () => {
  const testProduct = {
    id: "prod-201",
    name: "Cetirizine 10mg",
    price: 35.0,
    pharmacyId: "pharmacy-a",
    isAvailable: true,
    expiryDate: new Date("2027-12-31"),
  };

  const patientActions = await loadActions({
    role: "PATIENT",
    userId: "patient-1",
    userName: "Alice Smith",
    userEmail: "alice@example.com",
    products: [testProduct],
  });

  const result = await patientActions.submitPharmacyDispensingRequest(form({
    pharmacyId: "pharmacy-a",
    items: JSON.stringify([{ productId: "prod-201", quantity: 2 }]),
    patientNote: "Please pack for evening pickup",
  }));

  assert.equal(result.success, true);
  assert.ok(result.requestId);

  // Pharmacy staff views the requests
  const staffActions = await loadActions({
    userId: "user-mgr",
    membership: verifiedManager,
    auditEvents: patientActions.state.events,
  });

  const { requests } = await staffActions.getPharmacyDispensingRequests("pharmacy-a");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].id, result.requestId);
  assert.equal(requests[0].patientName, "Alice Smith");
  assert.equal(requests[0].patientNote, "Please pack for evening pickup");
  assert.equal(requests[0].status, "AWAITING_STORE_CONFIRMATION");
  assert.equal(requests[0].items[0].name, "Cetirizine 10mg");
  assert.equal(requests[0].items[0].quantity, 2);
});

test("6 & 7. Supported pharmacy request actions work, persist status changes, and patient view reflects actual status", async () => {
  const testProduct = { id: "prod-301", name: "Metformin 500mg", price: 60.0, pharmacyId: "pharmacy-a", isAvailable: true };

  const patientActions = await loadActions({
    userId: "patient-2",
    userName: "Bob Jones",
    products: [testProduct],
  });

  const { requestId } = await patientActions.submitPharmacyDispensingRequest(form({
    pharmacyId: "pharmacy-a",
    items: JSON.stringify([{ productId: "prod-301", quantity: 1 }]),
  }));

  // Pharmacy confirms the request
  const staffActions = await loadActions({
    userId: "user-mgr",
    membership: verifiedManager,
    auditEvents: patientActions.state.events,
  });

  await staffActions.updatePharmacyDispensingRequestStatus(form({
    pharmacyId: "pharmacy-a",
    requestId,
    status: "CONFIRMED",
    note: "Order confirmed, preparing in store",
  }));

  // Check patient view
  const patientViewAfterConfirm = await loadActions({
    userId: "patient-2",
    auditEvents: staffActions.state.events,
  });
  const { requests: pRequests1 } = await patientViewAfterConfirm.getPatientDispensingRequests();
  assert.equal(pRequests1.length, 1);
  assert.equal(pRequests1[0].status, "CONFIRMED");
  assert.equal(pRequests1[0].latestNote, "Order confirmed, preparing in store");

  // Pharmacy marks ready for pickup
  await staffActions.updatePharmacyDispensingRequestStatus(form({
    pharmacyId: "pharmacy-a",
    requestId,
    status: "READY_FOR_PICKUP",
    note: "Packaged at counter 2",
  }));

  const patientViewAfterReady = await loadActions({
    userId: "patient-2",
    auditEvents: staffActions.state.events,
  });
  const { requests: pRequests2 } = await patientViewAfterReady.getPatientDispensingRequests();
  assert.equal(pRequests2[0].status, "READY_FOR_PICKUP");

  // Pharmacy marks complete
  await staffActions.updatePharmacyDispensingRequestStatus(form({
    pharmacyId: "pharmacy-a",
    requestId,
    status: "COMPLETED",
  }));

  const patientViewAfterComplete = await loadActions({
    userId: "patient-2",
    auditEvents: staffActions.state.events,
  });
  const { requests: pRequests3 } = await patientViewAfterComplete.getPatientDispensingRequests();
  assert.equal(pRequests3[0].status, "COMPLETED");
});

test("8. Unauthorized users cannot edit another pharmacy's products or access its requests", async () => {
  // User with no membership
  const outsider = await loadActions({ userId: "outsider", membership: null });

  await assert.rejects(
    outsider.savePharmacyProduct(form({ pharmacyId: "pharmacy-a", productId: "p-1", name: "Item", price: "10.00" })),
    /membership required/
  );

  await assert.rejects(
    outsider.getPharmacyDispensingRequests("pharmacy-a"),
    /membership required/
  );

  await assert.rejects(
    outsider.updatePharmacyDispensingRequestStatus(form({ pharmacyId: "pharmacy-a", requestId: "r-1", status: "CONFIRMED" })),
    /membership required/
  );

  // User from a different pharmacy
  const foreignPharmacyMember = {
    id: "membership-b",
    userId: "user-b",
    pharmacyId: "pharmacy-b",
    role: "MANAGER",
    status: "ACTIVE",
    pharmacy: { id: "pharmacy-b", status: "VERIFIED" },
  };
  const foreignUser = await loadActions({ userId: "user-b", membership: foreignPharmacyMember });

  await assert.rejects(
    foreignUser.savePharmacyProduct(form({ pharmacyId: "pharmacy-a", productId: "p-1", name: "Item", price: "10.00" })),
    /Active pharmacy membership required|verified pharmacy/
  );

  await assert.rejects(
    foreignUser.getPharmacyDispensingRequests("pharmacy-a"),
    /Active pharmacy membership required/
  );
});

test("9. getPatientDispensingRequests enforces patient isolation, supports requests without status updates, and reflects latest status history", async () => {
  const prod = { id: "prod-iso-1", name: "Ibuprofen 400mg", price: 50.0, pharmacyId: "pharmacy-a", isAvailable: true };

  // Patient A submits a request (will remain in initial state, no updates)
  const patientA = await loadActions({
    userId: "patient-a",
    userName: "Patient A",
    products: [prod],
  });
  const { requestId: reqA } = await patientA.submitPharmacyDispensingRequest(form({
    pharmacyId: "pharmacy-a",
    items: JSON.stringify([{ productId: "prod-iso-1", quantity: 1 }]),
    patientNote: "Need urgently",
  }));

  // Patient B submits a request (will receive multiple status updates from staff)
  const patientB = await loadActions({
    userId: "patient-b",
    userName: "Patient B",
    products: [prod],
    auditEvents: patientA.state.events,
  });
  const { requestId: reqB } = await patientB.submitPharmacyDispensingRequest(form({
    pharmacyId: "pharmacy-a",
    items: JSON.stringify([{ productId: "prod-iso-1", quantity: 3 }]),
    patientNote: "Leave at reception",
  }));

  // Staff updates Patient B's request: CONFIRMED -> READY_FOR_PICKUP
  const staff = await loadActions({
    userId: "user-mgr",
    membership: verifiedManager,
    auditEvents: patientB.state.events,
  });
  await staff.updatePharmacyDispensingRequestStatus(form({
    pharmacyId: "pharmacy-a",
    requestId: reqB,
    status: "CONFIRMED",
    note: "Order confirmed by pharmacist",
  }));
  await staff.updatePharmacyDispensingRequestStatus(form({
    pharmacyId: "pharmacy-a",
    requestId: reqB,
    status: "READY_FOR_PICKUP",
    note: "Package ready at counter 1",
  }));

  // Verify Patient A view:
  // - Sees ONLY Request A (patient isolation: Request B and its staff updates are excluded)
  // - Request A has no status updates: status is AWAITING_STORE_CONFIRMATION and latestNote is null
  const patientAView = await loadActions({
    userId: "patient-a",
    auditEvents: staff.state.events,
  });
  const { requests: requestsA } = await patientAView.getPatientDispensingRequests();
  assert.equal(requestsA.length, 1);
  assert.equal(requestsA[0].id, reqA);
  assert.equal(requestsA[0].status, "AWAITING_STORE_CONFIRMATION");
  assert.equal(requestsA[0].latestNote, null);
  assert.equal(requestsA[0].patientNote, "Need urgently");
  assert.equal(requestsA[0].items[0].quantity, 1);

  // Verify Patient B view:
  // - Sees ONLY Request B (Request A is excluded)
  // - Status history reflected: latest status is READY_FOR_PICKUP with latest note from staff
  const patientBView = await loadActions({
    userId: "patient-b",
    auditEvents: staff.state.events,
  });
  const { requests: requestsB } = await patientBView.getPatientDispensingRequests();
  assert.equal(requestsB.length, 1);
  assert.equal(requestsB[0].id, reqB);
  assert.equal(requestsB[0].status, "READY_FOR_PICKUP");
  assert.equal(requestsB[0].latestNote, "Package ready at counter 1");
  assert.equal(requestsB[0].items[0].quantity, 3);

  // Calling user with no requests receives an empty list immediately
  const emptyUser = await loadActions({
    userId: "patient-empty",
    auditEvents: staff.state.events,
  });
  const { requests: emptyRequests } = await emptyUser.getPatientDispensingRequests();
  assert.deepEqual(emptyRequests, []);
});
