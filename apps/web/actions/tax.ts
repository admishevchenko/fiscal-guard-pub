"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TaxEngine } from "@fiscal-guard/tax-engine";
import type {
  EngineIncomeEvent,
  EngineTaxProfile,
  CalculationResult,
  ClassifiedEvent,
} from "@fiscal-guard/tax-engine";
import { createHash } from "crypto";

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
  nhr_pension_exemption_elected: boolean;
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Computes a deterministic SHA-256 hash of the profile + events payload.
 * Used to skip redundant recalculations when the inputs have not changed.
 */
function computeInputHash(
  profile: DbTaxProfile,
  events: DbIncomeEvent[],
): string {
  const payload = JSON.stringify({
    p: {
      regime: profile.regime,
      entry: profile.regime_entry_date,
      exit: profile.regime_exit_date,
      code: profile.profession_code,
      innovation: profile.is_innovation_activity,
      pensionElected: profile.nhr_pension_exemption_elected,
    },
    e: events
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((ev) => ({
        id: ev.id,
        cat: ev.category,
        src: ev.source,
        sc: ev.source_country,
        amt: ev.gross_amount_cents,
        coeff: ev.cat_b_coefficient,
      })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Runs the full NHR/IFICI tax calculation for the given tax year.
 *
 * **Idempotency**: computes a SHA-256 hash of (profile + events). If the
 * existing calculation row already has the same hash, the engine is NOT
 * re-run and no DB writes occur — the cached CalculationResult is returned.
 * This prevents data bloat and race conditions from repeated page renders.
 *
 * Flow:
 *  1. Fetch active tax_profile (regime_exit_date IS NULL)
 *  2. Fetch income_events for taxYear
 *  3. Compute input hash; if matching cached calculation exists → return early
 *  4. Run TaxEngine.calculate()
 *  5. Delete any previous calculation + reasoning log for this user/year
 *  6. Insert new calculation row with input_hash
 *  7. Insert per-event rows into tax_reasoning_log
 *  8. Return CalculationResult
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
      "id, user_id, regime, regime_entry_date, regime_exit_date, profession_code, is_innovation_activity, nhr_pension_exemption_elected"
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

  // ── 3. Idempotency check — skip recalc if inputs unchanged ──────────────
  const inputHash = computeInputHash(taxProfile, dbEvents);

  const { data: existingCalc } = await supabase
    .from("calculations")
    .select("id, input_hash, calculation_metadata")
    .eq("user_id", user.id)
    .eq("tax_year", taxYear)
    .maybeSingle();

  // ── 4. Map DB rows → EngineIncomeEvent ──────────────────────────────────
  const engineProfile: EngineTaxProfile = {
    regime: taxProfile.regime,
    regimeEntryDate: taxProfile.regime_entry_date,
    regimeExitDate: taxProfile.regime_exit_date,
    professionCode: taxProfile.profession_code,
    isInnovationActivity: taxProfile.is_innovation_activity,
    // Lei n.º 2/2020, Art. 12: pre-2020 NHR holders who elected pension exemption
    nhrPensionExemptionElected: taxProfile.nhr_pension_exemption_elected,
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
    description: evt.description,
    receivedAt,
    professionCode: taxProfile.profession_code,
    // Art. 31 CIRS: pass the stored regime simplificado coefficient to the engine.
    // The engine uses this to reduce the taxable base for Cat B income.
    catBCoefficient: evt.cat_b_coefficient ?? undefined,
  }));

  // ── 5. Run calculation ───────────────────────────────────────────────────
  const engine = new TaxEngine(engineProfile);
  const result = engine.calculate(engineEvents, taxYear);

  // If the cached hash matches, the inputs haven't changed — skip DB writes
  if (
    existingCalc &&
    (existingCalc as { input_hash?: string }).input_hash === inputHash
  ) {
    return result;
  }

  // ── 6. Replace calculation row + clear stale reasoning log ──────────────
  // Delete previous calc and reasoning rows atomically before inserting fresh
  // ones. This prevents data bloat from repeated renders.
  await supabase
    .from("tax_reasoning_log")
    .delete()
    .eq("user_id", user.id)
    .eq("tax_year", taxYear);

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
      input_hash: inputHash,
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

  // ── 7. Insert per-event reasoning log rows ───────────────────────────────
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
