import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for Fiscal Guard web app.
 * Runs against the local Next.js dev server on port 3000.
 *
 * Auth strategy: tests mock Supabase responses via environment variables
 * pointing to a test project, or rely on a seeded test database.
 * For CI, set PLAYWRIGHT_TEST_BASE_URL to override the base URL.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: process.env["CI"] ? "github" : "html",

  use: {
    baseURL: process.env["PLAYWRIGHT_TEST_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],

  // Start the Next.js dev server automatically before running tests.
  // Remove this if you prefer to start the server manually.
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
