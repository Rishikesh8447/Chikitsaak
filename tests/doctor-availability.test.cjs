const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

async function loadDoctorAvailabilityModule({
  userId = "clerk-doctor-1",
  doctor = { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
  initialSlots = [],
  appointments = [],
} = {}) {
  const source = await readFile(join(process.cwd(), "actions", "doctor.js"), "utf8");
  const transformed = source
    .replace(/^import .*;\r?\n/gm, "")
    .replaceAll("export async function", "async function");

  const state = {
    slots: structuredClone(initialSlots),
    appointments: structuredClone(appointments),
    revalidated: [],
  };

  const tx = {
    availability: {
      findMany: async ({ where = {} } = {}) => {
        let result = state.slots.filter((s) => s.doctorId === where.doctorId);
        if (where.status) result = result.filter((s) => s.status === where.status);
        if (where.id?.not) result = result.filter((s) => s.id !== where.id.not);
        return structuredClone(result);
      },
      findUnique: async ({ where }) => {
        const found = state.slots.find((s) => s.id === where.id && (where.doctorId ? s.doctorId === where.doctorId : true));
        return found ? structuredClone(found) : null;
      },
      findFirst: async ({ where }) => {
        const found = state.slots.find((s) => s.id === where.id && (where.doctorId ? s.doctorId === where.doctorId : true));
        return found ? structuredClone(found) : null;
      },
      create: async ({ data }) => {
        const slot = { id: `slot-${state.slots.length + 1}`, ...data };
        state.slots.push(slot);
        return structuredClone(slot);
      },
      update: async ({ where, data }) => {
        const index = state.slots.findIndex((s) => s.id === where.id);
        if (index === -1) throw new Error("Slot not found");
        Object.assign(state.slots[index], data);
        return structuredClone(state.slots[index]);
      },
      delete: async ({ where }) => {
        const index = state.slots.findIndex((s) => s.id === where.id);
        if (index !== -1) state.slots.splice(index, 1);
        return { count: 1 };
      },
    },
    appointment: {
      findMany: async ({ where = {} } = {}) => {
        return structuredClone(state.appointments.filter((a) => a.doctorId === where.doctorId));
      },
    },
  };

  const dependencies = {
    auth: async () => ({ userId }),
    revalidatePath: (path) => state.revalidated.push(path),
    db: {
      user: {
        findUnique: async ({ where }) => {
          if (where.clerkUserId === userId) {
            if (where.role && doctor?.role !== where.role) return null;
            if (where.verificationStatus && doctor?.verificationStatus !== where.verificationStatus) return null;
            return doctor;
          }
          return null;
        },
      },
      availability: tx.availability,
      appointment: tx.appointment,
      $transaction: async (work) => work(tx),
    },
    canTransitionAppointment: () => true,
    cancelAppointmentInTransaction: async () => {},
    CANCELLATION_ERRORS: {},
    createAppointmentNotificationPair: async () => {},
    parseConsultationPriceRupees: () => 500,
    sendAppointmentConfirmedEmail: async () => {},
    sendAppointmentCancelledEmail: async () => {},
  };

  const factory = new Function(
    "dependencies",
    `const { auth, revalidatePath, db, canTransitionAppointment, cancelAppointmentInTransaction, CANCELLATION_ERRORS, createAppointmentNotificationPair, parseConsultationPriceRupees, sendAppointmentConfirmedEmail, sendAppointmentCancelledEmail } = dependencies;
     ${transformed}
     return { getDoctorAvailability, setAvailabilitySlots, updateAvailabilitySlot, removeAvailabilitySlot };`
  );

  return { actions: factory(dependencies), state };
}

// 1. Loading existing availability
test("1. Loading existing availability returns slots for verified doctor", async () => {
  const existingSlot = {
    id: "slot-existing",
    doctorId: "doctor-1",
    startTime: new Date("2026-10-26T12:55:00.000Z"),
    endTime: new Date("2026-10-26T17:55:00.000Z"),
    status: "AVAILABLE",
    dayOfWeek: null,
    isRecurring: true,
    blockedDate: null,
  };

  const { actions } = await loadDoctorAvailabilityModule({
    initialSlots: [existingSlot],
  });

  const result = await actions.getDoctorAvailability();
  assert.equal(result.success, true);
  assert.equal(result.slots.length, 1);
  assert.equal(result.slots[0].id, "slot-existing");
  assert.equal(result.slots[0].status, "AVAILABLE");
});

// 2. Editing and saving a time range
test("2. Editing and saving a time range updates slot without overlap collision", async () => {
  const existingSlot = {
    id: "slot-existing",
    doctorId: "doctor-1",
    startTime: new Date("2026-10-26T12:55:00.000Z"), // 6:25 PM IST
    endTime: new Date("2026-10-26T17:55:00.000Z"),   // 11:25 PM IST
    status: "AVAILABLE",
    dayOfWeek: null,
    isRecurring: true,
    blockedDate: null,
  };

  const { actions, state } = await loadDoctorAvailabilityModule({
    initialSlots: [existingSlot],
  });

  const formData = new Map([
    ["slotId", "slot-existing"],
    ["startTime", "2026-10-26T12:30:00.000Z"], // 6:00 PM IST
    ["endTime", "2026-10-26T18:00:00.000Z"],   // 11:30 PM IST
    ["dayOfWeek", ""],
    ["status", "AVAILABLE"],
  ]);

  const result = await actions.updateAvailabilitySlot(formData);
  assert.equal(result.success, true);
  assert.equal(state.slots[0].id, "slot-existing");
  assert.equal(new Date(state.slots[0].startTime).toISOString(), "2026-10-26T12:30:00.000Z");
  assert.equal(new Date(state.slots[0].endTime).toISOString(), "2026-10-26T18:00:00.000Z");
  assert.ok(state.revalidated.includes("/doctor"));
});

// 3. Adding another interval
test("3. Adding another interval on the same schedule persists both intervals", async () => {
  const existingSlot = {
    id: "slot-existing",
    doctorId: "doctor-1",
    startTime: new Date("2026-10-26T03:30:00.000Z"), // 9:00 AM IST
    endTime: new Date("2026-10-26T07:30:00.000Z"),   // 1:00 PM IST
    status: "AVAILABLE",
    dayOfWeek: 1, // Monday
    isRecurring: true,
    blockedDate: null,
  };

  const { actions, state } = await loadDoctorAvailabilityModule({
    initialSlots: [existingSlot],
  });

  // Update with two intervals: morning interval + evening interval
  const formData = new Map([
    ["slotId", "slot-existing"],
    ["dayOfWeek", "1"],
    ["status", "AVAILABLE"],
    [
      "intervals",
      JSON.stringify([
        { startTime: "2026-10-26T03:30:00.000Z", endTime: "2026-10-26T07:30:00.000Z" }, // 9 AM - 1 PM
        { startTime: "2026-10-26T11:30:00.000Z", endTime: "2026-10-26T15:30:00.000Z" }, // 5 PM - 9 PM
      ]),
    ],
  ]);

  const result = await actions.updateAvailabilitySlot(formData);
  assert.equal(result.success, true);
  assert.equal(state.slots.length, 2);
  assert.equal(state.slots[0].dayOfWeek, 1);
  assert.equal(state.slots[1].dayOfWeek, 1);
  assert.equal(state.slots[0].status, "AVAILABLE");
  assert.equal(state.slots[1].status, "AVAILABLE");
});

// 4. Marking a day unavailable
test("4. Marking a day unavailable saves status BLOCKED when no appointments conflict", async () => {
  const { actions, state } = await loadDoctorAvailabilityModule();

  const formData = new Map([
    ["dayOfWeek", "0"], // Sunday
    ["status", "BLOCKED"],
    ["startTime", "2026-10-26T00:00:00.000Z"],
    ["endTime", "2026-10-26T23:59:00.000Z"],
  ]);

  const result = await actions.setAvailabilitySlots(formData);
  assert.equal(result.success, true);
  assert.equal(state.slots.length, 1);
  assert.equal(state.slots[0].status, "BLOCKED");
  assert.equal(state.slots[0].dayOfWeek, 0);
});

// 5. Invalid times and overlapping intervals
test("5. Invalid times (start >= end) and overlapping intervals are rejected", async () => {
  const { actions } = await loadDoctorAvailabilityModule();

  // Invalid times: start after end
  const invalidTime = new Map([
    ["startTime", "2026-10-26T17:00:00.000Z"],
    ["endTime", "2026-10-26T12:00:00.000Z"],
    ["dayOfWeek", ""],
    ["status", "AVAILABLE"],
  ]);
  const invalidResult = await actions.setAvailabilitySlots(invalidTime);
  assert.equal(invalidResult.success, false);
  assert.match(invalidResult.error, /Start time must be before end time/);

  // Overlapping intervals within same request
  const overlappingIntervals = new Map([
    ["dayOfWeek", "2"],
    ["status", "AVAILABLE"],
    [
      "intervals",
      JSON.stringify([
        { startTime: "2026-10-26T04:00:00.000Z", endTime: "2026-10-26T08:00:00.000Z" },
        { startTime: "2026-10-26T07:00:00.000Z", endTime: "2026-10-26T10:00:00.000Z" }, // overlaps with 04:00-08:00
      ]),
    ],
  ]);
  const overlapResult = await actions.setAvailabilitySlots(overlappingIntervals);
  assert.equal(overlapResult.success, false);
  assert.match(overlapResult.error, /Intervals cannot overlap each other/);
});

// 6. Booking behavior after availability change (preserving existing booked appointments)
test("6. Booked appointments are protected: rejecting edits that would orphan active appointments", async () => {
  const existingSlot = {
    id: "slot-1",
    doctorId: "doctor-1",
    startTime: new Date("2026-10-26T12:55:00.000Z"), // 6:25 PM IST
    endTime: new Date("2026-10-26T17:55:00.000Z"),   // 11:25 PM IST
    status: "AVAILABLE",
    dayOfWeek: null,
    isRecurring: true,
    blockedDate: null,
  };

  // 3 booked appointments in that window
  const appointments = [
    {
      id: "appt-1",
      doctorId: "doctor-1",
      status: "IN_PROGRESS",
      startTime: new Date("2026-10-26T13:55:00.000Z"), // 7:25 PM IST
      endTime: new Date("2026-10-26T14:15:00.000Z"),
    },
    {
      id: "appt-2",
      doctorId: "doctor-1",
      status: "CONFIRMED",
      startTime: new Date("2026-10-27T12:55:00.000Z"), // 6:25 PM IST
      endTime: new Date("2026-10-27T13:15:00.000Z"),
    },
    {
      id: "appt-3",
      doctorId: "doctor-1",
      status: "CONFIRMED",
      startTime: new Date("2026-10-27T13:35:00.000Z"), // 7:05 PM IST
      endTime: new Date("2026-10-27T13:55:00.000Z"),
    },
  ];

  const { actions } = await loadDoctorAvailabilityModule({
    initialSlots: [existingSlot],
    appointments,
  });

  // Attempting to change availability to 8:00 PM - 11:00 PM (14:30 - 17:30 UTC),
  // which excludes the 6:25 PM and 7:05 PM appointments!
  const orphanEdit = new Map([
    ["slotId", "slot-1"],
    ["startTime", "2026-10-26T14:30:00.000Z"],
    ["endTime", "2026-10-26T17:30:00.000Z"],
    ["dayOfWeek", ""],
    ["status", "AVAILABLE"],
  ]);

  const result = await actions.updateAvailabilitySlot(orphanEdit);
  assert.equal(result.success, false);
  assert.match(result.error, /Cannot change availability: you have a booked appointment/);

  // Attempting to mark unavailable (BLOCKED) during booked appointments
  const blockEdit = new Map([
    ["slotId", "slot-1"],
    ["startTime", "2026-10-26T12:00:00.000Z"],
    ["endTime", "2026-10-26T18:00:00.000Z"],
    ["dayOfWeek", ""],
    ["status", "BLOCKED"],
  ]);
  const blockResult = await actions.updateAvailabilitySlot(blockEdit);
  assert.equal(blockResult.success, false);
  assert.match(blockResult.error, /Cannot mark unavailable: you have booked appointments/);

  // Attempting to delete slot containing booked appointments
  const deleteResult = await actions.removeAvailabilitySlot(new Map([["slotId", "slot-1"]]));
  assert.equal(deleteResult.success, false);
  assert.match(deleteResult.error, /This period contains a booked appointment and cannot be removed/);
});

// 7. Graceful error handling (resolving the Server Components render failure)
test("7. Conflicting operations return structured error results instead of throwing unhandled errors", async () => {
  const existingSlot = {
    id: "slot-1",
    doctorId: "doctor-1",
    startTime: new Date("2026-10-26T12:55:00.000Z"),
    endTime: new Date("2026-10-26T17:55:00.000Z"),
    status: "AVAILABLE",
    dayOfWeek: null,
    isRecurring: true,
    blockedDate: null,
  };

  const { actions } = await loadDoctorAvailabilityModule({
    initialSlots: [existingSlot],
  });

  // Attempting to create an overlapping slot does NOT throw an uncaught exception
  const overlappingSlot = new Map([
    ["startTime", "2026-10-26T13:00:00.000Z"],
    ["endTime", "2026-10-26T15:00:00.000Z"],
    ["dayOfWeek", ""],
    ["status", "AVAILABLE"],
  ]);

  // It resolves cleanly to a structured response
  const response = await actions.setAvailabilitySlots(overlappingSlot);
  assert.equal(typeof response, "object");
  assert.equal(response.success, false);
  assert.equal(typeof response.error, "string");
  assert.match(response.error, /overlaps an existing period/);
});

// 8. Server-side doctor authorization enforcement
test("8. Doctor authorization is strictly enforced on the server side", async () => {
  // Case A: Unauthenticated user
  const unauthModule = await loadDoctorAvailabilityModule({ userId: null });
  const unauthRes = await unauthModule.actions.updateAvailabilitySlot(new Map([["slotId", "slot-1"]]));
  assert.equal(unauthRes.success, false);
  assert.equal(unauthRes.error, "Unauthorized");

  // Case B: Unverified doctor or non-doctor role
  const unverifiedModule = await loadDoctorAvailabilityModule({
    doctor: { id: "doc-pending", role: "DOCTOR", verificationStatus: "PENDING" },
  });
  const unverifiedRes = await unverifiedModule.actions.updateAvailabilitySlot(new Map([["slotId", "slot-1"]]));
  assert.equal(unverifiedRes.success, false);
  assert.match(unverifiedRes.error, /Doctor not found or not verified/);

  // Case C: Cross-doctor authorization (Doctor 1 attempts to modify Doctor 2's slot)
  const slotBelongingToDoc2 = {
    id: "slot-doc2",
    doctorId: "doctor-2",
    startTime: new Date("2026-10-26T12:00:00.000Z"),
    endTime: new Date("2026-10-26T16:00:00.000Z"),
    status: "AVAILABLE",
  };
  const doc1Module = await loadDoctorAvailabilityModule({
    userId: "clerk-doctor-1",
    doctor: { id: "doctor-1", role: "DOCTOR", verificationStatus: "VERIFIED" },
    initialSlots: [slotBelongingToDoc2],
  });

  const attackUpdate = new Map([
    ["slotId", "slot-doc2"],
    ["startTime", "2026-10-26T13:00:00.000Z"],
    ["endTime", "2026-10-26T17:00:00.000Z"],
  ]);
  const updateRes = await doc1Module.actions.updateAvailabilitySlot(attackUpdate);
  assert.equal(updateRes.success, false);
  assert.equal(updateRes.error, "Availability period not found");

  const attackDelete = new Map([["slotId", "slot-doc2"]]);
  const deleteRes = await doc1Module.actions.removeAvailabilitySlot(attackDelete);
  assert.equal(deleteRes.success, false);
  assert.equal(deleteRes.error, "Availability period not found");
});

// 9. Time fidelity: Displayed time matches time saved
test("9. Saved availability times match displayed times with exact AM/PM fidelity", async () => {
  const { actions, state } = await loadDoctorAvailabilityModule();
  const { format } = require("date-fns");

  // Simulate user picking 6:25 PM to 11:25 PM in local browser
  const today = new Date();
  const startLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 25, 0, 0); // 18:25 = 6:25 PM
  const endLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 25, 0, 0);   // 23:25 = 11:25 PM

  const formData = new Map([
    ["startTime", startLocal.toISOString()],
    ["endTime", endLocal.toISOString()],
    ["dayOfWeek", ""],
    ["status", "AVAILABLE"],
  ]);

  const saveRes = await actions.setAvailabilitySlots(formData);
  assert.equal(saveRes.success, true);

  // Retrieve via getDoctorAvailability
  const fetchRes = await actions.getDoctorAvailability();
  assert.equal(fetchRes.success, true);
  assert.equal(fetchRes.slots.length, 1);

  const savedSlot = fetchRes.slots[0];
  const formattedStart = format(new Date(savedSlot.startTime), "h:mm a");
  const formattedEnd = format(new Date(savedSlot.endTime), "h:mm a");

  assert.equal(formattedStart, "6:25 PM");
  assert.equal(formattedEnd, "11:25 PM");
});

