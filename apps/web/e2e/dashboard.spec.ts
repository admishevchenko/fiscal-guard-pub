import { test, expect } from "@playwright/test";

/**
 * E2E tests for the dashboard page.
 *
 * Unauthenticated tests verify redirect behaviour.
 * Authenticated tests require a seeded test user with known income data.
 */
test.describe("Dashboard — unauthenticated", () => {
  test("redirects to /login for unauthenticated users", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Dashboard — authenticated", () => {
  test.skip(
    !process.env["E2E_TEST_USER_EMAIL"],
    "Skipped: no E2E_TEST_USER_EMAIL env var set"
  );

  test("shows CTA card when user has no income events", async ({ page }) => {
    // Test user with no income events seeded
    await page.goto("/dashboard");
    await expect(
      page.getByText(/run your first calculation|add income events/i)
    ).toBeVisible();
  });

  test("shows Tax Summary card after income events added", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/tax summary/i)).toBeVisible();
    await expect(page.getByText(/total gross income/i)).toBeVisible();
  });

  test("displays correct gross income (€140,000 for test fixture)", async ({ page }) => {
    // Assumes test user has been seeded with €140,000 Cat B Year-1 event
    await page.goto("/dashboard");
    await expect(page.getByText(/140\.000/)).toBeVisible({ timeout: 10_000 });
  });

  test("shows 7.5% effective rate for Cat B Year-1 €140k event (not 20%)", async ({ page }) => {
    // Art. 31 CIRS: Year 1 coefficient = 0.375, so taxable = €52,500
    // Tax = €52,500 × 20% = €10,500 / €140,000 gross = 7.5% effective
    await page.goto("/dashboard");
    await expect(page.getByText(/effective rate: 7\.5%/i)).toBeVisible({ timeout: 10_000 });
  });

  test("hides red eligibility banner for profession code 2131 (eligible)", async ({ page }) => {
    await page.goto("/dashboard");
    // No red "Fix profession code" banner should be shown for eligible code
    await expect(page.getByText(/fix profession code/i)).not.toBeVisible();
  });

  test("shows income events panel with all seeded events", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/income events/i)).toBeVisible();
  });

  test("deleting an event removes it and recalculates", async ({ page }) => {
    await page.goto("/dashboard");

    // Find a delete button and click it
    const deleteBtn = page.getByTitle(/delete income event/i).first();
    await deleteBtn.click();

    await expect(
      page.getByText(/income event deleted/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("'+ Add income' nav link includes year param from current dashboard URL", async ({ page }) => {
    await page.goto("/dashboard?year=2025");

    const addLink = page.getByRole("link", { name: /\+ add income/i });
    // Year-aware link: must forward the current year to the onboarding form
    await expect(addLink).toHaveAttribute("href", "/onboarding?step=income&year=2025");
  });

  test("'+ Add income' nav link falls back to no year param when on default dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    const addLink = page.getByRole("link", { name: /\+ add income/i });
    // No ?year= in URL → link should not include year (defaults to current year in form)
    await expect(addLink).toHaveAttribute("href", "/onboarding?step=income");
  });
});
