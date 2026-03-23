import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { AddIncomeNavLink } from "@/components/dashboard/AddIncomeNavLink";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();

  // ── Auth guard ────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ── Onboarding gate ───────────────────────────────────────────────────────
  // Check whether the user has an active tax profile.  If not, redirect to
  // /onboarding — but only when NOT already on that page (middleware sets the
  // x-pathname header so we can read it here without a request object).
  const headersList = await headers();
  // x-pathname is always set by proxy.ts from request.nextUrl.pathname —
  // it cannot be spoofed by clients because the proxy overwrites any
  // incoming value before forwarding. Default to "" (triggers redirect).
  const pathname = headersList.get("x-pathname") ?? "";

  const { data: taxProfile } = await supabase
    .from("tax_profiles")
    .select("id")
    .eq("user_id", user.id)
    .is("regime_exit_date", null)
    .maybeSingle();

  if (!taxProfile && !pathname.includes("onboarding")) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="font-semibold text-gray-900 hover:text-gray-700">
              Fiscal Guard
            </Link>
            {taxProfile && (
              <AddIncomeNavLink />
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            {taxProfile && (
              <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-900">
                Settings
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

