import { test, expect } from "@playwright/test";

/**
 * E2E tests for authentication flows.
 *
 * These tests verify redirect behaviour for unauthenticated users
 * and the magic link login page rendering.
 *
 * Note: Tests that require a fully authenticated session need a real Supabase
 * test project configured via NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * environment variables. The auth-state tests below use only the login UI.
 */
test.describe("Authentication", () => {
  test("visiting / redirects unauthenticated user to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("visiting /dashboard unauthenticated redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders email input and magic link button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send magic link|sign in/i })
    ).toBeVisible();
  });

  test("submitting login form shows a success/check-email message", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("textbox", { name: /email/i }).fill("test@example.com");
    await page.getByRole("button", { name: /send magic link|sign in/i }).click();

    // Should show a success message (even if Supabase call fails, check the UI feedback)
    await expect(
      page.getByText(/check your email|magic link sent/i)
    ).toBeVisible({ timeout: 10_000 });
  });
});
