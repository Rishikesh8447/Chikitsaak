const { test, expect } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");

const patientState = process.env.PLAYWRIGHT_PATIENT_STORAGE_STATE;
const doctorState = process.env.PLAYWRIGHT_DOCTOR_STORAGE_STATE;
const adminState = process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE;
const configuredDoctorProfile = process.env.PLAYWRIGHT_DOCTOR_PROFILE_PATH;
const videoAppointmentId = process.env.PLAYWRIGHT_VIDEO_APPOINTMENT_ID;

async function assertAccessibleRoute(page, path) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main").first()).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, `${path} accessibility violations:\n${results.violations.map((violation) => `${violation.id}: ${violation.help}\n${violation.nodes.map((node) => node.html).join("\n")}`).join("\n\n")}`).toEqual([]);

  await page.keyboard.press("Tab");
  const keyboardState = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return { focused: false };
    const style = getComputedStyle(active);
    const rect = active.getBoundingClientRect();
    return {
      focused: active.matches(":focus-visible"),
      visible: style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0,
      name: active.getAttribute("aria-label") || active.getAttribute("title") || active.textContent?.trim() || active.getAttribute("value") || "",
    };
  });
  expect(keyboardState.focused, `${path} does not expose keyboard focus`).toBe(true);
  expect(keyboardState.visible, `${path} focuses a hidden element`).toBe(true);
  expect(keyboardState.name, `${path} focuses an unnamed interactive element`).not.toBe("");

  const unnamedInteractiveElements = await page.evaluate(() => {
    const selectors = "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=switch]";
    return [...document.querySelectorAll(selectors)]
      .filter((element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden"))
      .filter((element) => {
        const labelledBy = element.getAttribute("aria-labelledby");
        const labelledByText = labelledBy?.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
        const name = element.getAttribute("aria-label") || labelledByText || element.getAttribute("title") || element.textContent?.trim() || element.getAttribute("value") || element.querySelector("img")?.getAttribute("alt") || "";
        return !name;
      })
      .map((element) => element.outerHTML.slice(0, 200));
  });
  expect(unnamedInteractiveElements, `${path} has interactive elements without accessible names`).toEqual([]);
}

test("homepage accessibility", async ({ page }) => {
  await assertAccessibleRoute(page, "/");
});

test.describe("patient route accessibility", () => {
  test.skip(!patientState, "Set PLAYWRIGHT_PATIENT_STORAGE_STATE to scan authenticated patient routes.");
  test.use({ storageState: patientState });

  test("doctor search accessibility", async ({ page }) => assertAccessibleRoute(page, "/doctors"));

  test("doctor profile accessibility", async ({ page }) => {
    await page.goto("/doctors", { waitUntil: "domcontentloaded" });
    const profilePath = configuredDoctorProfile || await page.locator('a[href^="/doctors/"]').filter({ hasText: "View Profile & Book" }).first().getAttribute("href");
    expect(profilePath, "A real doctor profile link is required").toMatch(/^\/doctors\/[^/]+\/[^/]+$/);
    await assertAccessibleRoute(page, profilePath);
  });

  test("appointments accessibility", async ({ page }) => assertAccessibleRoute(page, "/appointments"));
  test("credits accessibility", async ({ page }) => assertAccessibleRoute(page, "/credits"));
  test("medical records accessibility", async ({ page }) => assertAccessibleRoute(page, "/medical-records"));
});

test.describe("doctor route accessibility", () => {
  test.skip(!doctorState, "Set PLAYWRIGHT_DOCTOR_STORAGE_STATE to scan doctor routes.");
  test.use({ storageState: doctorState });

  test("doctor dashboard accessibility", async ({ page }) => assertAccessibleRoute(page, "/doctor"));
  test("video consultation accessibility", async ({ page }) => {
    test.skip(!videoAppointmentId, "Set PLAYWRIGHT_VIDEO_APPOINTMENT_ID to scan a stable video consultation.");
    await assertAccessibleRoute(page, `/video-call?appointmentId=${encodeURIComponent(videoAppointmentId)}`);
  });
});

test.describe("admin route accessibility", () => {
  test.skip(!adminState, "Set PLAYWRIGHT_ADMIN_STORAGE_STATE to scan admin routes.");
  test.use({ storageState: adminState });

  test("admin dashboard accessibility", async ({ page }) => assertAccessibleRoute(page, "/admin"));
});
