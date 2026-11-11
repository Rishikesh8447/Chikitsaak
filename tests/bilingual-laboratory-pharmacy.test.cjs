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

test("laboratory and pharmacy dictionary keys have complete English and Hindi parity", async () => {
  const { DICTIONARY } = await import(dictionaryPath);

  assert.ok(DICTIONARY.en.laboratory, "en.laboratory dictionary must exist");
  assert.ok(DICTIONARY.hi.laboratory, "hi.laboratory dictionary must exist");
  assert.ok(DICTIONARY.en.pharmacy, "en.pharmacy dictionary must exist");
  assert.ok(DICTIONARY.hi.pharmacy, "hi.pharmacy dictionary must exist");

  const enLabKeys = collectLeafKeys(DICTIONARY.en.laboratory, "laboratory").sort();
  const hiLabKeys = collectLeafKeys(DICTIONARY.hi.laboratory, "laboratory").sort();
  assert.deepEqual(hiLabKeys, enLabKeys, "Laboratory keys must match between en and hi");

  const enPharmKeys = collectLeafKeys(DICTIONARY.en.pharmacy, "pharmacy").sort();
  const hiPharmKeys = collectLeafKeys(DICTIONARY.hi.pharmacy, "pharmacy").sort();
  assert.deepEqual(hiPharmKeys, enPharmKeys, "Pharmacy keys must match between en and hi");

  // Verify Hindi laboratory strings contain Devanagari characters
  const devanagariRegex = /[\u0900-\u097F]/;
  for (const key of hiLabKeys) {
    const val = key.replace("laboratory.", "").split(".").reduce((acc, part) => acc?.[part], DICTIONARY.hi.laboratory);
    assert.ok(typeof val === "string" && val.trim().length > 0, `hi.${key} must be non-empty`);
    // Ensure translation is Hindi
    assert.ok(devanagariRegex.test(val), `hi.${key} must contain Hindi/Devanagari characters: "${val}"`);
  }

  // Verify Hindi pharmacy strings contain Devanagari characters
  for (const key of hiPharmKeys) {
    const val = key.replace("pharmacy.", "").split(".").reduce((acc, part) => acc?.[part], DICTIONARY.hi.pharmacy);
    assert.ok(typeof val === "string" && val.trim().length > 0, `hi.${key} must be non-empty`);
    assert.ok(devanagariRegex.test(val), `hi.${key} must contain Hindi/Devanagari characters: "${val}"`);
  }
});

test("PatientLaboratoryView connects to dictionary translations and renders localized structure", async () => {
  const source = await readFile(join(cwd, "components", "patient-laboratory-view.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "PatientLaboratoryView must import and consume useLanguage");
  assert.ok(source.includes('t("laboratory.title"'), "PatientLaboratoryView must translate title");
  assert.ok(source.includes('t("laboratory.subtitle"'), "PatientLaboratoryView must translate subtitle");
  assert.ok(source.includes('t("laboratory.certifiedLabsTitle"'), "PatientLaboratoryView must translate trust badges");
  assert.ok(source.includes('t("laboratory.bookingTitle"'), "PatientLaboratoryView must translate booking card title");
  assert.ok(source.includes('t("laboratory.myOrdersTitle"'), "PatientLaboratoryView must translate orders tracker title");
  assert.ok(source.includes('t("laboratory.statusRequested"'), "PatientLaboratoryView must translate order statuses");
  assert.ok(source.includes('t("laboratory.totalAtBooking"'), "PatientLaboratoryView must translate total price string");
  assert.ok(source.includes('t("laboratory.collectionScheduled"'), "PatientLaboratoryView must translate collection schedule");
  assert.ok(source.includes('t("laboratory.noOrdersTitle"'), "PatientLaboratoryView must translate empty state");
});

test("PatientPharmacyView connects to dictionary translations and renders localized structure", async () => {
  const source = await readFile(join(cwd, "components", "patient-pharmacy-view.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "PatientPharmacyView must import and consume useLanguage");
  assert.ok(source.includes('t("pharmacy.title"'), "PatientPharmacyView must translate title");
  assert.ok(source.includes('t("pharmacy.subtitle"'), "PatientPharmacyView must translate subtitle");
  assert.ok(source.includes('t("pharmacy.requestsTitle"'), "PatientPharmacyView must translate dispensing requests title");
  assert.ok(source.includes('t("pharmacy.statusAwaitingStoreConfirmation"'), "PatientPharmacyView must translate request statuses");
  assert.ok(source.includes('t("pharmacy.prescriptionsTitle"'), "PatientPharmacyView must translate prescriptions section");
  assert.ok(source.includes('t("pharmacy.catalogTitle"'), "PatientPharmacyView must translate catalog section");
  assert.ok(source.includes('t("pharmacy.policyTitle"'), "PatientPharmacyView must translate policy section");
  assert.ok(source.includes('t("pharmacy.noPrescriptionsTitle"'), "PatientPharmacyView must translate empty prescription state");
});

test("PatientPharmacyCatalog connects to dictionary translations for search, selection, and modal", async () => {
  const source = await readFile(join(cwd, "components", "patient-pharmacy-catalog.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "PatientPharmacyCatalog must import and consume useLanguage");
  assert.ok(source.includes('t("pharmacy.searchPlaceholder"'), "PatientPharmacyCatalog must translate search placeholder");
  assert.ok(source.includes('t("pharmacy.locationLabel"'), "PatientPharmacyCatalog must translate location label");
  assert.ok(source.includes('t("pharmacy.allLocations"'), "PatientPharmacyCatalog must translate all locations option");
  assert.ok(source.includes('t("pharmacy.reviewAndRequestBtn"'), "PatientPharmacyCatalog must translate review button");
  assert.ok(source.includes('t("pharmacy.modalTitle"'), "PatientPharmacyCatalog must translate modal title");
  assert.ok(source.includes('t("pharmacy.submitRequestBtn"'), "PatientPharmacyCatalog must translate submit button");
  assert.ok(source.includes('t("pharmacy.inPrescriptionBadge"'), "PatientPharmacyCatalog must translate prescription badge");
  assert.ok(source.includes('t("pharmacy.selectMedicineBtn"'), "PatientPharmacyCatalog must translate select button");
  assert.ok(source.includes('t("pharmacy.noProductsFoundTitle"'), "PatientPharmacyCatalog must translate empty search results");
});

test("laboratory forms translate patient booking, lab selection, and order retry actions", async () => {
  const source = await readFile(join(cwd, "components", "laboratory-forms.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "laboratory-forms must import useLanguage");
  assert.ok(source.includes('t("laboratory.selectLab"'), "PatientBookingForm must translate lab select label");
  assert.ok(source.includes('t("laboratory.availableTests"'), "PatientBookingForm must translate available tests legend");
  assert.ok(source.includes('t("laboratory.requestTestsBtn"'), "PatientBookingForm must translate request button");
  assert.ok(source.includes('t("laboratory.chooseLabLabel"'), "PatientChooseLabForm must translate choose lab label");
  assert.ok(source.includes('t("laboratory.confirmLabBtn"'), "PatientChooseLabForm must translate confirm lab button");
  assert.ok(source.includes('t("laboratory.chooseAnotherLabBtn"'), "PatientRetryLabOrderForm must translate retry button");
});

test("pharmacy forms translate patient cancellation action", async () => {
  const source = await readFile(join(cwd, "components", "pharmacy-forms.jsx"), "utf8");

  assert.ok(source.includes("useLanguage"), "pharmacy-forms must import useLanguage");
  assert.ok(source.includes('t("pharmacy.cancelRequestBtn"'), "PatientCancelRequestButton must translate cancel button");
  assert.ok(source.includes('t("pharmacy.cancelRequestLoading"'), "PatientCancelRequestButton must translate loading state");
});

test("LanguageProvider strictly enforces English isolation on workspace routes", async () => {
  const source = await readFile(join(cwd, "components", "language-provider.jsx"), "utf8");

  // Verify that workspace routes are marked as staff routes
  assert.ok(
    source.includes('pathname.includes("/workspace")'),
    "LanguageProvider must classify /workspace routes as staff routes"
  );
  assert.ok(
    source.includes('const isStaff = isStaffRoute || isStaffRole;'),
    "LanguageProvider must enforce isStaff for staff routes or roles"
  );
  assert.ok(
    source.includes("locale: isStaff ? DEFAULT_LOCALE : locale"),
    "LanguageProvider must force DEFAULT_LOCALE (en) in context when isStaff is true"
  );
  assert.ok(
    source.includes("if (isStaff)") && source.includes("DICTIONARY[DEFAULT_LOCALE]"),
    "LanguageProvider must force canonical English translations when isStaff is true"
  );
});

