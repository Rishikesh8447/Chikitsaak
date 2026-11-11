const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const cwd = process.cwd();
const dictionaryPath = pathToFileURL(join(cwd, "lib", "i18n", "dictionary.js")).href;

function collectLeafKeys(obj, prefix = "") {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys = keys.concat(collectLeafKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

test("new namespaces have complete English and Hindi parity with Devanagari characters", async () => {
  const { DICTIONARY } = await import(dictionaryPath);

  const namespaces = ["analytics", "medicalRecords", "notifications", "videoCall", "onboarding"];
  const devanagariRegex = /[\u0900-\u097F]/;

  for (const ns of namespaces) {
    assert.ok(DICTIONARY.en[ns], `en.${ns} dictionary must exist`);
    assert.ok(DICTIONARY.hi[ns], `hi.${ns} dictionary must exist`);

    const enKeys = collectLeafKeys(DICTIONARY.en[ns], ns).sort();
    const hiKeys = collectLeafKeys(DICTIONARY.hi[ns], ns).sort();

    assert.deepEqual(hiKeys, enKeys, `Namespace ${ns} keys must match between en and hi`);

    for (const key of hiKeys) {
      const subKey = key.replace(`${ns}.`, "");
      const val = subKey.split(".").reduce((acc, part) => acc?.[part], DICTIONARY.hi[ns]);
      assert.ok(typeof val === "string" && val.trim().length > 0, `hi.${key} must be non-empty`);
      assert.ok(devanagariRegex.test(val), `hi.${key} must contain Hindi/Devanagari characters: "${val}"`);
    }
  }
});

test("AnalyticsPanel connects to dictionary translations and localizes metrics, status, and periods", async () => {
  const source = await readFile(join(cwd, "components", "analytics-panel.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "AnalyticsPanel must import and consume useLanguage");
  assert.ok(source.includes("analytics.metricTotalConsultations"), "AnalyticsPanel must translate total consultations");
  assert.ok(source.includes("analytics.appointmentsOverTime"), "AnalyticsPanel must translate appointments over time");
  assert.ok(source.includes("analytics.statusBreakdown"), "AnalyticsPanel must translate status breakdown");
  assert.ok(source.includes("analytics.lastYear"), "AnalyticsPanel must translate last year badge");
  assert.ok(source.includes("analytics.lastDays"), "AnalyticsPanel must translate last days badge");
  assert.ok(source.includes("analytics.statusCompleted"), "AnalyticsPanel must translate COMPLETED status");
});

test("PatientMedicalRecordsView connects to dictionary translations for dossier, history, and prescriptions", async () => {
  const source = await readFile(join(cwd, "components", "patient-medical-records-view.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "PatientMedicalRecordsView must import and consume useLanguage");
  assert.ok(source.includes('t("medicalRecords.title"'), "PatientMedicalRecordsView must translate page title");
  assert.ok(source.includes('t("medicalRecords.encryptedBadge"'), "PatientMedicalRecordsView must translate encrypted badge");
  assert.ok(source.includes('t("medicalRecords.consultationHistoryTitle"'), "PatientMedicalRecordsView must translate consultation history title");
  assert.ok(source.includes('t("medicalRecords.verifiedPrescriptionsTitle"'), "PatientMedicalRecordsView must translate verified prescriptions title");
  assert.ok(source.includes('t("medicalRecords.emptyHistory"'), "PatientMedicalRecordsView must translate empty history state");
  assert.ok(source.includes('t("medicalRecords.emptyPrescriptionsTitle"'), "PatientMedicalRecordsView must translate empty prescriptions title");
});

test("MedicalProfileForm connects to dictionary translations for form fields and actions", async () => {
  const source = await readFile(join(cwd, "components", "medical-profile-form.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "MedicalProfileForm must import and consume useLanguage");
  assert.ok(source.includes('t("medicalRecords.bloodGroup"'), "MedicalProfileForm must translate bloodGroup label");
  assert.ok(source.includes('t("medicalRecords.allergies"'), "MedicalProfileForm must translate allergies label");
  assert.ok(source.includes('t("medicalRecords.existingConditions"'), "MedicalProfileForm must translate existingConditions label");
  assert.ok(source.includes('t("medicalRecords.currentMedications"'), "MedicalProfileForm must translate currentMedications label");
  assert.ok(source.includes('t("medicalRecords.saveButton"'), "MedicalProfileForm must translate save button");
  assert.ok(source.includes('t("medicalRecords.profileUpdated"'), "MedicalProfileForm must translate update toast");
});

test("NotificationCenter connects to dictionary translations with staff isolation", async () => {
  const source = await readFile(join(cwd, "components", "notification-center.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "NotificationCenter must import and consume useLanguage");
  assert.ok(source.includes('t("notifications.title"'), "NotificationCenter must translate title");
  assert.ok(source.includes('t("notifications.markAllRead"'), "NotificationCenter must translate mark all read");
  assert.ok(source.includes('t("notifications.loading"'), "NotificationCenter must translate loading state");
  assert.ok(source.includes('t("notifications.empty"'), "NotificationCenter must translate empty state");
});

test("AppointmentCard toasts and action feedback connect to dictionary translations", async () => {
  const source = await readFile(join(cwd, "components", "ui", "appointment-card.jsx"), "utf8");

  assert.ok(source.includes("appointmentCard.consultationStartTime"), "AppointmentCard must translate consultation start time toast");
  assert.ok(source.includes("appointmentCard.appointmentEnded"), "AppointmentCard must translate appointment ended toast");
  assert.ok(source.includes("appointmentCard.paymentVerified"), "AppointmentCard must translate payment verified toast");
  assert.ok(source.includes("appointmentCard.appointmentCancelled"), "AppointmentCard must translate appointment cancelled toast");
  assert.ok(source.includes("appointmentCard.appointmentRescheduled"), "AppointmentCard must translate appointment rescheduled toast");
  assert.ok(source.includes("appointmentCard.followUpScheduled"), "AppointmentCard must translate follow-up scheduled toast");
});

test("VideoCall patient interface connects to dictionary translations with doctor role isolation", async () => {
  const source = await readFile(join(cwd, "app", "(main)", "video-call", "_components", "video-call.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "VideoCall must import and consume useLanguage");
  assert.ok(source.includes('t("videoCall.title"'), "VideoCall must translate title");
  assert.ok(source.includes('t("videoCall.connected"'), "VideoCall must translate connected badge");
  assert.ok(source.includes('t("videoCall.endCall"'), "VideoCall must translate end call button for patient");
  assert.ok(source.includes('t("videoCall.cameraOn"'), "VideoCall must translate camera status");
  assert.ok(source.includes('t("videoCall.remoteParticipant"'), "VideoCall must translate remote participant");
});

test("Onboarding role selection connects to dictionary translations", async () => {
  const source = await readFile(join(cwd, "app", "(main)", "onboarding", "page.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "OnboardingPage must import and consume useLanguage");
  assert.ok(source.includes('t("onboarding.joinPatientTitle"'), "OnboardingPage must translate patient card title");
  assert.ok(source.includes('t("onboarding.continuePatient"'), "OnboardingPage must translate continue patient button");
  assert.ok(source.includes('t("onboarding.joinDoctorTitle"'), "OnboardingPage must translate doctor card title");
  assert.ok(source.includes('t("onboarding.labPartnerTitle"'), "OnboardingPage must translate lab partner title");
  assert.ok(source.includes('t("onboarding.pharmacyPartnerTitle"'), "OnboardingPage must translate pharmacy partner title");
});

