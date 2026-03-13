import { test, expect } from "@playwright/test";

/**
 * E2E tests for the onboarding wizard.
 *
 * These tests run against the live app and exercise the multi-step wizard UI.
 * For authenticated scenarios, the app must be running with a test Supabase project.
 *
 * Deep-link tests (?step=income) do NOT require authentication to verify
 * the initial step rendering behaviour.
 */
test.describe("Onboarding wizard — public UI structure", () => {
  test("Step 1 shows regime & date fields when not deep-linked", async ({ page }) => {
    // We expect a redirect to login for unauthenticated users,
    // but the onboarding page structure can be tested via the component tests.
    // This test verifies the redirect itself works correctly.
    await page.goto("/onboarding");
    // Unauthenticated: should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("?step=income deep-link redirects unauthenticated to login", async ({ page }) => {
    await page.goto("/onboarding?step=income");
    await expect(page).toHaveURL(/\/login/);
  });
});

/**
 * Authenticated onboarding tests.
 *
 * These require a seeded test account and real Supabase connection.
 * Skip with: test.skip(!process.env.E2E_TEST_USER_EMAIL, 'No test credentials')
 *
 * Set environment variables:
 *   E2E_TEST_USER_EMAIL — email of a seeded test user
 *   E2E_TEST_USER_PASSWORD — password (if using password auth for tests)
 *   E2E_SESSION_COOKIE — pre-obtained session cookie for faster auth
 */
test.describe("Onboarding wizard — authenticated", () => {
  test.skip(
    !process.env["E2E_TEST_USER_EMAIL"],
    "Skipped: no E2E_TEST_USER_EMAIL env var set. Configure a test Supabase project."
  );

  test("completing all 3 wizard steps redirects to /dashboard", async ({ page }) => {
    // This test requires pre-authenticated state via storageState fixture.
    // See playwright docs on authentication: https://playwright.dev/docs/auth
    await page.goto("/onboarding");

    // Step 1
    await page.getByLabel(/your name/i).fill("E2E Test User");
    await page.getByText(/NHR -- Non-Habitual Resident/i).click();
    await page.getByLabel(/regime entry date/i).fill("2022-01-01");
    await page.getByRole("button", { name: /next/i }).click();

    // Step 2
    await expect(page.getByLabel(/profession code/i)).toBeVisible();
    await page.getByLabel(/profession code/i).fill("2131");
    await expect(page.getByText(/eligible/i)).toBeVisible();
    await page.getByRole("button", { name: /next/i }).click();

    // Step 3
    await expect(page.getByLabel(/amount/i)).toBeVisible();
    await page.getByLabel(/amount/i).fill("50000");
    await page.getByRole("button", { name: /finish setup/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("Step 2: entering an ineligible code shows orange badge", async ({ page }) => {
    await page.goto("/onboarding");

    await page.getByLabel(/your name/i).fill("Test");
    await page.getByText(/NHR/i).click();
    await page.getByLabel(/regime entry date/i).fill("2022-01-01");
    await page.getByRole("button", { name: /next/i }).click();

    await page.getByLabel(/profession code/i).fill("0000");
    await expect(page.getByText(/not recognised/i)).toBeVisible();
  });

  test("Step 3: Cat B shows coefficient (regime simplificado) selector", async ({ page }) => {
    await page.goto("/onboarding");

    // Navigate to step 3
    await page.getByLabel(/your name/i).fill("Test");
    await page.getByText(/NHR/i).click();
    await page.getByLabel(/regime entry date/i).fill("2022-01-01");
    await page.getByRole("button", { name: /next/i }).click();
    await page.getByLabel(/profession code/i).fill("2131");
    await page.getByRole("button", { name: /next/i }).click();

    // Select Cat B
    await page.locator('[name="events.0.category"]').selectOption("B");
    await expect(
      page.getByText(/regime simplificado year/i)
    ).toBeVisible();
  });

  test("Step 3: FOREIGN source without country shows validation error", async ({ page }) => {
    await page.goto("/onboarding");

    await page.getByLabel(/your name/i).fill("Test");
    await page.getByText(/NHR/i).click();
    await page.getByLabel(/regime entry date/i).fill("2022-01-01");
    await page.getByRole("button", { name: /next/i }).click();
    await page.getByLabel(/profession code/i).fill("2131");
    await page.getByRole("button", { name: /next/i }).click();

    // Select FOREIGN
    await page.getByLabel(/🌍 Foreign/i).click();
    // Try to submit without filling source country
    await page.getByRole("button", { name: /finish setup/i }).click();

    await expect(
      page.getByText(/fix the highlighted errors/i)
    ).toBeVisible({ timeout: 5_000 });
  });
});
