const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const read = (path) => readFile(join(cwd(), path), "utf8");

test("partner header navigation is derived from active organization memberships", async () => {
  const header = await read("components/header.jsx");
  assert.match(header, /laboratoryMembership\.findFirst\(\{ where: \{ userId: user\.id, status: "ACTIVE" \}/);
  assert.match(header, /pharmacyMembership\.findFirst\(\{ where: \{ userId: user\.id, status: "ACTIVE" \}/);
  assert.match(header, /isLaboratoryPartner \? \[/);
  assert.match(header, /isPharmacyPartner \? \[/);
  assert.match(header, /isPartner \? \[/);
  assert.match(header, /user\?\.role === "PATIENT" && <Link href="\/credits"/);
  assert.match(header, /user\?\.role !== "ADMIN" && !isPartner/);
  for (const link of ["Test offerings", "Assigned orders", "Product catalogue", "Requests & orders", "Organization"]) {
    assert.ok(header.includes(link), `missing partner link: ${link}`);
  }
});

test("laboratory workspace loads organization members only for verified owners", async () => {
  const [action, page, error] = await Promise.all([
    read("actions/laboratory.js"),
    read("app/(main)/laboratory/workspace/page.jsx"),
    read("app/(main)/laboratory/workspace/error.jsx"),
  ]);
  assert.match(action, /selected\.laboratory\.status === "VERIFIED"/);
  assert.match(action, /selected\.role === "OWNER" && isVerified\s*\? db\.laboratoryMembership\.findMany/);
  assert.match(action, /isVerified && canManageOfferings\s*\? db\.labTest\.findMany/);
  assert.match(page, /selected\.status === "VERIFIED" && selected\.membershipRole === "OWNER" && <Card>[\s\S]*?Organization members/);
  assert.match(error, /Laboratory workspace unavailable/);
  assert.match(error, /unstable_retry/);
  assert.doesNotMatch(error, /error\.message/);
});
