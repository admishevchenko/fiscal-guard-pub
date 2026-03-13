import { test, expect } from "@playwright/test";

/**
 * E2E tests for tax calculation display scenarios.
 *
 * These verify that the correct treatment badges and calculation displays
 * appear on the dashboard for different income event configurations.
 *
 * All tests require an authenticated user with specific seeded data.
 * Skip unless E2E_TEST_USER_EMAIL is configured.
 */
test.describe("Tax calculation display", () => {
  test.skip(
    !process.env["E2E_TEST_USER_EMAIL"],
    "Skipped: requires authenticated test user with seeded income data"
  );

  test("NHR + PT Cat A eligible profession → 20% Flat rate badge shown", async ({
    page,
  }) => {
    // Test user seeded with Cat A PT income, eligible profession code 2131
    await page.goto("/dashboard");

    await expect(page.getByText(/20% flat rate/i)).toBeVisible({ timeout: 10_000 });
  });

  test("NHR + FOREIGN DTA country income → 'DTA Exempt (0%)' badge shown", async ({
    page,
  }) => {
    // Test user seeded with a FOREIGN DTA-country event (e.g. UK / GB)
    await page.goto("/dashboard");

    await expect(page.getByText(/DTA Exempt/i)).toBeVisible({ timeout: 10_000 });
  });

  test("Ineligible profession code + PT Cat A income → 'Progressive' badge shown", async ({
    page,
  }) => {
    // Test user seeded with ineligible profession code (e.g. 9999 — not on Portaria list)
    await page.goto("/dashboard");

    await expect(page.getByText(/progressive/i)).toBeVisible({ timeout: 10_000 });
  });

  test("Cat B Year-1 €140,000 → Art. 31 CIRS reduction note visible on event row", async ({
    page,
  }) => {
    // Test user seeded with Cat B Year-1 €140k event
    // Taxable = €140k × 0.375 = €52,500
    await page.goto("/dashboard");

    await expect(page.getByText(/Art. 31 CIRS.*taxable/i)).toBeVisible({ timeout: 10_000 });
  });

  test("Multiple events: Total Gross Income = sum of raw gross amounts (not taxable bases)", async ({
    page,
  }) => {
    // Test user seeded with two events:
    //   Event 1: Cat B Year-1 €140,000 (taxable: €52,500)
    //   Event 2: Cat A PT €50,000 (taxable: €50,000)
    // Correct total gross: €190,000 — NOT €102,500 (sum of taxable bases)
    await page.goto("/dashboard");

    await expect(page.getByText(/190\.000/)).toBeVisible({ timeout: 10_000 });
  });
});
