import type { NextConfig } from "next";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseRegion = process.env.NEXT_PUBLIC_SUPABASE_REGION ?? "";

// Region guard: fail fast at build/start if the declared Supabase region is not
// eu-central-1. Supabase standard URLs use <ref>.supabase.co — the region is not
// embedded in the URL. NEXT_PUBLIC_SUPABASE_REGION is the authoritative declaration.
if (supabaseUrl && supabaseRegion !== "eu-central-1") {
  throw new Error(
    `[fiscal-guard] NEXT_PUBLIC_SUPABASE_REGION must be "eu-central-1" (Frankfurt). ` +
      `Got: "${supabaseRegion || "(unset)"}". All infrastructure must remain within the EU. ` +
      `Set NEXT_PUBLIC_SUPABASE_REGION=eu-central-1 in your .env.local. ` +
      `See .github/copilot-instructions.md — Infrastructure Rules.`
  );
}

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Prevent server components from leaking secrets to the client bundle
  serverExternalPackages: ["decimal.js"],
  // Automatic memoisation — no manual useMemo/useCallback needed for charts
  // Moved to stable in Next.js 16 (out of experimental)
  reactCompiler: true,
  // Fix Turbopack workspace root detection in pnpm monorepo
  // Next.js 16 Turbopack can incorrectly infer the workspace root as apps/web/app
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
