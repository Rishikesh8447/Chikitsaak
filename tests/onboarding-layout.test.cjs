const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const pagePath = join(__dirname, "..", "app", "(main)", "onboarding", "page.jsx");

test("onboarding role cards use the requested responsive grid and order", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /grid w-full min-w-0 grid-cols-1 gap-6 sm:grid-cols-2/);
  assert.doesNotMatch(source, /lg:grid-cols-4|whitespace-nowrap/);

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
  assert.equal((source.match(/className="h-full min-w-0 border-emerald-900\/20 transition-all"/g) || []).length, 4);
  assert.equal((source.match(/className="flex flex-1 flex-col items-center pt-6 pb-6 text-center"/g) || []).length, 4);
  assert.equal((source.match(/className="mt-auto h-auto min-h-10 w-full min-w-0 whitespace-normal break-words px-3 py-2 text-center leading-snug bg-primary hover:bg-primary\/90"/g) || []).length, 2);
  assert.equal((source.match(/className=\{buttonVariants\(\{ className: "mt-auto h-auto min-h-10 w-full min-w-0 whitespace-normal break-words px-3 py-2 text-center leading-snug bg-primary hover:bg-primary\/90" \}\)\}/g) || []).length, 2);
  assert.equal((source.match(/className="mb-2 min-w-0 max-w-full break-words text-xl font-semibold text-foreground"/g) || []).length, 4);
  assert.equal((source.match(/className="mb-4 min-w-0 max-w-full flex-1 break-words"/g) || []).length, 4);
});
