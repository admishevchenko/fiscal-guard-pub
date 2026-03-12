import { Decimal } from "decimal.js";

/**
 * 2026 Portuguese IRS progressive tax brackets — Art. 68 CIRS
 * Source: Orçamento do Estado 2026 — Lei n.º 73-A/2025, de 30 de dezembro
 *         (CIRS Art. 68, current redaction)
 *
 * Bracket thresholds were adjusted upward by 3.51% (inflation indexation) from
 * the values in force at end-of-2025 (Lei n.º 55-A/2025). Rates for brackets
 * 2–8 changed in Lei n.º 55-A/2025 (mid-year 2025 amendment) and were kept
 * unchanged by OE 2026 (Lei n.º 73-A/2025). Top marginal rate: 48% (unchanged).
 *
 * 9-bracket structure introduced in 2022 (OE 2022 — desdobramento dos escalões).
 *
 * ⚠ VERIFY: Confirm threshold values against the official DRE gazette publication
 * of Lei do OE 2026 before filing season production use.
 *
 * All monetary values are in EUR **integer cents** (1 cent = €0.01).
 *
 * Bracket structure: income is taxed at the marginal rate for each slice.
 * Each entry applies from the prior bracket ceiling up to `upToCents`.
 * The final entry (`upToCents: null`) applies to all income above bracket 8.
 */

export interface TaxBracket {
  /** Upper limit of this bracket in EUR cents (null = unbounded top bracket) */
  upToCents: number | null;
  /**
   * Marginal rate for income falling within this bracket, as 8dp Decimal string.
   * Must be passed to `new Decimal(rate)` — never parse as a float.
   */
  rate: string;
  /** Human-readable label for reports and debugging */
  label: string;
}

/**
 * OE 2026 — Art. 68 CIRS: 9-bracket progressive IRS schedule.
 *
 * Bracket | Range (EUR)                   | Marginal Rate
 * --------|-------------------------------|---------------
 *  1      | €0       – €8,342             | 12.5%
 *  2      | €8,342   – €12,587            | 15.7%
 *  3      | €12,587  – €17,838            | 21.2%
 *  4      | €17,838  – €23,089            | 24.1%
 *  5      | €23,089  – €29,397            | 31.1%
 *  6      | €29,397  – €43,090            | 34.9%
 *  7      | €43,090  – €46,566            | 43.1%
 *  8      | €46,566  – €86,634            | 44.6%
 *  9      | €86,634  – ∞                  | 48.0%
 */
export const TAX_BRACKETS_2026: readonly TaxBracket[] = [
  { upToCents:    834_200, rate: "0.12500000", label: "Bracket 1: €0 – €8,342 @ 12.5%" },
  { upToCents:  1_258_700, rate: "0.15700000", label: "Bracket 2: €8,342 – €12,587 @ 15.7%" },
  { upToCents:  1_783_800, rate: "0.21200000", label: "Bracket 3: €12,587 – €17,838 @ 21.2%" },
  { upToCents:  2_308_900, rate: "0.24100000", label: "Bracket 4: €17,838 – €23,089 @ 24.1%" },
  { upToCents:  2_939_700, rate: "0.31100000", label: "Bracket 5: €23,089 – €29,397 @ 31.1%" },
  { upToCents:  4_309_000, rate: "0.34900000", label: "Bracket 6: €29,397 – €43,090 @ 34.9%" },
  { upToCents:  4_656_600, rate: "0.43100000", label: "Bracket 7: €43,090 – €46,566 @ 43.1%" },
  { upToCents:  8_663_400, rate: "0.44600000", label: "Bracket 8: €46,566 – €86,634 @ 44.6%" },
  { upToCents:       null, rate: "0.48000000", label: "Bracket 9: €86,634+ @ 48.0%" },
] as const;

/**
 * 2026 Solidarity surcharge — Art. 68-A CIRS.
 *
 * Applied on top of the regular progressive tax on the SAME gross income.
 * Does NOT apply to NHR/IFICI flat-rate (20%) or BLACKLIST_35 income — those
 * are taxed separately under Art. 72 and fall outside the progressive table.
 *
 * Tiers (thresholds unchanged from 2025 — fixed statutory values, not indexed):
 *
 *   Tier 1: 2.5% on income between €80,000 and €250,000
 *   Tier 2: 5.0% on income above €250,000
 *
 * ⚠ VERIFY: Confirm solidarity thresholds against official OE 2026 gazette.
 *   Historical precedent is for these values to remain stable, but OE 2026 may
 *   have applied the 3.51% index to them as well.
 */
export const SOLIDARITY_SURCHARGE_2026 = {
  /** Tier 1 lower bound — €80,000 in cents */
  tier1ThresholdCents: 8_000_000,
  /** Tier 1 upper bound / Tier 2 lower bound — €250,000 in cents */
  tier2ThresholdCents: 25_000_000,
  /** Tier 1 rate: 2.5% on €80k–€250k */
  tier1Rate: "0.02500000",
  /** Tier 2 rate: 5.0% on income above €250k */
  tier2Rate: "0.05000000",
} as const;

// ---------------------------------------------------------------------------
// Pre-constructed Decimal instances for ProgressiveTaxCalculator (hot path).
// ---------------------------------------------------------------------------
export const TAX_BRACKETS_2026_DECIMAL: readonly {
  upToCents: number | null;
  rate: Decimal;
  label: string;
}[] = TAX_BRACKETS_2026.map((b) => ({
  upToCents: b.upToCents,
  rate: new Decimal(b.rate),
  label: b.label,
}));

export const SOLIDARITY_TIER_1_RATE_DECIMAL = new Decimal(
  SOLIDARITY_SURCHARGE_2026.tier1Rate
);
export const SOLIDARITY_TIER_2_RATE_DECIMAL = new Decimal(
  SOLIDARITY_SURCHARGE_2026.tier2Rate
);
