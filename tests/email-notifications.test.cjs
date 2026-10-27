const { test } = require("node:test");
const assert = require("node:assert/strict");
const { join } = require("node:path");
const { cwd } = require("node:process");
const { pathToFileURL } = require("node:url");

const emailModulePromise = import(pathToFileURL(join(cwd(), "lib", "email.js")).href);

test("sendEmail returns gracefully when RESEND_API_KEY is missing", async () => {
  const { sendEmail, setResendClientForTesting } = await emailModulePromise;
  setResendClientForTesting(null);
  const originalKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    const result = await sendEmail({
      to: "patient@example.com",
      subject: "Test Subject",
      text: "Test content",
    });

    assert.equal(result.success, false);
    assert.equal(result.code, "EMAIL_NOT_CONFIGURED");
    assert.equal(result.skipped, true);
    assert.match(result.error, /RESEND_API_KEY is not configured/);
  } finally {
    if (originalKey !== undefined) process.env.RESEND_API_KEY = originalKey;
  }
});

test("sendEmail rejects invalid recipient addresses without throwing", async () => {
  const { sendEmail } = await emailModulePromise;

  for (const invalid of ["", "   ", "no-at-sign", null, undefined]) {
    const result = await sendEmail({
      to: invalid,
      subject: "Subject",
      text: "Body",
    });
    assert.equal(result.success, false);
    assert.equal(result.code, "INVALID_RECIPIENT");
  }
});

test("sendEmail gracefully handles Resend API errors (e.g. unverified domain) without throwing", async () => {
  const { sendEmail, setResendClientForTesting } = await emailModulePromise;

  const mockClient = {
    emails: {
      send: async () => ({
        data: null,
        error: { message: "Domain not verified: chikitsaak.in" },
      }),
    },
  };
  setResendClientForTesting(mockClient);

  try {
    const result = await sendEmail({
      to: "patient@example.com",
      subject: "Appointment Update",
      text: "Appointment details",
    });

    assert.equal(result.success, false);
    assert.equal(result.code, "DISPATCH_FAILED");
    assert.match(result.error, /Domain not verified/);
  } finally {
    setResendClientForTesting(null);
  }
});

test("sendEmail gracefully catches transport network exceptions without throwing", async () => {
  const { sendEmail, setResendClientForTesting } = await emailModulePromise;

  const mockClient = {
    emails: {
      send: async () => {
        throw new Error("ETIMEDOUT: Connection refused to api.resend.com");
      },
    },
  };
  setResendClientForTesting(mockClient);

  try {
    const result = await sendEmail({
      to: "patient@example.com",
      subject: "Appointment Update",
      text: "Appointment details",
    });

    assert.equal(result.success, false);
    assert.equal(result.code, "TRANSPORT_ERROR");
    assert.match(result.error, /ETIMEDOUT/);
  } finally {
    setResendClientForTesting(null);
  }
});

test("sendEmail successfully dispatches when client and config are valid", async () => {
  const { sendEmail, setResendClientForTesting } = await emailModulePromise;

  let capturedPayload = null;
  const mockClient = {
    emails: {
      send: async (payload) => {
        capturedPayload = payload;
        return { data: { id: "resend_msg_abc123" }, error: null };
      },
    },
  };
  setResendClientForTesting(mockClient);

  try {
    const result = await sendEmail({
      to: "patient@example.com",
      subject: "Appointment Booked",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    assert.equal(result.success, true);
    assert.equal(result.messageId, "resend_msg_abc123");
    assert.equal(capturedPayload.to, "patient@example.com");
    assert.equal(capturedPayload.subject, "Appointment Booked");
    assert.match(capturedPayload.from, /Chikitsaak/);
  } finally {
    setResendClientForTesting(null);
  }
});

test("Prescription email template strictly excludes medicines, dosages, and diagnoses for privacy", async () => {
  const { buildPrescriptionAvailableEmail, getBaseAppUrl } = await emailModulePromise;

  const email = buildPrescriptionAvailableEmail({
    patientName: "Alice Smith",
    doctorName: "Sharma",
    consultationDate: new Date("2026-10-27T10:00:00.000Z"),
    followUpRequired: false,
    followUpDays: null,
  });

  const baseUrl = getBaseAppUrl();

  // Subject and recipient check
  assert.match(email.subject, /New prescription available - Chikitsaak/);
  assert.match(email.html, /Dr\. Sharma/);
  assert.match(email.html, /Alice Smith/);

  // Must include authenticated link to /medical-records
  assert.match(email.html, new RegExp(`${baseUrl}/medical-records`));
  assert.match(email.text, new RegExp(`${baseUrl}/medical-records`));

  // Must NOT leak medicines, dosages, or diagnosis
  const sensitivePatterns = [
    /paracetamol/i,
    /amoxicillin/i,
    /metformin/i,
    /mg/i,
    /twice daily/i,
    /hypertension/i,
    /fever/i,
    /diagnosis:/i,
  ];
  for (const pattern of sensitivePatterns) {
    assert.doesNotMatch(email.html, pattern);
    assert.doesNotMatch(email.text, pattern);
  }
});

test("Prescription email template includes follow-up recommendation and ₹0 included copy", async () => {
  const { buildPrescriptionAvailableEmail, getBaseAppUrl } = await emailModulePromise;

  const email = buildPrescriptionAvailableEmail({
    patientName: "Bob Jones",
    doctorName: "Gupta",
    consultationDate: new Date("2026-10-27T10:00:00.000Z"),
    followUpRequired: true,
    followUpDays: 14,
  });

  const baseUrl = getBaseAppUrl();

  assert.match(email.subject, /Prescription & Follow-up recommendation available/);
  assert.match(email.html, /recommended a follow-up consultation within <strong>14 days<\/strong>/);
  assert.match(email.html, /included at ₹0/i);
  assert.match(email.html, new RegExp(`${baseUrl}/appointments`));

  assert.match(email.text, /within 14 days/);
  assert.match(email.text, /Included at ₹0/i);
  assert.match(email.text, new RegExp(`${baseUrl}/appointments`));
});

test("Appointment booked email distinguishes follow-up ₹0 from standard consultations", async () => {
  const { buildAppointmentBookedEmail, getBaseAppUrl } = await emailModulePromise;
  const baseUrl = getBaseAppUrl();

  // 1. Follow-up consultation
  const followUpEmail = buildAppointmentBookedEmail({
    recipientRole: "PATIENT",
    recipientName: "Alice",
    otherPartyName: "Sharma",
    startTime: new Date("2026-11-01T10:00:00.000Z"),
    consultationMode: "ONLINE",
    isFollowUp: true,
  });

  assert.match(followUpEmail.subject, /Follow-up consultation scheduled \(Included at ₹0\)/);
  assert.match(followUpEmail.html, /Follow-up Consultation \(Included at ₹0\)/);
  assert.match(followUpEmail.html, /included at ₹0 with no additional charges/);
  assert.match(followUpEmail.html, new RegExp(`${baseUrl}/appointments`));
  assert.match(followUpEmail.text, /Included at ₹0/);

  // 2. Standard consultation
  const standardEmail = buildAppointmentBookedEmail({
    recipientRole: "PATIENT",
    recipientName: "Alice",
    otherPartyName: "Sharma",
    startTime: new Date("2026-11-01T10:00:00.000Z"),
    consultationMode: "ONLINE",
    isFollowUp: false,
  });

  assert.match(standardEmail.subject, /Appointment scheduled - Chikitsaak/);
  assert.doesNotMatch(standardEmail.subject, /Follow-up/);
  assert.doesNotMatch(standardEmail.html, /Follow-up Consultation \(Included at ₹0\)/);
  assert.match(standardEmail.html, /Paid consultation/);
});

test("All templates use authentic application routes without fabrication", async () => {
  const {
    buildAppointmentBookedEmail,
    buildAppointmentConfirmedEmail,
    buildAppointmentCancelledEmail,
    buildAppointmentRescheduledEmail,
    buildAppointmentReminderEmail,
    buildPrescriptionAvailableEmail,
    getBaseAppUrl,
  } = await emailModulePromise;

  const baseUrl = getBaseAppUrl();
  const startTime = new Date("2026-11-01T10:00:00.000Z");

  const bookedDoctor = buildAppointmentBookedEmail({ recipientRole: "DOCTOR", startTime });
  assert.match(bookedDoctor.html, new RegExp(`${baseUrl}/doctor`));

  const bookedPatient = buildAppointmentBookedEmail({ recipientRole: "PATIENT", startTime });
  assert.match(bookedPatient.html, new RegExp(`${baseUrl}/appointments`));

  const confirmed = buildAppointmentConfirmedEmail({ startTime, appointmentId: "appt-123" });
  assert.match(confirmed.html, new RegExp(`${baseUrl}/appointments`));

  const cancelledPatient = buildAppointmentCancelledEmail({ recipientRole: "PATIENT", startTime });
  assert.match(cancelledPatient.html, new RegExp(`${baseUrl}/doctors`));

  const rescheduled = buildAppointmentRescheduledEmail({ recipientRole: "PATIENT", newStartTime: startTime });
  assert.match(rescheduled.html, new RegExp(`${baseUrl}/appointments`));

  const reminder = buildAppointmentReminderEmail({ recipientRole: "PATIENT", startTime, appointmentId: "appt-123" });
  assert.match(reminder.html, new RegExp(`${baseUrl}/appointments`));

  const prescription = buildPrescriptionAvailableEmail({ followUpRequired: false });
  assert.match(prescription.html, new RegExp(`${baseUrl}/medical-records`));
});
