const { test } = require("node:test");
const assert = require("node:assert/strict");
const { access, readFile } = require("node:fs/promises");
const { join } = require("node:path");

const root = join(__dirname, "..");

test("public PWA and metadata assets are included in Clerk proxy", async () => {
  const proxy = await readFile(join(root, "proxy.js"), "utf8");

  for (const route of [
    '"/manifest.webmanifest"',
    '"/icons/:path*"',
    '"/favicon.ico"',
    '"/apple-icon.png"',
  ]) {
    assert.ok(proxy.includes(route), `proxy matcher should include ${route}`);
  }

  assert.match(proxy, /clerkMiddleware\(async \(auth, req\)/);
  assert.match(proxy, /const \{ userId \} = await auth\(\)/);
  assert.match(proxy, /if \(!userId && isProtectedRoute\(req\)\)/);
});

test("manifest icon URLs exist and protected routes remain matched", async () => {
  const [manifest, proxy] = await Promise.all([
    readFile(join(root, "app", "manifest.js"), "utf8"),
    readFile(join(root, "proxy.js"), "utf8"),
  ]);

  for (const [url, file] of [
    ["/icons/icon-192.png", "public/icons/icon-192.png"],
    ["/icons/icon-512.png", "public/icons/icon-512.png"],
  ]) {
    assert.ok(manifest.includes(url), `manifest should reference ${url}`);
    await access(join(root, file));
  }

  for (const route of [
    '"/doctors(.*)"',
    '"/onboarding(.*)"',
    '"/doctor(.*)"',
    '"/admin(.*)"',
    '"/appointments(.*)"',
    '"/medical-records(.*)"',
    '"/laboratory(.*)"',
  ]) {
    assert.ok(proxy.includes(route), `protected route should remain matched: ${route}`);
  }
  assert.doesNotMatch(proxy, /\/credits/);
});
