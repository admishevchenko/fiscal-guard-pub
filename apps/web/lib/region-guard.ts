/**
 * proxy.ts — Outbound request interception for Fiscal Guard.
 *
 * Two responsibilities:
 * 1. Runtime eu-central-1 guard: any Supabase request to a non-Frankfurt
 *    endpoint throws immediately, preventing silent data-residency violations.
 * 2. Request hook point for future telemetry / retry logic.
 *
 * Infrastructure rule: "All Supabase/cloud infrastructure must reside in
 * eu-central-1 (Frankfurt)." — .github/copilot-instructions.md
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_REGION = process.env.NEXT_PUBLIC_SUPABASE_REGION ?? "";

/**
 * Asserts that the configured Supabase region is eu-central-1.
 * Called once at startup — throws immediately if the region env var is
 * missing or points outside Frankfurt (GDPR data-residency requirement).
 *
 * Note: Supabase standard URLs use the format <ref>.supabase.co — the region
 * is not embedded in the URL string. We use NEXT_PUBLIC_SUPABASE_REGION as
 * the authoritative region declaration, validated against the URL prefix.
 *
 * Infrastructure rule: "All Supabase/cloud infrastructure must reside in
 * eu-central-1 (Frankfurt)." — .github/copilot-instructions.md
 */
function assertEuCentral1(url: string): void {
  // Only inspect requests that target our Supabase project URL.
  if (!SUPABASE_URL || !url.startsWith(SUPABASE_URL)) return;

  if (SUPABASE_REGION !== "eu-central-1") {
    throw new Error(
      `[fiscal-guard/proxy] Region violation: NEXT_PUBLIC_SUPABASE_REGION is ` +
        `"${SUPABASE_REGION || "(unset)"}". ` +
        `GDPR compliance requires all data to remain within eu-central-1 (Frankfurt). ` +
        `Set NEXT_PUBLIC_SUPABASE_REGION=eu-central-1 in your .env.local.`
    );
  }
}

/**
 * Wraps the global fetch to intercept all outbound HTTP requests.
 * Install once at application startup (e.g., in layout.tsx or instrumentation.ts).
 */
export function installRequestProxy(): void {
  if (typeof globalThis.fetch !== "function") return;

  // Guard against double-installation
  if ((globalThis.fetch as typeof fetch & { __fiscalGuardProxy?: boolean })
    .__fiscalGuardProxy) {
    return;
  }

  const originalFetch = globalThis.fetch;

  const proxiedFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;

    assertEuCentral1(url);

    return originalFetch(input, init);
  };

  (proxiedFetch as typeof fetch & { __fiscalGuardProxy: boolean })
    .__fiscalGuardProxy = true;

  globalThis.fetch = proxiedFetch;
}
