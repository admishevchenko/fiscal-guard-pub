"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TaxEngine } from "@fiscal-guard/tax-engine";
import type {
  EngineIncomeEvent,
  EngineTaxProfile,
  CalculationResult,
  ClassifiedEvent,
} from "@fiscal-guard/tax-engine";

// ---------------------------------------------------------------------------
// Internal DB row shapes (reflect actual migration schema)
// ---------------------------------------------------------------------------

interface DbTaxProfile {
  id: string;
  user_id: string;
  regime: "NHR" | "IFICI";
  regime_entry_date: string;
  regime_exit_date: string | null;
  profession_code: string;
  is_innovation_activity: boolean;
}

interface DbIncomeEvent {
  id: string;
  tax_year: number;
  category: "A" | "B" | "E" | "F" | "G" | "H";
  /** DB income_source enum: ('PT', 'FOREIGN') */
  source: "PT" | "FOREIGN";
  source_country: string;
  gross_amount_cents: number;
  description: string | null;
  /** Art. 31 CIRS regime simplificado coefficient. Only populated for Cat B. */
  cat_b_coefficient: number | null;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Runs the full NHR/IFICI tax calculation for the given tax year.
 *
 * Flow:
 *  1. Fetch active tax_profile (regime_exit_date IS NULL)
 *  2. Fetch income_events for taxYear
 *  3. Run TaxEngine.calculate()
 *  4. Delete any previous calculation for this user/year, then insert result
 *  5. Insert per-event rows into tax_reasoning_log
 *  6. Return CalculationResult
 *
 * Returns null if the user has no active tax_profile or no income events.
 *
 * @throws {RegimeExpiredError}   if the regime expired before taxYear
 * @throws {RegimeNotActiveError} if the regime had not yet started for taxYear
 */
export async function calculateTaxAction(
  taxYear: number
): Promise<CalculationResult | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // ── 1. Fetch active tax profile ──────────────────────────────────────────
  const { data: taxProfileData } = await supabase
    .from("tax_profiles")
    .select(
      "id, user_id, regime, regime_entry_date, regime_exit_date, profession_code, is_innovation_activity"
    )
    .eq("user_id", user.id)
    .is("regime_exit_date", null)
    .maybeSingle();

  if (!taxProfileData) return null;

  const taxProfile = taxProfileData as DbTaxProfile;

  // ── 2. Fetch income events ───────────────────────────────────────────────
  const { data: eventsData } = await supabase
    .from("income_events")
    .select(
      "id, tax_year, category, gross_amount_cents, source, source_country, description, cat_b_coefficient"
    )
    .eq("user_id", user.id)
    .eq("tax_year", taxYear);

  if (!eventsData || eventsData.length === 0) return null;

  const dbEvents = eventsData as DbIncomeEvent[];

  // ── 3. Map DB rows → EngineIncomeEvent ──────────────────────────────────
  const engineProfile: EngineTaxProfile = {
    regime: taxProfile.regime,
    regimeEntryDate: taxProfile.regime_entry_date,
    regimeExitDate: taxProfile.regime_exit_date,
    professionCode: taxProfile.profession_code,
    isInnovationActivity: taxProfile.is_innovation_activity,
  };

  // Use Dec 31 of the tax year as the point-in-time reference for the
  // blacklist validator (conservative year-end check)
  const receivedAt = `${taxYear}-12-31T00:00:00Z`;

  const engineEvents: EngineIncomeEvent[] = dbEvents.map((evt) => ({
    id: evt.id,
    taxYear: evt.tax_year,
    category: evt.category,
    grossAmountCents: evt.gross_amount_cents,
    source: evt.source,
    sourceCountry: evt.source_country,
    receivedAt,
    professionCode: taxProfile.profession_code,
    // Art. 31 CIRS: pass the stored regime simplificado coefficient to the engine.
    // The engine uses this to reduce the taxable base for Cat B income.
    catBCoefficient: evt.cat_b_coefficient ?? undefined,
  }));

  // ── 4. Run calculation ───────────────────────────────────────────────────
  const engine = new TaxEngine(engineProfile);
  const result = engine.calculate(engineEvents, taxYear);

  // ── 5. Replace calculation row (delete + insert, no unique constraint) ───
  // The calculations table only has a non-unique index on (user_id, tax_year).
  // We delete the previous result for this year and insert a fresh one so the
  // dashboard always shows the latest calculation.
  await supabase
    .from("calculations")
    .delete()
    .eq("user_id", user.id)
    .eq("tax_year", taxYear);

  const { data: calcRow, error: calcError } = await supabase
    .from("calculations")
    .insert({
      user_id: user.id,
      tax_profile_id: taxProfile.id,
      tax_year: taxYear,
      pt_taxable_income_cents: result.flat20IncomeCents,
      foreign_exempt_income_cents: result.dtaExemptIncomeCents,
      blacklisted_jurisdiction_income_cents: result.blacklist35IncomeCents,
      flat_rate_tax_cents: result.flat20TaxCents,
      progressive_tax_cents: result.progressiveTaxCents,
      total_tax_cents: result.totalTaxCents,
      effective_rate: result.effectiveRate,
      calculation_metadata: result.metadata,
    })
    .select("id")
    .single();

  if (calcError) {
    // Log but don't throw — the calculation result is still valid for display
    console.error("[calculateTaxAction] Failed to persist calculation:", calcError.message);
    return result;
  }

  // ── 6. Insert per-event reasoning log rows ───────────────────────────────
  const calcId = (calcRow as { id: string } | null)?.id;
  if (calcId) {
    const reasoningRows = result.classifiedEvents.map((ce: ClassifiedEvent) => ({
      user_id: user.id,
      tax_year: taxYear,
      event_id: ce.event.id,
      regime: taxProfile.regime,
      treatment: ce.treatment,
      profession_code: ce.event.professionCode ?? taxProfile.profession_code,
      reasoning: JSON.parse(ce.reasoningJson) as Record<string, unknown>,
    }));

    const { error: reasoningError } = await supabase
      .from("tax_reasoning_log")
      .insert(reasoningRows);

    if (reasoningError) {
      console.error(
        "[calculateTaxAction] Failed to persist reasoning log:",
        reasoningError.message
      );
    }
  }

  return result;
}
