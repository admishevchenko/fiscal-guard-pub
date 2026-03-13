import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Auth callback route — handles the magic link / OAuth redirect from Supabase.
 * Exchanges the `code` query parameter for a session cookie.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const raw = requestUrl.searchParams.get("next") ?? "/dashboard";
  // Reject absolute URLs and protocol-relative URLs (e.g. //evil.com) to
  // prevent open redirect attacks. Only relative paths starting with /[non-/]
  // are permitted. See: OWASP Open Redirect.
  const next = /^\/[^/]/.test(raw) ? raw : "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }
  }

  // Something went wrong — redirect to login with error hint
  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", requestUrl.origin)
  );
}
