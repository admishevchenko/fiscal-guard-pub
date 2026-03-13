import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client for use in Client Components.
 * Uses the public anon key — RLS is the security boundary.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
