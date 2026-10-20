const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");

const buttonPath = join(__dirname, "..", "components", "ui", "button.jsx");

test("legacy asChild renders its child with shared styling and link semantics", async () => {
  const source = await readFile(buttonPath, "utf8");

  assert.match(source, /render: children/);
  assert.match(source, /nativeButton=\{asChild \? false : nativeButton\}/);
  assert.match(source, /role: "link"/);
  assert.match(source, /className=\{cn\(buttonVariants\(\{ variant, size, className \}\)\)\}/);
  assert.match(source, /asChild \? undefined : children/);
});

test("ordinary Button keeps Base UI native button behavior", async () => {
  const source = await readFile(buttonPath, "utf8");

  assert.match(source, /nativeButton=\{asChild \? false : nativeButton\}/);
  assert.match(source, /asChild \? undefined : children/);
});
