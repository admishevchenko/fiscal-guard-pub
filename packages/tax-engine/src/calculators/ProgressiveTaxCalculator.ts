import { Decimal } from "decimal.js";
import {
  TAX_BRACKETS_2026_DECIMAL,
  SOLIDARITY_SURCHARGE_2026,
  SOLIDARITY_TIER_1_RATE_DECIMAL,
  SOLIDARITY_TIER_2_RATE_DECIMAL,
} from "../data/TaxBrackets.js";

// Isolated Decimal constructor — avoids mutating the global Decimal config shared
// across the monorepo. precision: 28 sig figs ensures accurate intermediate
// calculations across all 9 brackets before final toDecimalPlaces(0) rounding.
// Art. 68 CIRS requires exact cent-level tax computation.
const TaxDecimal = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ---------------------------------------------------------------------------
// Solidarity surcharge local aliases (named constants for clarity)
// ---------------------------------------------------------------------------
const SOLIDARITY_T1_THRESHOLD = SOLIDARITY_SURCHARGE_2026.tier1ThresholdCents;
const SOLIDARITY_T1_TOP       = SOLIDARITY_SURCHARGE_2026.tier2ThresholdCents; // doubles as tier-2 floor
const SOLIDARITY_T2_THRESHOLD = SOLIDARITY_SURCHARGE_2026.tier2ThresholdCents;

const EIGHT_DP = 8;

export interface ProgressiveTaxResult {
  grossAmountCents: number;
  /** Tax from the 9-bracket progressive table (Art. 68 CIRS OE 2026), in cents */
  progressiveTaxCents: number;
  /**
   * Solidarity surcharge (Art. 68-A CIRS), in cents.
   * Tier 1: 2.5% on income €80k–€250k.
   * Tier 2: 5.0% on income above €250k.
   */
  solidaritySurchargeCents: number;
  /** progressiveTaxCents + solidaritySurchargeCents */
  totalTaxCents: number;
  /** Effective rate = totalTax / gross, as 8dp Decimal string */
  effectiveRate: string;
}

export class ProgressiveTaxCalculator {
  /**
   * Computes the full 2026 progressive tax (brackets + solidarity surcharge)
   * on a given gross income amount in EUR cents.
   *
   * Uses OE 2026 9-bracket schedule from {@link TAX_BRACKETS_2026_DECIMAL}.
   * All intermediate calculations use Decimal.js at 28-figure precision.
   * Final cent values are rounded to the nearest integer (ROUND_HALF_UP).
   *
   * Art. 68 CIRS (9 brackets, 12.5%–48%) + Art. 68-A CIRS (solidarity surcharge).
   *
   * @param grossAmountCents - Gross income in EUR integer cents (≥ 0)
   */
  calculateProgressiveTax(grossAmountCents: number): ProgressiveTaxResult {
    if (grossAmountCents < 0) {
      throw new RangeError(
        `[fiscal-guard] grossAmountCents must be ≥ 0; got ${grossAmountCents}`
      );
    }

    const gross = new TaxDecimal(grossAmountCents);
    let remaining = gross;
    let bracketTax = new TaxDecimal(0);
    let prevFloor = new TaxDecimal(0);

    // --- Progressive bracket calculation (Art. 68 CIRS OE 2026 — 9 brackets) ---
    for (const bracket of TAX_BRACKETS_2026_DECIMAL) {
      if (remaining.isZero()) break;

      const bracketSize: Decimal =
        bracket.upToCents !== null
          ? new TaxDecimal(bracket.upToCents).minus(prevFloor)
          : remaining; // unbounded top bracket — consume all remaining

      const taxableInBracket = TaxDecimal.min(remaining, bracketSize);
      bracketTax = bracketTax.plus(taxableInBracket.times(bracket.rate));
      remaining = remaining.minus(taxableInBracket);

      if (bracket.upToCents !== null) {
        prevFloor = new TaxDecimal(bracket.upToCents);
      }
    }

    // --- Solidarity surcharge (Art. 68-A CIRS) ---
    // Tier 1: 2.5% on income between €80,000 and €250,000
    // Tier 2: 5.0% on income above €250,000
    let solidarity = new TaxDecimal(0);

    if (grossAmountCents > SOLIDARITY_T1_THRESHOLD) {
      const tier1Ceiling = Math.min(grossAmountCents, SOLIDARITY_T1_TOP);
      const tier1Amount = new TaxDecimal(tier1Ceiling - SOLIDARITY_T1_THRESHOLD);
      solidarity = solidarity.plus(tier1Amount.times(SOLIDARITY_TIER_1_RATE_DECIMAL));
    }

    if (grossAmountCents > SOLIDARITY_T2_THRESHOLD) {
      const tier2Amount = new TaxDecimal(grossAmountCents - SOLIDARITY_T2_THRESHOLD);
      solidarity = solidarity.plus(tier2Amount.times(SOLIDARITY_TIER_2_RATE_DECIMAL));
    }

    // --- Round to nearest cent ---
    const progressiveTaxCents = bracketTax
      .toDecimalPlaces(0, TaxDecimal.ROUND_HALF_UP)
      .toNumber();
    const solidaritySurchargeCents = solidarity
      .toDecimalPlaces(0, TaxDecimal.ROUND_HALF_UP)
      .toNumber();
    const totalTaxCents = progressiveTaxCents + solidaritySurchargeCents;

    const effectiveRate = gross.isZero()
      ? new TaxDecimal(0)
      : new TaxDecimal(totalTaxCents).dividedBy(gross);

    return {
      grossAmountCents,
      progressiveTaxCents,
      solidaritySurchargeCents,
      totalTaxCents,
      effectiveRate: effectiveRate
        .toDecimalPlaces(EIGHT_DP, Decimal.ROUND_HALF_UP)
        .toFixed(EIGHT_DP),
    };
  }

  /** Exposed constants for test verification and metadata structs */
  static readonly SOLIDARITY_TIER_1_THRESHOLD_CENTS = SOLIDARITY_SURCHARGE_2026.tier1ThresholdCents;
  static readonly SOLIDARITY_TIER_1_TOP_CENTS       = SOLIDARITY_SURCHARGE_2026.tier2ThresholdCents;
  static readonly SOLIDARITY_TIER_1_RATE            = SOLIDARITY_SURCHARGE_2026.tier1Rate;
  static readonly SOLIDARITY_TIER_2_THRESHOLD_CENTS = SOLIDARITY_SURCHARGE_2026.tier2ThresholdCents;
  static readonly SOLIDARITY_TIER_2_RATE            = SOLIDARITY_SURCHARGE_2026.tier2Rate;
}
