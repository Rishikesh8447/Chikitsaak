// Explicit, database-only demo identities. Their Clerk IDs are placeholders;
// they are not real Clerk accounts and cannot be used to sign in.
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const seedTimestamp = new Date();

const DEMO_USERS = [
  {
    id: "demo_user_doctor_1",
    clerkUserId: "demo_doctor_1",
    email: "doctor1.demo@chikitsaak.demo",
    name: "Dr. Asha Mehta",
    role: "DOCTOR",
    specialty: "Cardiology",
    experience: 12,
    description: "Demo cardiologist profile for exploring doctor discovery and bookings.",
    credentialUrl: "https://example.invalid/demo-credentials/doctor-1",
    city: "Pune",
    state: "Maharashtra",
    country: "India",
    credits: 6,
  },
  {
    id: "demo_user_doctor_2",
    clerkUserId: "demo_doctor_2",
    email: "doctor2.demo@chikitsaak.demo",
    name: "Dr. Rohan Iyer",
    role: "DOCTOR",
    specialty: "Dermatology",
    experience: 9,
    description: "Demo dermatologist profile for exploring doctor discovery and bookings.",
    credentialUrl: "https://example.invalid/demo-credentials/doctor-2",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    credits: 6,
  },
  {
    id: "demo_user_doctor_3",
    clerkUserId: "demo_doctor_3",
    email: "doctor3.demo@chikitsaak.demo",
    name: "Dr. Leena Kapoor",
    role: "DOCTOR",
    specialty: "Pediatrics",
    experience: 15,
    description: "Demo pediatrician profile for exploring doctor discovery and bookings.",
    credentialUrl: "https://example.invalid/demo-credentials/doctor-3",
    city: "Jaipur",
    state: "Rajasthan",
    country: "India",
    credits: 6,
  },
  {
    id: "demo_user_patient_1",
    clerkUserId: "demo_patient_1",
    email: "patient1.demo@chikitsaak.demo",
    name: "Mira Shah",
    role: "PATIENT",
    credits: 4,
  },
  {
    id: "demo_user_patient_2",
    clerkUserId: "demo_patient_2",
    email: "patient2.demo@chikitsaak.demo",
    name: "Arjun Nair",
    role: "PATIENT",
    credits: 8,
  },
  {
    id: "demo_user_patient_3",
    clerkUserId: "demo_patient_3",
    email: "patient3.demo@chikitsaak.demo",
    name: "Sana Khan",
    role: "PATIENT",
    credits: 6,
  },
  {
    id: "demo_user_patient_4",
    clerkUserId: "demo_patient_4",
    email: "patient4.demo@chikitsaak.demo",
    name: "Kabir Joshi",
    role: "PATIENT",
    credits: 6,
  },
  {
    id: "demo_user_patient_5",
    clerkUserId: "demo_patient_5",
    email: "patient5.demo@chikitsaak.demo",
    name: "Nisha Rao",
    role: "PATIENT",
    credits: 8,
  },
];

const DOCTORS = DEMO_USERS.filter((user) => user.role === "DOCTOR");
const PATIENTS = DEMO_USERS.filter((user) => user.role === "PATIENT");
const DEMO_USER_IDS = DEMO_USERS.map((user) => user.id);
const APPOINTMENT_DEFINITIONS = [
  { id: "demo_appointment_completed_1", doctor: 0, patient: 0, weekday: 1, weeks: -1, hour: 10, status: "COMPLETED" },
  { id: "demo_appointment_completed_2", doctor: 1, patient: 2, weekday: 3, weeks: -1, hour: 10, status: "COMPLETED" },
  { id: "demo_appointment_completed_3", doctor: 2, patient: 3, weekday: 5, weeks: -1, hour: 10, status: "COMPLETED" },
  { id: "demo_appointment_upcoming_1", doctor: 0, patient: 0, weekday: 1, weeks: 1, hour: 9, minute: 30, status: "SCHEDULED" },
  { id: "demo_appointment_upcoming_2", doctor: 0, patient: 1, weekday: 1, weeks: 1, hour: 10, minute: 30, status: "SCHEDULED" },
  { id: "demo_appointment_upcoming_3", doctor: 1, patient: 2, weekday: 3, weeks: 1, hour: 9, minute: 30, status: "SCHEDULED" },
  { id: "demo_appointment_upcoming_4", doctor: 1, patient: 3, weekday: 3, weeks: 1, hour: 10, minute: 30, status: "SCHEDULED" },
  { id: "demo_appointment_upcoming_5", doctor: 2, patient: 4, weekday: 5, weeks: 1, hour: 9, minute: 30, status: "SCHEDULED" },
  { id: "demo_appointment_upcoming_6", doctor: 2, patient: 0, weekday: 5, weeks: 1, hour: 10, minute: 30, status: "SCHEDULED" },
];

const COMPLETED_APPOINTMENTS = APPOINTMENT_DEFINITIONS.filter(
  (appointment) => appointment.status === "COMPLETED"
);
const PRESCRIPTION_DEFINITIONS = [
  {
    id: "demo_prescription_1",
    appointmentId: COMPLETED_APPOINTMENTS[0].id,
    diagnosis: "Demo record — not for clinical use",
    generalInstructions: "Sample data only. This is not medical advice or a real prescription.",
    medicines: [{ name: "Demo medicine A", dosage: "1 tablet", frequency: "Once daily", duration: "5 days", instructions: "Demo data only; not for treatment." }],
  },
  {
    id: "demo_prescription_2",
    appointmentId: COMPLETED_APPOINTMENTS[1].id,
    diagnosis: "Demo record — not for clinical use",
    generalInstructions: "Sample data only. This is not medical advice or a real prescription.",
    medicines: [{ name: "Demo medicine B", dosage: "As listed", frequency: "As listed", duration: "3 days", instructions: "Demo data only; not for treatment." }],
  },
];

const REVIEW_DEFINITIONS = COMPLETED_APPOINTMENTS.map((appointment, index) => ({
  id: `demo_review_${index + 1}`,
  appointmentId: appointment.id,
  patientId: DEMO_USERS[3 + appointment.patient].id,
  doctorId: DEMO_USERS[appointment.doctor].id,
  rating: [5, 4, 5][index],
  comment: "Demo review data.",
}));

function nextWeekday(weekday, weeksOffset) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const delta = (weekday - date.getUTCDay() + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + delta + (weeksOffset - 1) * 7);
  return date;
}

function previousWeekday(weekday, weeksAgo) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const delta = (date.getUTCDay() - weekday + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() - delta - (weeksAgo - 1) * 7);
  return date;
}

function withUtcTime(date, hour, minute = 0) {
  const result = new Date(date);
  result.setUTCHours(hour, minute, 0, 0);
  return result;
}

const AVAILABILITY_DEFINITIONS = DOCTORS.flatMap((doctor, doctorIndex) =>
  [1, 3, 5].map((weekday) => {
    const date = nextWeekday(weekday, 1);
    return {
      id: `demo_availability_doctor_${doctorIndex + 1}_${weekday}`,
      doctorId: doctor.id,
      startTime: withUtcTime(date, 9),
      endTime: withUtcTime(date, 12),
      status: "AVAILABLE",
      dayOfWeek: weekday,
      isRecurring: true,
      blockedDate: null,
    };
  })
);

const APPOINTMENTS = APPOINTMENT_DEFINITIONS.map((definition) => {
  const day = definition.weeks < 0
    ? previousWeekday(definition.weekday, Math.abs(definition.weeks))
    : nextWeekday(definition.weekday, definition.weeks);
  const startTime = withUtcTime(day, definition.hour, definition.minute || 0);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
  const doctorId = DOCTORS[definition.doctor].id;
  const patientId = PATIENTS[definition.patient].id;

  return {
    id: definition.id,
    doctorId,
    patientId,
    startTime,
    endTime,
    status: definition.status,
    notes: definition.status === "COMPLETED" ? "Demo consultation completed." : null,
    patientDescription: "Demo appointment data.",
    aiSummary: null,
    aiSpecialtySuggestion: null,
  };
});

const CREDIT_TRANSACTIONS = [
  ...PATIENTS.map((patient, index) => ({
    id: `demo_credit_grant_patient_${index + 1}`,
    userId: patient.id,
    amount: 10,
    type: "ADMIN_ADJUSTMENT",
    packageId: "demo_seed_initial_balance",
    allocationKey: `demo-seed:credit-grant:${patient.clerkUserId}`,
  })),
  ...APPOINTMENTS.flatMap((appointment) => [
    {
      id: `demo_credit_patient_${appointment.id}`,
      userId: appointment.patientId,
      amount: -2,
      type: "APPOINTMENT_DEDUCTION",
      allocationKey: `demo-seed:${appointment.id}:patient-debit`,
    },
    {
      id: `demo_credit_doctor_${appointment.id}`,
      userId: appointment.doctorId,
      amount: 2,
      type: "APPOINTMENT_DEDUCTION",
      allocationKey: `demo-seed:${appointment.id}:doctor-credit`,
    },
  ]),
];

const NOTIFICATIONS = [
  ...APPOINTMENTS.filter((appointment) => appointment.status === "SCHEDULED").flatMap((appointment) => [
    {
      id: `demo_notification_${appointment.id}_patient`,
      userId: appointment.patientId,
      appointmentId: appointment.id,
      type: "APPOINTMENT_BOOKED",
      title: "Appointment booked",
      message: "This is a sample upcoming appointment.",
      dedupeKey: `demo-seed:${appointment.id}:patient-booked`,
    },
    {
      id: `demo_notification_${appointment.id}_doctor`,
      userId: appointment.doctorId,
      appointmentId: appointment.id,
      type: "APPOINTMENT_BOOKED",
      title: "New appointment request",
      message: "This is a sample upcoming appointment.",
      dedupeKey: `demo-seed:${appointment.id}:doctor-booked`,
    },
  ]),
  ...PRESCRIPTION_DEFINITIONS.map((prescription, index) => ({
    id: `demo_notification_prescription_${index + 1}`,
    userId: PATIENTS[COMPLETED_APPOINTMENTS[index].patient].id,
    appointmentId: prescription.appointmentId,
    type: "PRESCRIPTION_AVAILABLE",
    title: "Demo medical record available",
    message: "A sample, non-clinical demo record is available for this completed appointment.",
    dedupeKey: `demo-seed:${prescription.appointmentId}:prescription-available`,
  })),
];

const MEDICINES = PRESCRIPTION_DEFINITIONS.flatMap((prescription, prescriptionIndex) =>
  prescription.medicines.map((medicine, medicineIndex) => ({
    id: `demo_medicine_${prescriptionIndex + 1}_${medicineIndex + 1}`,
    prescriptionId: prescription.id,
    ...medicine,
  }))
);

const EXPECTED_BY_ID = (rows) => new Map(rows.map((row) => [row.id, row]));
const EXPECTED_APPOINTMENTS = EXPECTED_BY_ID(APPOINTMENTS);
const EXPECTED_AVAILABILITY = EXPECTED_BY_ID(AVAILABILITY_DEFINITIONS);
const EXPECTED_TRANSACTIONS = EXPECTED_BY_ID(CREDIT_TRANSACTIONS);
const EXPECTED_NOTIFICATIONS = EXPECTED_BY_ID(NOTIFICATIONS);
const EXPECTED_REVIEWS = EXPECTED_BY_ID(REVIEW_DEFINITIONS);
const EXPECTED_PRESCRIPTIONS = EXPECTED_BY_ID(PRESCRIPTION_DEFINITIONS);
const EXPECTED_MEDICINES = EXPECTED_BY_ID(MEDICINES);

function assertExpectedOwnership(rows, expectedById, describe, check) {
  for (const row of rows) {
    const expected = expectedById.get(row.id);
    if (!expected || !check(row, expected)) {
      throw new Error(`Safety stop: existing ${describe} is outside the explicit demo seed allowlist.`);
    }
  }
}

async function assertSafeToReplaceDemoData(tx) {
  const identities = DEMO_USERS.flatMap((user) => [
    { id: user.id },
    { clerkUserId: user.clerkUserId },
    { email: user.email },
  ]);
  const existingUsers = await tx.user.findMany({ where: { OR: identities } });
  const byAnyIdentifier = new Map();

  for (const user of existingUsers) {
    const expected = DEMO_USERS.find(
      (candidate) => candidate.id === user.id ||
        candidate.clerkUserId === user.clerkUserId ||
        candidate.email === user.email
    );

    if (!expected || user.id !== expected.id || user.clerkUserId !== expected.clerkUserId || user.email !== expected.email) {
      throw new Error("Safety stop: a demo identifier is already associated with a different user record.");
    }
    // Admin protection is checked before any cleanup or creation.
    if (user.role === "ADMIN") {
      throw new Error("Safety stop: a targeted demo identifier belongs to an ADMIN account; no changes were made.");
    }
    byAnyIdentifier.set(user.id, user);
  }

  const ids = DEMO_USER_IDS;
  const appointmentIds = [...EXPECTED_APPOINTMENTS.keys()];
  const availabilityIds = [...EXPECTED_AVAILABILITY.keys()];
  const transactionIds = [...EXPECTED_TRANSACTIONS.keys()];
  const notificationIds = [...EXPECTED_NOTIFICATIONS.keys()];
  const reviewIds = [...EXPECTED_REVIEWS.keys()];
  const prescriptionIds = [...EXPECTED_PRESCRIPTIONS.keys()];
  const medicineIds = [...EXPECTED_MEDICINES.keys()];

  const [appointments, availability, payouts, transactions, notifications, reviews, prescriptions, medicines] = await Promise.all([
    tx.appointment.findMany({ where: { OR: [{ doctorId: { in: ids } }, { patientId: { in: ids } }, { id: { in: appointmentIds } }] } }),
    tx.availability.findMany({ where: { OR: [{ doctorId: { in: ids } }, { id: { in: availabilityIds } }] } }),
    tx.payout.findMany({ where: { doctorId: { in: ids } }, select: { id: true } }),
    tx.creditTransaction.findMany({ where: { OR: [{ userId: { in: ids } }, { id: { in: transactionIds } }, { allocationKey: { startsWith: "demo-seed:" } }] } }),
    tx.notification.findMany({ where: { OR: [{ userId: { in: ids } }, { appointmentId: { in: appointmentIds } }, { id: { in: notificationIds } }] } }),
    tx.review.findMany({ where: { OR: [{ doctorId: { in: ids } }, { patientId: { in: ids } }, { appointmentId: { in: appointmentIds } }, { id: { in: reviewIds } }] } }),
    tx.prescription.findMany({ where: { OR: [{ doctorId: { in: ids } }, { patientId: { in: ids } }, { appointmentId: { in: appointmentIds } }, { id: { in: prescriptionIds } }] } }),
    tx.prescriptionMedicine.findMany({ where: { OR: [{ prescriptionId: { in: prescriptionIds } }, { id: { in: medicineIds } }] } }),
  ]);

  assertExpectedOwnership(appointments, EXPECTED_APPOINTMENTS, "appointment", (row, expected) => row.doctorId === expected.doctorId && row.patientId === expected.patientId);
  assertExpectedOwnership(availability, EXPECTED_AVAILABILITY, "availability record", (row, expected) => row.doctorId === expected.doctorId);
  if (payouts.length > 0) {
    throw new Error("Safety stop: a targeted demo doctor has payout records; financial records will not be removed.");
  }
  assertExpectedOwnership(transactions, EXPECTED_TRANSACTIONS, "credit transaction", (row, expected) => row.userId === expected.userId && row.allocationKey === expected.allocationKey);
  assertExpectedOwnership(notifications, EXPECTED_NOTIFICATIONS, "notification", (row, expected) => row.userId === expected.userId && row.appointmentId === expected.appointmentId);
  assertExpectedOwnership(reviews, EXPECTED_REVIEWS, "review", (row, expected) => row.appointmentId === expected.appointmentId && row.patientId === expected.patientId && row.doctorId === expected.doctorId);
  assertExpectedOwnership(prescriptions, EXPECTED_PRESCRIPTIONS, "prescription", (row, expected) => row.appointmentId === expected.appointmentId);
  assertExpectedOwnership(medicines, EXPECTED_MEDICINES, "prescription medicine", (row, expected) => row.prescriptionId === expected.prescriptionId);

  return [...byAnyIdentifier.keys()];
}

async function seedDemoData() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Safety stop: demo seeding is disabled when NODE_ENV=production.");
  }
  if (process.env.CHIKITSAAK_ENABLE_DEMO_SEED !== "YES") {
    throw new Error("Safety stop: set CHIKITSAAK_ENABLE_DEMO_SEED=YES only after verifying the target is a disposable or development database.");
  }
  if (process.env.CHIKITSAAK_DEMO_DATABASE !== "YES") {
    throw new Error("Safety stop: set CHIKITSAAK_DEMO_DATABASE=YES only after explicitly confirming DATABASE_URL targets the intended disposable or development database.");
  }

  console.warn("WARNING: This is a destructive demo-data operation. It replaces only allowlisted demo records; run it only against the intended disposable or development database.");

  await prisma.$transaction(async (tx) => {
    const existingUserIds = await assertSafeToReplaceDemoData(tx);
    const appointmentIds = [...EXPECTED_APPOINTMENTS.keys()];
    const availabilityIds = [...EXPECTED_AVAILABILITY.keys()];
    const transactionIds = [...EXPECTED_TRANSACTIONS.keys()];
    const notificationIds = [...EXPECTED_NOTIFICATIONS.keys()];
    const reviewIds = [...EXPECTED_REVIEWS.keys()];
    const prescriptionIds = [...EXPECTED_PRESCRIPTIONS.keys()];

    // Only explicitly generated demo IDs are cleaned. Unexpected dependent or
    // financial records cause the preflight above to abort the whole transaction.
    await tx.appointmentReminder.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await tx.notification.deleteMany({ where: { id: { in: notificationIds } } });
    await tx.review.deleteMany({ where: { id: { in: reviewIds } } });
    await tx.prescription.deleteMany({ where: { id: { in: prescriptionIds } } });
    await tx.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await tx.availability.deleteMany({ where: { id: { in: availabilityIds } } });
    await tx.creditTransaction.deleteMany({ where: { id: { in: transactionIds } } });

    if (existingUserIds.length > 0) {
      await tx.user.deleteMany({ where: { id: { in: existingUserIds } } });
    }

    await tx.user.createMany({
      data: DEMO_USERS.map((user) => ({
        ...user,
        verificationStatus: user.role === "DOCTOR" ? "VERIFIED" : null,
        updatedAt: seedTimestamp,
      })),
    });
    await tx.availability.createMany({ data: AVAILABILITY_DEFINITIONS });
    await tx.appointment.createMany({ data: APPOINTMENTS.map((appointment) => ({ ...appointment, updatedAt: seedTimestamp })) });
    await tx.creditTransaction.createMany({ data: CREDIT_TRANSACTIONS });
    await tx.notification.createMany({ data: NOTIFICATIONS });
    await tx.review.createMany({ data: REVIEW_DEFINITIONS.map((review) => ({ ...review, updatedAt: seedTimestamp })) });

    for (const prescription of PRESCRIPTION_DEFINITIONS) {
      await tx.prescription.create({
        data: {
          id: prescription.id,
          appointmentId: prescription.appointmentId,
          patientId: APPOINTMENTS.find((appointment) => appointment.id === prescription.appointmentId).patientId,
          doctorId: APPOINTMENTS.find((appointment) => appointment.id === prescription.appointmentId).doctorId,
          diagnosis: prescription.diagnosis,
          generalInstructions: prescription.generalInstructions,
          medicines: {
            create: MEDICINES
              .filter((medicine) => medicine.prescriptionId === prescription.id)
              .map(({ id, prescriptionId, ...medicine }) => ({ id, ...medicine })),
          },
        },
      });
    }
  }, { isolationLevel: "Serializable", timeout: 30000 });

  console.log("Demo seed completed: 3 doctors, 5 patients, and allowlisted related demo records.");
}

seedDemoData()
  .catch((error) => {
    const safeName = typeof error?.name === "string"
      ? error.name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) || "UnknownError"
      : "UnknownError";
    const safeType = typeof error?.constructor?.name === "string"
      ? error.constructor.name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) || "UnknownType"
      : typeof error;
    const safeErrorCode = typeof error?.errorCode === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(error.errorCode)
      ? error.errorCode
      : "unavailable";
    const classification = error?.message?.startsWith("Safety stop:")
      ? "seed-safety"
      : /^P1000$/.test(safeErrorCode) || /^28P01$/.test(safeErrorCode)
        ? "authentication"
        : /^(P1001|P1002|P1017|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH)$/.test(safeErrorCode)
          ? "connection"
          : /^(P2024|ETIMEDOUT)$/.test(safeErrorCode)
            ? "timeout"
            : /^P2[0-9]{3}$/.test(safeErrorCode)
              ? "query"
              : "unknown";

    console.error("Demo seed stopped safely. No connection string or credentials were printed.");
    console.error(`Diagnostic: name=${safeName}; type=${safeType}; errorCode=${safeErrorCode}; classification=${classification}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
