const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadCashCollectionAction({ role = "DOCTOR", appointmentOverrides = {} } = {}) {
  const source = await readFile(join(process.cwd(), "actions", "doctor.js"), "utf8");
  const state = {
    doctor: { id: "doctor-1", role, verificationStatus: role === "DOCTOR" ? "VERIFIED" : null },
    appointment: {
      id: "appointment-1",
      doctorId: "doctor-1",
      status: "CONFIRMED",
      consultationMode: "OFFLINE",
      payment: {
        id: "payment-1",
        method: "CASH",
        status: "CASH_DUE",
        verifiedAt: null,
        cashCollection: null,
      },
      ...appointmentOverrides,
    },
    collections: [],
    revalidated: [],
  };
  const tx = {
    user: {
      findUnique: async () => state.doctor?.role === "DOCTOR" && state.doctor.verificationStatus === "VERIFIED"
        ? { id: state.doctor.id }
        : null,
    },
    appointment: { findUnique: async () => structuredClone(state.appointment) },
    appointmentPayment: {
      updateMany: async ({ where, data }) => {
        const payment = state.appointment.payment;
        if (payment.id !== where.id || payment.method !== where.method || payment.status !== where.status) return { count: 0 };
        Object.assign(payment, structuredClone(data));
        return { count: 1 };
      },
    },
    appointmentCashCollection: {
      create: async ({ data }) => {
        if (state.collections.some((item) => item.paymentId === data.paymentId)) {
          throw Object.assign(new Error("duplicate collection"), { code: "P2002" });
        }
        const collection = structuredClone(data);
        state.collections.push(collection);
        state.appointment.payment.cashCollection = collection;
        return collection;
      },
    },
  };
  const db = { $transaction: async (work) => work(tx) };
  const dependencies = {
    auth: async () => ({ userId: "clerk-actor" }),
    db,
    revalidatePath: (path) => state.revalidated.push(path),
  };
  const actionSource = source.slice(source.indexOf("export async function recordCashAppointmentCollection"))
    .replaceAll("export async function", "async function");
  const factory = new Function("dependencies", `const { auth, db, revalidatePath } = dependencies; ${actionSource}\nreturn { recordCashAppointmentCollection };`);
  return { ...factory(dependencies), state };
}

function collectionForm(appointmentId = "appointment-1") {
  return new Map([["appointmentId", appointmentId]]);
}

test("verified doctor records offline cash collection with collector and timestamp audit", async () => {
  const { recordCashAppointmentCollection, state } = await loadCashCollectionAction();
  const result = await recordCashAppointmentCollection(collectionForm());

  assert.equal(result.success, true);
  assert.equal(result.alreadyCollected, false);
  assert.equal(state.appointment.payment.status, "PAID");
  assert.ok(state.appointment.payment.verifiedAt instanceof Date);
  assert.deepEqual(state.collections, [{
    paymentId: "payment-1",
    collectorUserId: "doctor-1",
    collectedAt: state.appointment.payment.verifiedAt,
  }]);
  assert.deepEqual(state.revalidated, ["/doctor", "/appointments"]);
});

test("non-doctors and doctors who do not own the appointment cannot record cash", async () => {
  const patient = await loadCashCollectionAction({ role: "PATIENT" });
  await assert.rejects(patient.recordCashAppointmentCollection(collectionForm()), /Not authorized/);
  assert.equal(patient.state.collections.length, 0);

  const otherDoctor = await loadCashCollectionAction({ appointmentOverrides: { doctorId: "doctor-2" } });
  await assert.rejects(otherDoctor.recordCashAppointmentCollection(collectionForm()), /Not authorized/);
  assert.equal(otherDoctor.state.collections.length, 0);
});

test("duplicate collection requests are idempotent and create only one audit record", async () => {
  const { recordCashAppointmentCollection, state } = await loadCashCollectionAction();
  await recordCashAppointmentCollection(collectionForm());
  const duplicate = await recordCashAppointmentCollection(collectionForm());

  assert.equal(duplicate.success, true);
  assert.equal(duplicate.alreadyCollected, true);
  assert.equal(state.appointment.payment.status, "PAID");
  assert.equal(state.collections.length, 1);
});

for (const [label, appointmentOverrides] of [
  ["online cash", { consultationMode: "ONLINE" }],
  ["offline UPI", { payment: { id: "payment-1", method: "UPI_QR", status: "CASH_DUE", verifiedAt: null, cashCollection: null } }],
  ["already paid without a cash audit", { payment: { id: "payment-1", method: "CASH", status: "PAID", verifiedAt: new Date(), cashCollection: null } }],
  ["cancelled", { status: "CANCELLED" }],
]) {
  test(`cash collection rejects ${label} appointment state`, async () => {
    const { recordCashAppointmentCollection, state } = await loadCashCollectionAction({ appointmentOverrides });
    await assert.rejects(recordCashAppointmentCollection(collectionForm()));
    assert.equal(state.collections.length, 0);
  });
}
