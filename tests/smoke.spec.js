const { test, expect } = require("@playwright/test");

function recordUncaughtErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`exception: ${error.message}`));
  return errors;
}

async function expectHealthyPage(page, path) {
  const errors = recordUncaughtErrors(page);
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });

  expect(response, `No response was received for ${path}`).not.toBeNull();
  expect(response.status(), `${path} returned ${response.status()}`).not.toBe(404);
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  expect(errors, `Uncaught browser errors on ${path}`).toEqual([]);
}

test.describe("public route smoke tests", () => {
  for (const path of ["/", "/doctors", "/credits"]) {
    test(`${path} loads without browser errors`, async ({ page }) => {
      await expectHealthyPage(page, path);
    });
  }

  test("a doctor profile discovered from the listing loads without browser errors", async ({ page }) => {
    const errors = recordUncaughtErrors(page);
    const listingResponse = await page.goto("/doctors", { waitUntil: "domcontentloaded" });

    expect(listingResponse).not.toBeNull();
    expect(listingResponse.status()).not.toBe(404);

    const profileLink = page.locator('a[href^="/doctors/"]').filter({ hasText: "View Profile & Book" }).first();
    await expect(profileLink).toBeVisible();
    const doctorPath = await profileLink.getAttribute("href");
    expect(doctorPath).toMatch(/^\/doctors\/[^/]+\/[^/]+$/);

    const response = await page.goto(doctorPath, { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    expect(response.status(), `${doctorPath} returned ${response.status()}`).not.toBe(404);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText("This page could not be found", { exact: false })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    expect(errors, `Uncaught browser errors on ${doctorPath}`).toEqual([]);
  });
});
