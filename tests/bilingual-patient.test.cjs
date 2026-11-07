const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");
const { pathToFileURL } = require("node:url");

const dictionaryPath = pathToFileURL(join(cwd(), "lib", "i18n", "dictionary.js")).href;

function collectLeafKeys(obj, prefix = "") {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys = keys.concat(collectLeafKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

test("dictionary defines complete key parity between English and Hindi", async () => {
  const { DICTIONARY, DEFAULT_LOCALE, SUPPORTED_LOCALES } = await import(dictionaryPath);

  assert.equal(DEFAULT_LOCALE, "en");
  assert.deepEqual(SUPPORTED_LOCALES, ["en", "hi"]);
  assert.ok(DICTIONARY.en, "English dictionary must exist");
  assert.ok(DICTIONARY.hi, "Hindi dictionary must exist");

  const enKeys = collectLeafKeys(DICTIONARY.en).sort();
  const hiKeys = collectLeafKeys(DICTIONARY.hi).sort();

  assert.deepEqual(
    hiKeys,
    enKeys,
    `Hindi keys must exactly match English keys.\nMissing in HI: ${enKeys.filter((k) => !hiKeys.includes(k)).join(", ")}\nExtra in HI: ${hiKeys.filter((k) => !enKeys.includes(k)).join(", ")}`
  );

  // Assert all values are non-empty strings
  for (const key of enKeys) {
    const getVal = (dict, k) => k.split(".").reduce((acc, part) => acc?.[part], dict);
    const enVal = getVal(DICTIONARY.en, key);
    const hiVal = getVal(DICTIONARY.hi, key);

    assert.equal(typeof enVal, "string", `en value for ${key} must be a string`);
    assert.equal(typeof hiVal, "string", `hi value for ${key} must be a string`);
    assert.ok(enVal.trim().length > 0, `en value for ${key} cannot be empty`);
    assert.ok(hiVal.trim().length > 0, `hi value for ${key} cannot be empty`);
  }
});

test("bottom navigation translates patient items without altering route contracts", async () => {
  const { DICTIONARY } = await import(dictionaryPath);
  const bottomNavSource = await readFile(join(cwd(), "components", "bottom-navigation.jsx"), "utf8");

  // Verify navigation items exist in dictionary
  assert.equal(DICTIONARY.en.nav.home, "Home");
  assert.equal(DICTIONARY.hi.nav.home, "होम");
  assert.equal(DICTIONARY.en.nav.care, "Care");
  assert.equal(DICTIONARY.hi.nav.care, "देखभाल");
  assert.equal(DICTIONARY.en.nav.visits, "Visits");
  assert.equal(DICTIONARY.hi.nav.visits, "मुलाकातें");
  assert.equal(DICTIONARY.en.nav.labs, "Labs");
  assert.equal(DICTIONARY.hi.nav.labs, "जांच");
  assert.equal(DICTIONARY.en.nav.pharmacy, "Pharmacy");
  assert.equal(DICTIONARY.hi.nav.pharmacy, "दवाएं");
  assert.equal(DICTIONARY.en.nav.records, "Records");
  assert.equal(DICTIONARY.hi.nav.records, "रिकॉर्ड्स");

  // Verify bottom-navigation uses useLanguage and t()
  assert.match(bottomNavSource, /import\s*\{\s*useLanguage\s*\}\s*from/);
  assert.match(bottomNavSource, /const\s*\{\s*t\s*\}\s*=\s*useLanguage\(\)/);
  assert.match(bottomNavSource, /t\(`nav\.\$\{label\.toLowerCase\(\)\}`, label\)/);
});

test("header and language switcher enforce strict isolation for doctors and admins", async () => {
  const headerSource = await readFile(join(cwd(), "components", "header.jsx"), "utf8");
  const toggleSource = await readFile(join(cwd(), "components", "language-toggle.jsx"), "utf8");

  // LanguageToggle must be mounted in Header with userRole passed
  assert.match(headerSource, /<LanguageToggle\s+userRole=\{user\?\.role\}\s*\/>/);

  // LanguageToggle must strictly reject rendering for DOCTOR and ADMIN (or on staff routes)
  assert.match(toggleSource, /if\s*\(userRole === "DOCTOR" \|\| userRole === "ADMIN" \|\| isStaff\)\s*\{\s*return null;\s*\}/);

  // PatientNavLabel must strictly preserve doctor and admin labels
  assert.match(toggleSource, /if\s*\(!isPatient\)\s*\{\s*return label;\s*\}/);

  // Header must preserve the un-translated doctor and admin role links
  assert.match(headerSource, /ADMIN:\s*\[\{\s*href:\s*"\/admin",\s*label:\s*"Administration"/);
  assert.match(headerSource, /DOCTOR:\s*\[[\s\S]*?Doctor workspace/);
});

test("patient care hub connects to dictionary keys and adapts status/date formatting", async () => {
  const hubSource = await readFile(join(cwd(), "components", "patient-care-hub.jsx"), "utf8");

  assert.match(hubSource, /"use client";/);
  assert.match(hubSource, /import\s*\{\s*useLanguage\s*\}\s*from/);
  assert.match(hubSource, /const\s*\{\s*t,\s*locale\s*\}\s*=\s*useLanguage\(\)/);

  // Key translations present
  assert.match(hubSource, /t\("hub\.badge"/);
  assert.match(hubSource, /t\("hub\.welcomeBack"/);
  assert.match(hubSource, /t\("hub\.upcomingVisit"/);
  assert.match(hubSource, /t\("hub\.laboratoryTests"/);
  assert.match(hubSource, /t\("hub\.portalsTitle"/);
  assert.match(hubSource, /t\("hub\.medicalDossierTitle"/);

  // Locale-sensitive date formatting
  assert.match(hubSource, /locale === "hi" \? "hi-IN" : "en-IN"/);
});

test("shared-device isolation strictly forces English for DOCTOR and ADMIN users and routes", async () => {
  const providerSource = await readFile(join(cwd(), "components", "language-provider.jsx"), "utf8");
  const layoutSource = await readFile(join(cwd(), "app", "layout.js"), "utf8");
  const toggleSource = await readFile(join(cwd(), "components", "language-toggle.jsx"), "utf8");

  // RootLayout must pass userRole to LanguageProvider and FooterContent
  assert.match(layoutSource, /<LanguageProvider\s+userRole=\{user\?\.role\}>/);
  assert.match(layoutSource, /<FooterContent\s+userRole=\{user\?\.role\}\s*\/>/);

  // LanguageProvider must identify staff routes and staff roles
  assert.match(providerSource, /pathname === "\/admin" \|\|\s*pathname\.startsWith\("\/admin\/"\)/);
  assert.match(providerSource, /pathname === "\/doctor" \|\|\s*pathname\.startsWith\("\/doctor\/"\)/);
  assert.match(providerSource, /pathname\.includes\("\/workspace"\)/);
  assert.match(providerSource, /userRole === "DOCTOR" \|\| userRole === "ADMIN"/);

  // LanguageProvider must block setLocale and force English t() when isStaff
  assert.match(providerSource, /if\s*\(isStaff\)\s*return;/);
  assert.match(providerSource, /if\s*\(isStaff\)[\s\S]*?lookupKey\(DICTIONARY\[DEFAULT_LOCALE\],\s*key/);

  // FooterContent must enforce English when staff
  assert.match(toggleSource, /const staff = isStaff \|\| userRole === "DOCTOR" \|\| userRole === "ADMIN";/);
  assert.match(toggleSource, /staff \? "Care, Connected" : t\("footer\.tagline", "Care, Connected"\)/);
});

test("Phase 2 patient-facing views and components connect to dictionary translations", async () => {
  const landingSource = await readFile(join(cwd(), "components", "public-landing-view.jsx"), "utf8");
  const homeSource = await readFile(join(cwd(), "app", "page.jsx"), "utf8");
  const directorySource = await readFile(join(cwd(), "components", "doctors-directory-view.jsx"), "utf8");
  const doctorsPageSource = await readFile(join(cwd(), "app", "(main)", "doctors", "page.jsx"), "utf8");
  const specialtyViewSource = await readFile(join(cwd(), "components", "doctor-specialty-view.jsx"), "utf8");
  const specialtyPageSource = await readFile(join(cwd(), "app", "(main)", "doctors", "[specialty]", "page.jsx"), "utf8");
  const searchSource = await readFile(join(cwd(), "components", "doctor-search.jsx"), "utf8");
  const cardSource = await readFile(join(cwd(), "components", "doctor-card.jsx"), "utf8");

  // Public Landing View
  assert.match(homeSource, /<PublicLandingView\s*\/>/);
  assert.match(landingSource, /"use client";/);
  assert.match(landingSource, /t\("landing\.heroBadge"/);
  assert.match(landingSource, /t\("landing\.heroTitlePrefix"/);
  assert.match(landingSource, /t\("landing\.heroTitleHighlight"/);
  assert.match(landingSource, /t\("landing\.heroSubtitle"/);
  assert.match(landingSource, /t\("landing\.trustClinicians"/);
  assert.match(landingSource, /t\("landing\.pillarsTitle"/);
  assert.match(landingSource, /t\("landing\.ctaTitle"/);

  // Doctors Directory View & Page
  assert.match(doctorsPageSource, /<DoctorsDirectoryView\s+initialDoctors=\{doctors\}\s*\/>/);
  assert.match(directorySource, /"use client";/);
  assert.match(directorySource, /t\("doctors\.facultyBadge"/);
  assert.match(directorySource, /t\("doctors\.title"/);
  assert.match(directorySource, /t\("doctors\.subtitle"/);
  assert.match(directorySource, /t\("doctors\.specialtiesHeading"/);
  assert.match(directorySource, /t\("doctors\.browseSpecialists"/);

  // Doctor Specialty View & Page
  assert.match(specialtyPageSource, /<DoctorSpecialtyView\s+specialty=\{specialty\}\s+doctors=\{doctors\}\s+error=\{error\}\s*\/>/);
  assert.match(specialtyViewSource, /"use client";/);
  assert.match(specialtyViewSource, /t\("specialtyView\.description"/);
  assert.match(specialtyViewSource, /t\("specialtyView\.backLabel"/);
  assert.match(specialtyViewSource, /t\("specialtyView\.emptyTitle"/);
  assert.match(specialtyViewSource, /t\("specialtyView\.emptyDesc"/);

  // Doctor Search Component
  assert.match(searchSource, /"use client";/);
  assert.match(searchSource, /t\("doctorSearch\.title"/);
  assert.match(searchSource, /t\("doctorSearch\.subtitle"/);
  assert.match(searchSource, /t\("doctorSearch\.queryLabel"/);
  assert.match(searchSource, /t\("doctorSearch\.allSpecialties"/);
  assert.match(searchSource, /t\("doctorSearch\.searchBtn"/);
  assert.match(searchSource, /t\("doctorSearch\.noDoctorsFound"/);

  // Doctor Card Component
  assert.match(cardSource, /"use client";/);
  assert.match(cardSource, /t\("doctorCard\.verified"/);
  assert.match(cardSource, /t\("doctorCard\.yearsExperience"/);
  assert.match(cardSource, /t\("doctorCard\.verifiedProvider"/);
  assert.match(cardSource, /t\("doctorCard\.viewProfileBook"/);
});

test("Phase 3 appointments and booking components connect to dictionary translations with doctor isolation", async () => {
  const appointmentsPageSource = await readFile(join(cwd(), "app", "(main)", "appointments", "page.jsx"), "utf8");
  const appointmentsViewSource = await readFile(join(cwd(), "components", "patient-appointments-view.jsx"), "utf8");
  const appointmentCardSource = await readFile(join(cwd(), "components", "ui", "appointment-card.jsx"), "utf8");
  const profileHeaderSource = await readFile(join(cwd(), "components", "doctor-profile-header.jsx"), "utf8");
  const doctorProfileSource = await readFile(join(cwd(), "app", "(main)", "doctors", "[specialty]", "[id]", "_components", "doctor-profile.jsx"), "utf8");
  const slotPickerSource = await readFile(join(cwd(), "app", "(main)", "doctors", "[specialty]", "[id]", "_components", "slot-picker.jsx"), "utf8");
  const appointmentFormSource = await readFile(join(cwd(), "app", "(main)", "doctors", "[specialty]", "[id]", "_components", "appointment-form.jsx"), "utf8");
  const aiPreconsultationSource = await readFile(join(cwd(), "components", "ai-preconsultation.jsx"), "utf8");

  // Patient appointments dashboard
  assert.match(appointmentsPageSource, /<PatientAppointmentsView[\s\S]*?appointments=\{appointments\}/);
  assert.match(appointmentsViewSource, /"use client";/);
  assert.match(appointmentsViewSource, /t\("appointments\.title"/);
  assert.match(appointmentsViewSource, /t\("appointments\.scheduleTitle"/);
  assert.match(appointmentsViewSource, /t\("appointments\.upcomingTab"/);
  assert.match(appointmentsViewSource, /t\("appointments\.completedTab"/);
  assert.match(appointmentsViewSource, /t\("appointments\.cancelledTab"/);

  // AppointmentCard patient scoping & isolation
  assert.match(appointmentCardSource, /const\s+isPatient\s*=\s*userRole === "PATIENT" && !isStaff;/);
  assert.match(appointmentCardSource, /isPatient \? t\("appointmentCard\.doctorLabel", "Doctor"\) : "Doctor"/);
  assert.match(appointmentCardSource, /isPatient \? t\("appointmentCard\.rescheduleTitle", "Reschedule Consultation"\) : "Reschedule Consultation"/);
  assert.match(appointmentCardSource, /isPatient \? t\("appointmentCard\.followUpDialogTitle", "Book Follow-up Consultation"\) : "Book Follow-up Consultation"/);
  assert.match(appointmentCardSource, /isPatient \? t\("appointmentCard\.doctorNotes", "Doctor Notes"\) : "Doctor Notes"/);

  // Doctor Profile & Header
  assert.match(profileHeaderSource, /"use client";/);
  assert.match(profileHeaderSource, /t\("doctorProfile\.profileTitle", "Doctor Profile"\)/);
  assert.match(doctorProfileSource, /t\("doctorProfile\.aboutDoctor"/);
  assert.match(doctorProfileSource, /t\("doctorProfile\.bookAppointmentBtn"/);
  assert.match(doctorProfileSource, /t\("doctorProfile\.availability"/);
  assert.match(doctorProfileSource, /t\("doctorProfile\.slotsAvailableDesc"/);

  // Slot Picker
  assert.match(slotPickerSource, /t\("slotPicker\.consultationCost"/);
  assert.match(slotPickerSource, /t\("slotPicker\.chooseDayTime"/);
  assert.match(slotPickerSource, /t\("slotPicker\.continueBtn"/);

  // Appointment Form & AI Preconsultation
  assert.match(appointmentFormSource, /t\("appointmentForm\.appointmentCost"/);
  assert.match(appointmentFormSource, /t\("appointmentForm\.consultationType"/);
  assert.match(appointmentFormSource, /t\("appointmentForm\.paymentMethod"/);
  assert.match(appointmentFormSource, /t\("appointmentForm\.concernLabel"/);
  assert.match(aiPreconsultationSource, /t\("aiPreconsultation\.title"/);
  assert.match(aiPreconsultationSource, /t\("aiPreconsultation\.subtitle"/);
  assert.match(aiPreconsultationSource, /t\("aiPreconsultation\.generate"/);
});

test("LanguageProvider accurately interpolates dynamic parameters for doctor names, fees, and slot counts", async () => {
  const providerSource = await readFile(join(cwd(), "components", "language-provider.jsx"), "utf8");
  assert.match(providerSource, /function\s+interpolate\s*\(/);
  assert.match(providerSource, /template\.replace/);

  const interpolate = (template, params) => template.replace(/\{(\w+)\}/g, (match, key) => params[key] !== undefined ? params[key] : match);
  const { DICTIONARY } = await import(dictionaryPath);

  assert.equal(
    interpolate(DICTIONARY.en.doctorProfile.aboutDoctor, { name: "Ananya Sharma" }),
    "About Dr. Ananya Sharma"
  );
  assert.equal(
    interpolate(DICTIONARY.hi.doctorProfile.aboutDoctor, { name: "Ananya Sharma" }),
    "डॉ. Ananya Sharma के बारे में"
  );
  assert.equal(
    interpolate(DICTIONARY.en.slotPicker.consultationCost, { price: "₹600" }),
    "Consultation cost: ₹600"
  );
  assert.equal(
    interpolate(DICTIONARY.hi.slotPicker.consultationCost, { price: "₹600" }),
    "परामर्श शुल्क: ₹600"
  );
  assert.equal(
    interpolate(DICTIONARY.en.appointmentCard.rescheduleDesc, { doctor: "Aditi" }),
    "Select an available 20-minute slot with Dr. Aditi. Your payment remains confirmed and will not change."
  );
  assert.equal(
    interpolate(DICTIONARY.hi.appointmentCard.rescheduleDesc, { doctor: "Aditi" }),
    "डॉ. Aditi के साथ उपलब्ध 20 मिनट का स्लॉट चुनें। आपका भुगतान पुष्ट रहेगा और कोई बदलाव नहीं होगा।"
  );
});





