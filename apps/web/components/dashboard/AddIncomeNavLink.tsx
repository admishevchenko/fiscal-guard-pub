"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { UrlObject } from "url";

/**
 * Year-aware "+ Add income" nav link.
 *
 * Reads the current ?year= param from the URL (via useSearchParams) and
 * forwards it to the onboarding page so Step3Income pre-selects the same
 * tax year, preventing the form from defaulting back to the current year
 * when the user is viewing a different year on the dashboard.
 */
export function AddIncomeNavLink() {
  const searchParams = useSearchParams();
  const year = searchParams.get("year");

  // Build a UrlObject so the typed-routes constraint is satisfied with a
  // dynamic search string that cannot be verified as a literal at compile time.
  const href: UrlObject = {
    pathname: "/onboarding",
    query: year ? { step: "income", year } : { step: "income" },
  };

  return (
    <Link href={href} className="text-sm text-primary hover:underline">
      + Add income
    </Link>
  );
}
