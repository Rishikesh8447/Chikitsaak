const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const pagePath = join(__dirname, "..", "app", "(main)", "onboarding", "page.jsx");

test("onboarding role cards use the requested responsive grid and order", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4/);

  const patient = source.indexOf("Join as a Patient");
  const doctor = source.indexOf("Join as a Doctor");
  const laboratory = source.indexOf("Laboratory Partner");
  const pharmacy = source.indexOf("Pharmacy Partner");
  assert.ok(patient >= 0 && patient < doctor && doctor < laboratory && laboratory < pharmacy);

  assert.match(source, /onClick=\{handlePatientSelection\}/);
  assert.match(source, /onClick=\{\(\) => setStep\("doctor-form"\)\}/);
  assert.match(source, /href="\/laboratory\/workspace"/);
  assert.match(source, /Laboratory onboarding/);
  assert.match(source, /href="\/pharmacy\/workspace"/);
  assert.match(source, /Chemist \/ Pharmacy onboarding/);
});

test("onboarding role cards share height, content spacing, and button styling", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.equal((source.match(/className="h-full border-emerald-900\/20 transition-all"/g) || []).length, 4);
  assert.equal((source.match(/className="flex flex-1 flex-col items-center pt-6 pb-6 text-center"/g) || []).length, 4);
  assert.equal((source.match(/className="mt-auto w-full bg-primary hover:bg-primary\/90"/g) || []).length, 4);
});
