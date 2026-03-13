import type { IncomeCategory, IncomeSource, TaxRegime } from "@fiscal-guard/types";

// ---------------------------------------------------------------------------
// Engine input types (DB-agnostic; no id/userId/createdAt required)
// ---------------------------------------------------------------------------

export interface EngineIncomeEvent {
  id: string;
  taxYear: number;
  /** ISO 3166-1 alpha-2 country code */
  sourceCountry: string;
  source: IncomeSource;
  category: IncomeCategory;
  /** Gross income in EUR integer cents */
  grossAmountCents: number;
  /** ISO 8601 UTC timestamp of receipt — used for point-in-time blacklist check */
  receivedAt: string;
  /** CNAEF profession code; required for Cat A/B eligibility classification */
  professionCode?: string | undefined;
  /**
   * Art. 31 CIRS regime simplificado coefficient. Only applicable to Cat B.
   * Reduces taxable base: taxable = gross × catBCoefficient
   * Year 1 of activity (Art. 31(17) CIRS): 0.375
   * Year 2 of activity (Art. 31(18) CIRS): 0.5625
   * Year 3+: 0.75 (full coefficient)
   * null / undefined = 1.0 — no reduction (non-Cat B or no selection)
   */
  catBCoefficient?: number | undefined;
}

export interface EngineTaxProfile {
  regime: TaxRegime;
  /** ISO 8601 date when regime was granted */
  regimeEntryDate: string;
  /** ISO 8601 date when regime ended; null = still active */
  regimeExitDate: string | null;
  /** Fallback CNAEF profession code (used if income event has none) */
  professionCode: string;
  /** IFICI only: true if user performs an R&D / innovation activity */
  isInnovationActivity: boolean;
  /**
   * NHR Legacy only — pre-2020 applicants.
   * Lei n.º 2/2020 (OE 2020), Art. 12 transitional provision:
   * NHR holders registered before 2020-01-01 may ELECT to maintain the
   * original pension exemption (PENSION_EXEMPT) for their remaining 10-year
   * period.  Set to `true` if the user made this election; `false` or absent
   * means the 10% rate (PENSION_10PCT) applies.
   * Irrelevant for post-2019 NHR registrations and for IFICI holders.
   */
  nhrPensionExemptionElected?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Tax treatment enum
// ---------------------------------------------------------------------------

/**
 * FLAT_20        – 20% flat rate (NHR/IFICI eligible Cat A/B, PT-sourced)
 *                  Art. 72(10) CIRS; Portaria n.º 352/2024, Art. 4(1)(a)
 * DTA_EXEMPT     – Foreign income exempt via DTA exemption method
 *                  Portaria n.º 352/2024, Art. 4(1)(b)
 * PENSION_EXEMPT – NHR Cat H foreign pension exemption (NHR Legacy pre-2020
 *                  applicants who elected to maintain the old exemption only).
 *                  Art. 72(10) CIRS (NHR Legacy); Lei n.º 2/2020, Art. 12
 *                  transitional provision.
 * PENSION_10PCT  – NHR Cat H foreign pension at 10% special rate.
 *                  Applies to: (a) NHR entry 2020-01-01 onwards (mandatory);
 *                  (b) NHR entry before 2020-01-01 where the taxpayer did NOT
 *                  elect to maintain the old exemption.
 *                  Art. 72(10) CIRS as amended by Lei n.º 2/2020 (OE 2020).
 * PROGRESSIVE    – General progressive rates + 2026 solidarity surcharge
 *                  Art. 68 + Art. 68-A CIRS
 * BLACKLIST_35   – 35% special rate on Cat E/F/G capital/rental/gains income
 *                  from actively blacklisted jurisdictions.
 *                  Art. 72(12) CIRS: overrides progressive brackets AND the
 *                  NHR/IFICI flat-rate. Applies to "rendimentos de capitais"
 *                  (Cat E), "rendimentos prediais" (Cat F), and Cat G capital
 *                  gains from Portaria n.º 150/2004 listed territories.
 * PENDING_MANUAL_REVIEW – Profession code is in the SUSPECT set and requires
 *                  manual verification against the Portaria n.º 352/2024 Annex
 *                  before a 20% flat rate can be confirmed.  The engine applies
 *                  conservative PROGRESSIVE rates until a compliance officer
 *                  resolves the flag.  The UI MUST display a warning to the user.
 *                  See SUSPECT_PROFESSION_CODES in eligibleProfessions.ts.
 */
export type TaxTreatment =
  | "FLAT_20"
  | "DTA_EXEMPT"
  | "PENSION_EXEMPT"
  | "PENSION_10PCT"
  | "PROGRESSIVE"
  | "BLACKLIST_35"
  | "PENDING_MANUAL_REVIEW";

// ---------------------------------------------------------------------------
// Calculation result
// ---------------------------------------------------------------------------

export interface ClassifiedEvent {
  event: EngineIncomeEvent;
  treatment: TaxTreatment;
  /**
   * Individual tax for this event in cents.
   * FLAT_20: 20% of gross.
   * DTA_EXEMPT / PENSION_EXEMPT: 0.
   * PENDING_MANUAL_REVIEW: estimated progressive tax (conservative, pending resolution).
   * PROGRESSIVE: 0 — progressive tax is computed on the aggregate bucket,
   *   not per-event, to correctly apply bracket stacking.
   */
  taxCents: number;
  /** Citable legal reference for this treatment */
  lawRef: string;
  /**
   * Machine-readable audit trail for this classification decision.
   * Serialised JSON string — always present.  Persisted to `tax_reasoning_log`
   * in Supabase so auditors can replay every classification.
   * Shape: { rule: string; code?: string; status: "verified"|"pending"|"exempt"|"progressive"|"blacklist" }
   */
  reasoningJson: string;
}

export interface CalculationMetadata {
  flatRate: string;                        // "0.20000000"
  solidarityTier1ThresholdCents: number;   // 8_000_000  (€80,000)
  solidarityTier1Rate: string;             // "0.02500000"
  solidarityTier2ThresholdCents: number;   // 25_000_000 (€250,000)
  solidarityTier2Rate: string;             // "0.05000000"
  /** Art. 72(12) CIRS — 35% special rate on Cat E/F/G from blacklisted jurisdictions */
  blacklist35Rate: string;                 // "0.35000000"
  isInnovationActivity: boolean;
  legalRefs: string[];
}

export interface CalculationResult {
  regime: TaxRegime;
  taxYear: number;

  // --- Income buckets (cents) ---
  flat20IncomeCents: number;
  flat20TaxCents: number;
  dtaExemptIncomeCents: number;
  pensionExemptIncomeCents: number;
  /**
   * NHR Cat H foreign pension income taxed at the 10% special rate.
   * Lei n.º 2/2020 (OE 2020), Art. 12 + Art. 72(10) CIRS (amended):
   *   - NHR entry on or after 2020-01-01: mandatory 10% (no exemption).
   *   - NHR entry before 2020-01-01 without exemption election: 10%.
   */
  pension10pctIncomeCents: number;
  /** Tax on the PENSION_10PCT bucket: pension10pctIncomeCents × 10% */
  pension10pctTaxCents: number;
  progressiveIncomeCents: number;
  /**
   * Cat E/F/G income from actively blacklisted jurisdictions.
   * Taxed at 35% per Art. 72(12) CIRS — NOT via progressive brackets.
   */
  blacklist35IncomeCents: number;
  blacklist35TaxCents: number;

  /**
   * Income where the profession code is in SUSPECT_PROFESSION_CODES and has
   * not yet been manually verified against the Portaria n.º 352/2024 Annex.
   * This is a SUBSET of `progressiveIncomeCents` — the engine applies
   * conservative progressive rates until a compliance officer clears the flag.
   *
   * UI MUST show a warning when this value is > 0.
   */
  pendingManualReviewIncomeCents: number;

  // --- Tax on progressive bucket ---
  progressiveTaxCents: number;
  /** Solidarity surcharge (Art. 68-A CIRS) — applies to progressive bucket only */
  solidaritySurchargeCents: number;

  // --- Totals ---
  /**
   * Sum of all events' raw grossAmountCents BEFORE any Art. 31 CIRS coefficient
   * reduction. This is the real income the user earned — shown in the dashboard
   * "Total Gross Income" card. The bucket fields (flat20IncomeCents etc.) hold
   * taxable amounts (after coefficient) and are used for tax math.
   */
  totalGrossIncomeCents: number;
  totalTaxCents: number;
  /** Effective overall rate: totalTax / totalGross, 8dp Decimal string */
  effectiveRate: string;

  classifiedEvents: ClassifiedEvent[];
  metadata: CalculationMetadata;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Thrown when the NHR/IFICI regime has expired for the requested tax year. */
export class RegimeExpiredError extends Error {
  constructor(regime: TaxRegime, taxYear: number, expiredDate: string) {
    super(
      `[fiscal-guard] ${regime} regime expired on ${expiredDate} — ` +
        `it is not valid for tax year ${taxYear}. ` +
        `Art. 16(9) CIRS / Art. 58-A(7) EBF: 10-year lock-in, no re-application after exit.`
    );
    this.name = "RegimeExpiredError";
  }
}

/** Thrown when the regime had not yet started for the requested tax year. */
export class RegimeNotActiveError extends Error {
  constructor(regime: TaxRegime, taxYear: number, entryDate: string) {
    super(
      `[fiscal-guard] ${regime} regime (entry: ${entryDate}) was not yet active ` +
        `for tax year ${taxYear}.`
    );
    this.name = "RegimeNotActiveError";
  }
}
