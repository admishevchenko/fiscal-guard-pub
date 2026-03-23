"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingSchema, type OnboardingFormData } from "@/lib/validations/taxProfile";
import { IncomeEventSchema, type IncomeEventFormData } from "@/lib/validations/incomeEvent";
import { z } from "zod";
import Decimal from "decimal.js";

// ---------------------------------------------------------------------------
// Internal DB row types
// ---------------------------------------------------------------------------

interface TaxProfileRow {
  id: string;
  user_id: string;
  regime: "NHR" | "IFICI";
  regime_entry_date: string;
  regime_exit_date: string | null;
  profession_code: string;
  is_innovation_activity: boolean;
  nhr_pension_exemption_elected: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Art. 31 CIRS: maps activity year to the regime simplificado coefficient.
 * Year 1 (Art. 31(17)): coefficient × 0.50 = 0.375 taxable base
 * Year 2 (Art. 31(18)): coefficient × 0.75 = 0.5625 taxable base
 * Year 3+: full coefficient = 0.75
 * Returns null if no year selected (not Cat B, or no selection made).
 */
function catBCoefficientFromYear(activityYear: number | undefined): number | null {
  if (activityYear === 1) return 0.37500000;
  if (activityYear === 2) return 0.56250000;
  if (activityYear === 3) return 0.75000000;
  return null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Fetches the currently active tax_profile row for the authenticated user.
 * An "active" profile has regime_exit_date IS NULL.
 * Returns null if the user has no active profile (i.e. needs onboarding).
 */
export async function getTaxProfile(): Promise<TaxProfileRow | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("tax_profiles")
    .select(
      "id, user_id, regime, regime_entry_date, regime_exit_date, profession_code, is_innovation_activity, nhr_pension_exemption_elected"
    )
    .eq("user_id", user.id)
    .is("regime_exit_date", null)
    .maybeSingle();

  return (data as TaxProfileRow | null) ?? null;
}

/**
 * Upserts the user's tax profile and display name from onboarding form data.
 * Server-validates with Zod before any DB operation.
 *
 * Strategy: update existing active profile if one exists; otherwise insert.
 * This is required because the partial unique index on
 * (user_id WHERE regime_exit_date IS NULL) cannot be used with PostgREST
 * onConflict without specifying the WHERE predicate.
 */
export async function saveTaxProfile(
  rawData: OnboardingFormData
): Promise<{ error?: string }> {
  // Server-side validation (server actions are public endpoints)
  const parsed = OnboardingSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const formData = parsed.data;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // 1. Upsert display_name into profiles (unique on user_id with full index)
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      display_name: formData.displayName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (profileError) {
    return { error: `Failed to save profile: ${profileError.message}` };
  }

  // 2. Check if an active tax_profile already exists
  const { data: existing } = await supabase
    .from("tax_profiles")
    .select("id")
    .eq("user_id", user.id)
    .is("regime_exit_date", null)
    .maybeSingle();

  if (existing) {
    // Update the existing active profile in-place
    const { error: updateError } = await supabase
      .from("tax_profiles")
      .update({
        regime: formData.regime,
        regime_entry_date: formData.regimeEntryDate,
        profession_code: formData.professionCode,
        nhr_pension_exemption_elected: formData.nhrPensionExemptionElected ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (existing as { id: string }).id);

    if (updateError) {
      return { error: `Failed to update tax profile: ${updateError.message}` };
    }
  } else {
    // Insert a new active profile
    const { error: insertError } = await supabase
      .from("tax_profiles")
      .insert({
        user_id: user.id,
        regime: formData.regime,
        regime_entry_date: formData.regimeEntryDate,
        profession_code: formData.professionCode,
        nhr_pension_exemption_elected: formData.nhrPensionExemptionElected ?? false,
        is_innovation_activity: false,
      });

    if (insertError) {
      return { error: `Failed to create tax profile: ${insertError.message}` };
    }
  }

  return {};
}

/**
 * Deletes a single income event by ID for the authenticated user.
 * RLS ensures only the owner can delete their own events.
 */
export async function deleteIncomeEvent(
  eventId: string
): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("income_events")
    .delete()
    .eq("id", eventId)
    .eq("user_id", user.id); // belt-and-suspenders on top of RLS

  if (error) {
    return { error: `Failed to delete event: ${error.message}` };
  }

  return {};
}

/**
 * Bulk-inserts income events for the authenticated user.
 * Server-validates each event with Zod before inserting.
 * Converts euro amounts to integer cents and maps source enum to DB values.
 */
export async function saveIncomeEvents(
  rawEvents: IncomeEventFormData[]
): Promise<{ error?: string }> {
  if (rawEvents.length === 0) return {};

  // Server-side validation
  const parsed = z.array(IncomeEventSchema).safeParse(rawEvents);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const events = parsed.data;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Server-side guard: require an active tax profile before allowing income events.
  // Prevents orphan events that the tax calculation flow cannot use.
  const { data: profile } = await supabase
    .from("tax_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return { error: "Please set up your tax profile before adding income events." };
  }

  const rows = events.map((evt) => {
    // Art. 31 CIRS: only include cat_b_coefficient for domestic Cat B income.
    // Foreign Cat B is DTA-exempt under NHR/IFICI — coefficient is irrelevant.
    const coeff =
      evt.category === "B" && evt.source === "DOMESTIC"
        ? catBCoefficientFromYear(evt.catBActivityYear)
        : null;

    return {
      user_id: user.id,
      tax_year: evt.taxYear,
      // DB income_source enum is ('PT', 'FOREIGN'); form uses 'DOMESTIC' for PT
      source: evt.source === "DOMESTIC" ? "PT" : "FOREIGN",
      // source_country is NOT NULL in the schema; use 'PT' for domestic
      source_country:
        evt.source === "FOREIGN" ? (evt.sourceCountry ?? "XX") : "PT",
      category: evt.category,
      gross_amount_cents: new Decimal(evt.amountEuros).times(100).round().toNumber(),
      original_currency: "EUR",
      fx_rate_to_eur: "1.00000000",
      description: evt.description ?? null,
      // received_at is NOT NULL; use Dec 31 of the tax year as the receipt date
      received_at: `${evt.taxYear}-12-31T00:00:00Z`,
      // Only spread when non-null so the key is absent for non-Cat-B events
      ...(coeff !== null ? { cat_b_coefficient: coeff } : {}),
    };
  });

  const { error } = await supabase.from("income_events").insert(rows);

  if (error) {
    return { error: `Failed to save income events: ${error.message}` };
  }

  // Bust the Next.js Router Cache for all /dashboard routes so any pre-fetched
  // snapshot (e.g. empty state for /dashboard?year=2025) is discarded before
  // the client navigates to the relevant year.
  revalidatePath("/dashboard", "layout");

  return {};
}

// ---------------------------------------------------------------------------
// Read: income events for a given tax year
// ---------------------------------------------------------------------------

export interface RawIncomeEventRow {
  id: string;
  tax_year: number;
  category: "A" | "B" | "E" | "F" | "G" | "H";
  gross_amount_cents: number;
  cat_b_coefficient: number | null;
  source: "PT" | "FOREIGN";
  source_country: string | null;
  description: string | null;
}

/**
 * Fetches raw income_events rows for the authenticated user for a given
 * tax year. Used by the dashboard to display events independently of whether
 * the tax calculation succeeds (e.g. when RegimeNotActiveError is thrown).
 */
export async function getIncomeEventsForYear(
  taxYear: number
): Promise<RawIncomeEventRow[]> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("income_events")
    .select(
      "id, tax_year, category, gross_amount_cents, cat_b_coefficient, source, source_country, description"
    )
    .eq("user_id", user.id)
    .eq("tax_year", taxYear)
    .order("created_at", { ascending: true });

  return (data as RawIncomeEventRow[] | null) ?? [];
}
