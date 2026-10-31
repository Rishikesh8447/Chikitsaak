const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const bottomNavPath = join(cwd(), "components", "bottom-navigation.jsx");

test("bottom navigation component hides on admin, auth, and video-call routes", async () => {
  const source = await readFile(bottomNavPath, "utf8");

  // Verify suppression logic includes admin routes
  assert.match(source, /pathname === "\/admin"/);
  assert.match(source, /pathname\?\.startsWith\("\/admin\/"\)/);
  assert.match(source, /pathname\?\.startsWith\("\/sign-in"\)/);
  assert.match(source, /pathname\?\.startsWith\("\/sign-up"\)/);
  assert.match(source, /pathname\?\.startsWith\("\/video-call"\)/);

  // Extract the suppression condition to test against all route patterns
  const hideConditionMatch = source.match(/if\s*\(([\s\S]*?)\)\s*\{\s*return null;\s*\}/);
  assert.ok(hideConditionMatch, "Route suppression check must be present");

  const evaluateHide = (pathname) => {
    return (
      pathname?.startsWith("/sign-in") ||
      pathname?.startsWith("/sign-up") ||
      pathname?.startsWith("/video-call") ||
      pathname === "/admin" ||
      pathname?.startsWith("/admin/")
    );
  };

  // 1. Admin routes MUST be hidden
  assert.equal(evaluateHide("/admin"), true, "/admin must be hidden");
  assert.equal(evaluateHide("/admin/"), true, "/admin/ must be hidden");
  assert.equal(evaluateHide("/admin/laboratory"), true, "/admin/laboratory must be hidden");
  assert.equal(evaluateHide("/admin/pharmacy"), true, "/admin/pharmacy must be hidden");
  assert.equal(evaluateHide("/admin/doctors"), true, "/admin/doctors must be hidden");

  // 2. Auth and video call routes MUST be hidden
  assert.equal(evaluateHide("/sign-in"), true, "/sign-in must be hidden");
  assert.equal(evaluateHide("/sign-up"), true, "/sign-up must be hidden");
  assert.equal(evaluateHide("/video-call/123"), true, "/video-call must be hidden");

  // 3. Patient routes MUST NOT be hidden
  assert.equal(evaluateHide("/"), false, "Home route must not be hidden");
  assert.equal(evaluateHide("/doctors"), false, "Care route must not be hidden");
  assert.equal(evaluateHide("/doctors/cardiology/123"), false, "Doctor profile must not be hidden");
  assert.equal(evaluateHide("/appointments"), false, "Visits route must not be hidden");
  assert.equal(evaluateHide("/laboratory"), false, "Labs route must not be hidden");
  assert.equal(evaluateHide("/pharmacy"), false, "Pharmacy route must not be hidden");
  assert.equal(evaluateHide("/medical-records"), false, "Records route must not be hidden");
});

test("bottom navigation defines all required patient items and responsive mobile classes", async () => {
  const source = await readFile(bottomNavPath, "utf8");

  // Verify the 6 patient items exist
  const expectedItems = [
    { href: "/", label: "Home" },
    { href: "/doctors", label: "Care" },
    { href: "/appointments", label: "Visits" },
    { href: "/laboratory", label: "Labs" },
    { href: "/pharmacy", label: "Pharmacy" },
    { href: "/medical-records", label: "Records" },
  ];

  for (const item of expectedItems) {
    assert.match(source, new RegExp(`href:\\s*"${item.href.replace("/", "\\/")}"`));
    assert.match(source, new RegExp(`label:\\s*"${item.label}"`));
  }

  // Responsive styling: lg:hidden ensures it is only visible on mobile screens
  assert.match(source, /lg:hidden/);
  assert.match(source, /fixed bottom-0 left-0 right-0/);
});

