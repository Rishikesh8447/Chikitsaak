const { test, expect } = require("@playwright/test");

const patientState = process.env.PLAYWRIGHT_PATIENT_STORAGE_STATE;
const doctorState = process.env.PLAYWRIGHT_DOCTOR_STORAGE_STATE;
const adminState = process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE;
const configuredDoctorProfile = process.env.PLAYWRIGHT_DOCTOR_PROFILE_PATH;
const videoAppointmentId = process.env.PLAYWRIGHT_VIDEO_APPOINTMENT_ID;

async function prepareVisualPage(page, path) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body > main")).toBeVisible();
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      time, [data-timestamp], [data-testid="timestamp"] { visibility: hidden !important; }
    `,
  });
  await page.evaluate(() => {
    const timestamp = /\b\d{1,2}[\/:.-]\d{1,2}(?:[\/:.-]\d{2,4})?(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)?\b/gi;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest("script, style")) continue;
      node.textContent = node.textContent.replace(timestamp, "<timestamp>");
    }
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoLayoutDefects(page) {
  const defects = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const outside = (selector) => [...document.querySelectorAll(selector)]
      .filter(visible)
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > window.innerWidth + 1;
      })
      .map((element) => element.outerHTML.slice(0, 120));
    return {
      horizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
      navigation: [...document.querySelectorAll("nav")].filter(visible).some((nav) => nav.scrollWidth > nav.clientWidth + 1),
      controlsOutsideViewport: outside("button, input, select, textarea, [role=button]"),
      clippedButtons: [...document.querySelectorAll("button, [role=button]")]
        .filter(visible)
        .filter((button) => button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1)
        .map((button) => button.textContent.trim()),
      dialogsOutsideViewport: outside('[role="dialog"]'),
    };
  });
  expect(defects.horizontalScroll, "horizontal scrolling detected").toBe(false);
  expect(defects.navigation, "navigation overflow detected").toBe(false);
  expect(defects.controlsOutsideViewport, "controls extend beyond the viewport").toEqual([]);
  expect(defects.clippedButtons, "clipped button text detected").toEqual([]);
  expect(defects.dialogsOutsideViewport, "a dialog extends outside the viewport").toEqual([]);
}

async function expectVisualSnapshot(page, path, name) {
  await prepareVisualPage(page, path);
  await expectNoLayoutDefects(page);
  await expect(page.locator("body > main")).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
  });
}

test("homepage visual regression", async ({ page }) => {
  await expectVisualSnapshot(page, "/", "homepage");
});

test.describe("patient visual regressions", () => {
  test.skip(!patientState, "Set PLAYWRIGHT_PATIENT_STORAGE_STATE to run authenticated patient snapshots.");
  test.use({ storageState: patientState });

  test("doctor search visual regression", async ({ page }) => {
    await expectVisualSnapshot(page, "/doctors", "doctor-search");
  });

  test("doctor profile visual regression", async ({ page }) => {
    await page.goto("/doctors", { waitUntil: "domcontentloaded" });
    const profilePath = configuredDoctorProfile || await page.locator('a[href^="/doctors/"]').filter({ hasText: "View Profile & Book" }).first().getAttribute("href");
    expect(profilePath, "A real doctor profile link is required").toMatch(/^\/doctors\/[^/]+\/[^/]+$/);
    await expectVisualSnapshot(page, profilePath, "doctor-profile");
  });

  test("appointments visual regression", async ({ page }) => {
    await expectVisualSnapshot(page, "/appointments", "appointments");
  });

  test("credits visual regression", async ({ page }) => {
    await expectVisualSnapshot(page, "/credits", "credits");
  });

  test("medical records visual regression", async ({ page }) => {
    await expectVisualSnapshot(page, "/medical-records", "medical-records");
  });
});

test.describe("doctor visual regressions", () => {
  test.skip(!doctorState, "Set PLAYWRIGHT_DOCTOR_STORAGE_STATE to run doctor snapshots.");
  test.use({ storageState: doctorState });

  test("doctor dashboard visual regression", async ({ page }) => {
    await expectVisualSnapshot(page, "/doctor", "doctor-dashboard");
  });

  test("video consultation visual regression", async ({ page }) => {
    test.skip(!videoAppointmentId, "Set PLAYWRIGHT_VIDEO_APPOINTMENT_ID to a stable seeded appointment.");
    await expectVisualSnapshot(page, `/video-call?appointmentId=${encodeURIComponent(videoAppointmentId)}`, "video-consultation");
  });
});

test.describe("admin visual regressions", () => {
  test.skip(!adminState, "Set PLAYWRIGHT_ADMIN_STORAGE_STATE to run admin snapshots.");
  test.use({ storageState: adminState });

  test("admin dashboard visual regression", async ({ page }) => {
    await expectVisualSnapshot(page, "/admin", "admin-dashboard");
  });
});
