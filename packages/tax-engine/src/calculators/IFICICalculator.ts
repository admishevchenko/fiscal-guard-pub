import { Decimal } from "decimal.js";
import { IncomeClassifier } from "../classifiers/IncomeClassifier.js";
import { ProgressiveTaxCalculator } from "./ProgressiveTaxCalculator.js";
import type {
  EngineIncomeEvent,
  EngineTaxProfile,
  CalculationResult,
  ClassifiedEvent,
  CalculationMetadata,
} from "../types.js";
import { RegimeExpiredError, RegimeNotActiveError } from "../types.js";

/** IFICI flat rate — Art. 58-A(3) EBF; Portaria n.º 352/2024, Art. 4(2) */
const IFICI_FLAT_RATE = new Decimal("0.20000000");
/** Art. 72(12) CIRS — 35% special rate on Cat E/F/G from blacklisted jurisdictions */
const BLACKLIST_35_RATE = new Decimal("0.35000000");
const EIGHT_DP = 8;

const METADATA_LEGAL_REFS = [
  "Art. 58-A EBF (IFICI — Incentivo Fiscal à Investigação Científica e Inovação)",
  "Art. 58-A(3) EBF (20% flat rate on eligible PT-sourced Cat A/B income)",
  "Art. 58-A(3) EBF — Cat H (pensions) is NOT listed in the flat-rate provision; " +
    "pensions are taxed at general progressive rates with NO exemption under IFICI.",
  "Art. 72(12) CIRS (35% special rate on Cat E/F/G from blacklisted jurisdictions)",
  "Portaria n.º 352/2024, Art. 4(2) (IFICI eligible activities + DTA exemption)",
  "Art. 68 CIRS (progressive brackets for non-eligible and pension income)",
  "Art. 68-A CIRS (solidarity surcharge: 2.5% on €80k–€250k, 5% above €250k)",
  "Portaria n.º 150/2004 as amended (blacklisted jurisdictions)",
  "Ordinance 292/2025 (HK, LI, UY removed from blacklist effective 2026-01-01)",
];

/**
 * Calculates IFICI (Incentivo Fiscal à Investigação Científica e Inovação)
 * tax liability. IFICI is the successor to NHR for post-2024 applicants.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  CRITICAL LEGAL NOTE — Category H (Pensions) under IFICI            ║
 * ║                                                                      ║
 * ║  Art. 58-A(3) EBF explicitly enumerates the income subject to the   ║
 * ║  20% flat rate: "rendimentos das categorias A e B". Category H is   ║
 * ║  absent from this provision. The NHR pension exemption under the    ║
 * ║  old Art. 72(10) CIRS (NHR Legacy) was NOT carried over to IFICI.  ║
 * ║  Therefore, Cat H pensions are taxed at PROGRESSIVE rates under     ║
 * ║  IFICI, with NO flat rate and NO exemption.                          ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Key differences vs NHR:
 *   - Cat H: PROGRESSIVE (no pension exemption) — Art. 58-A EBF
 *   - Innovation activity bonus: tracked in metadata for future deduction support
 *   - All other classification rules are identical to NHR
 */
export class IFICICalculator {
  private readonly classifier = new IncomeClassifier();
  private readonly progressiveCalc = new ProgressiveTaxCalculator();

  calculateIFICI(
    profile: EngineTaxProfile,
    events: EngineIncomeEvent[],
    taxYear: number
  ): CalculationResult {
    this.validateRegime(profile, taxYear);

    let flat20IncomeCents = 0;
    let dtaExemptIncomeCents = 0;
    // pensionExemptIncomeCents is always 0 for IFICI — included in result
    // structure for API consistency but never populated.
    const pensionExemptIncomeCents = 0;
    let progressiveIncomeCents = 0;
    let pendingManualReviewIncomeCents = 0;
    let blacklist35IncomeCents = 0;

    // Map of event.id → taxableAmountCents after applying Art. 31 CIRS coefficient.
    // Used both for bucket accumulators and for pro-rate distribution loops below.
    const taxableAmountMap = new Map<string, number>();

    const classifiedEvents: ClassifiedEvent[] = [];

    for (const event of events) {
      // Art. 31 CIRS: regime simplificado coefficient reduces the taxable base for Cat B.
      // Year 1 (Art. 31(17) CIRS): coefficient × 0.50 → effective 0.375
      // Year 2 (Art. 31(18) CIRS): coefficient × 0.75 → effective 0.5625
      // Year 3+: full coefficient 0.75
      // null/undefined catBCoefficient → no reduction, use full gross.
      const taxableAmountCents =
        event.category === "B" && event.catBCoefficient != null
          ? new Decimal(event.grossAmountCents)
              .times(event.catBCoefficient)
              .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
              .toNumber()
          : event.grossAmountCents;
      taxableAmountMap.set(event.id, taxableAmountCents);

      const asOfDate = new Date(event.receivedAt);
      const { treatment, reasoningJson } = this.classifier.classify(event, profile, asOfDate);

      let taxCents = 0;
      let lawRef: string;

      switch (treatment) {
        case "FLAT_20": {
          // Art. 58-A(3) EBF; Portaria n.º 352/2024, Art. 4(2)
          // taxCents is set to 0 here; pro-rated from aggregate flat20TaxCents below
          // to ensure sum(classifiedEvents.taxCents) === flat20TaxCents exactly.
          // Art. 31 CIRS coefficient applied: taxable base = gross × catBCoefficient.
          taxCents = 0;
          flat20IncomeCents += taxableAmountCents;
          lawRef = "Art. 58-A(3) EBF; Portaria n.º 352/2024, Art. 4(2) — IFICI 20% flat rate";
          break;
        }
        case "DTA_EXEMPT": {
          // Portaria n.º 352/2024, Art. 4(1)(b) — exemption method.
          // Art. 31 CIRS coefficient applied: exempt amount is the taxable equivalent.
          taxCents = 0;
          dtaExemptIncomeCents += taxableAmountCents;
          lawRef = "Portaria n.º 352/2024, Art. 4(1)(b) — DTA exemption method";
          break;
        }
        case "PENSION_EXEMPT":
        case "PENSION_10PCT": {
          // The classifier returns PENSION_EXEMPT/PENSION_10PCT only for NHR.
          // For IFICI this path should not be reached (IncomeClassifier
          // only returns these when profile.regime === "NHR").
          // Guard defensively and treat as PROGRESSIVE.
          taxCents = 0;
          progressiveIncomeCents += taxableAmountCents;
          lawRef =
            "Art. 58-A(3) EBF — Cat H NOT in flat-rate provision; " +
            "taxed at progressive rates under IFICI. Art. 68 CIRS applies.";
          // Override treatment in the stored event to reflect actual tax applied
          classifiedEvents.push({
            event,
            treatment: "PROGRESSIVE",
            taxCents,
            lawRef,
            reasoningJson,
          });
          continue;
        }
        case "PENDING_MANUAL_REVIEW": {
          // Conservative treatment: apply PROGRESSIVE rates until profession code verified.
          // Income counted in both pendingManualReviewIncomeCents (UI warning) and
          // progressiveIncomeCents (tax calculation).
          taxCents = 0;
          pendingManualReviewIncomeCents += taxableAmountCents;
          progressiveIncomeCents += taxableAmountCents;
          lawRef =
            "Portaria n.º 352/2024, Annex — profession code pending manual review; " +
            "Art. 68 CIRS progressive rates applied conservatively";
          break;
        }
        case "PROGRESSIVE": {
          taxCents = 0;
          progressiveIncomeCents += taxableAmountCents;
          lawRef = "Art. 68 CIRS (progressive brackets) + Art. 68-A CIRS (solidarity surcharge)";
          break;
        }
        case "BLACKLIST_35": {
          // Art. 72(12) CIRS — 35% special rate on Cat E/F/G from blacklisted jurisdictions.
          // taxCents = 0 here; pro-rated from aggregate blacklist35TaxCents below.
          taxCents = 0;
          blacklist35IncomeCents += taxableAmountCents;
          lawRef = "Art. 72(12) CIRS — 35% special rate on capital/rental income from blacklisted jurisdictions";
          break;
        }
      }

      classifiedEvents.push({ event, treatment, taxCents, lawRef, reasoningJson });
    }

    // Progressive tax on aggregate bucket (brackets + solidarity)
    const progressiveResult =
      this.progressiveCalc.calculateProgressiveTax(progressiveIncomeCents);

    // Pro-rate progressive tax to individual events for the breakdown UI
    // PENDING_MANUAL_REVIEW events share the progressive bucket — pro-rate them too.
    // Uses taxable amount (after Art. 31 CIRS coefficient) as the proportioning weight.
    if (progressiveIncomeCents > 0) {
      const proRateFactor = new Decimal(progressiveResult.totalTaxCents).dividedBy(
        progressiveIncomeCents
      );
      for (const ce of classifiedEvents) {
        if (ce.treatment === "PROGRESSIVE" || ce.treatment === "PENDING_MANUAL_REVIEW") {
          const taxable = taxableAmountMap.get(ce.event.id) ?? ce.event.grossAmountCents;
          ce.taxCents = proRateFactor
            .times(taxable)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber();
        }
      }
    }

    const flat20TaxCents = IFICI_FLAT_RATE.times(flat20IncomeCents)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    // Pro-rate flat-20 tax to individual events so sum(classifiedEvents.taxCents)
    // equals flat20TaxCents exactly (avoids per-event rounding divergence).
    // Uses taxable amount (after Art. 31 CIRS coefficient) as the proportioning weight.
    if (flat20IncomeCents > 0) {
      const flat20ProRate = new Decimal(flat20TaxCents).dividedBy(flat20IncomeCents);
      for (const ce of classifiedEvents) {
        if (ce.treatment === "FLAT_20") {
          const taxable = taxableAmountMap.get(ce.event.id) ?? ce.event.grossAmountCents;
          ce.taxCents = flat20ProRate
            .times(taxable)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber();
        }
      }
    }

    // Art. 72(12) CIRS — 35% aggregate on BLACKLIST_35 bucket, then pro-rate per event.
    const blacklist35TaxCents = BLACKLIST_35_RATE.times(blacklist35IncomeCents)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (blacklist35IncomeCents > 0) {
      const bl35ProRate = new Decimal(blacklist35TaxCents).dividedBy(blacklist35IncomeCents);
      for (const ce of classifiedEvents) {
        if (ce.treatment === "BLACKLIST_35") {
          const taxable = taxableAmountMap.get(ce.event.id) ?? ce.event.grossAmountCents;
          ce.taxCents = bl35ProRate
            .times(taxable)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber();
        }
      }
    }

    const totalTaxCents = flat20TaxCents + progressiveResult.totalTaxCents + blacklist35TaxCents;
    const totalGrossIncomeCents =
      flat20IncomeCents +
      dtaExemptIncomeCents +
      pensionExemptIncomeCents +
      progressiveIncomeCents +
      blacklist35IncomeCents;

    const effectiveRate =
      totalGrossIncomeCents === 0
        ? "0.00000000"
        : new Decimal(totalTaxCents)
            .dividedBy(totalGrossIncomeCents)
            .toDecimalPlaces(EIGHT_DP, Decimal.ROUND_HALF_UP)
            .toFixed(EIGHT_DP);

    const metadata: CalculationMetadata = {
      flatRate: IFICI_FLAT_RATE.toFixed(EIGHT_DP),
      solidarityTier1ThresholdCents: ProgressiveTaxCalculator.SOLIDARITY_TIER_1_THRESHOLD_CENTS,
      solidarityTier1Rate: ProgressiveTaxCalculator.SOLIDARITY_TIER_1_RATE,
      solidarityTier2ThresholdCents: ProgressiveTaxCalculator.SOLIDARITY_TIER_2_THRESHOLD_CENTS,
      solidarityTier2Rate: ProgressiveTaxCalculator.SOLIDARITY_TIER_2_RATE,
      blacklist35Rate: BLACKLIST_35_RATE.toFixed(EIGHT_DP),
      isInnovationActivity: profile.isInnovationActivity,
      legalRefs: METADATA_LEGAL_REFS,
    };

    return {
      regime: "IFICI",
      taxYear,
      flat20IncomeCents,
      flat20TaxCents,
      dtaExemptIncomeCents,
      pensionExemptIncomeCents,
      pension10pctIncomeCents: 0,
      pension10pctTaxCents: 0,
      progressiveIncomeCents,
      pendingManualReviewIncomeCents,
      blacklist35IncomeCents,
      blacklist35TaxCents,
      progressiveTaxCents: progressiveResult.progressiveTaxCents,
      solidaritySurchargeCents: progressiveResult.solidaritySurchargeCents,
      totalGrossIncomeCents,
      totalTaxCents,
      effectiveRate,
      classifiedEvents,
      metadata,
    };
  }

  /**
   * Validates that the IFICI regime is active for the given tax year.
   * Art. 58-A(7) EBF: 10-year lock-in from entry year.
   */
  private validateRegime(profile: EngineTaxProfile, taxYear: number): void {
    // Use string-slice parse to avoid UTC/timezone ambiguity with new Date() (L5 fix).
    const entryYear = parseInt(profile.regimeEntryDate.slice(0, 4), 10);
    const lastValidYear = entryYear + 9;

    if (taxYear < entryYear) {
      throw new RegimeNotActiveError("IFICI", taxYear, profile.regimeEntryDate);
    }
    if (taxYear > lastValidYear) {
      const expiredDate = `${lastValidYear + 1}-01-01`;
      throw new RegimeExpiredError("IFICI", taxYear, expiredDate);
    }
    if (
      profile.regimeExitDate !== null &&
      new Date(profile.regimeExitDate) < new Date(`${taxYear}-01-01`)
    ) {
      throw new RegimeExpiredError("IFICI", taxYear, profile.regimeExitDate);
    }
  }
}

/**
 * Convenience function — calculates IFICI tax liability without
 * instantiating the class manually.
 *
 * Art. 58-A EBF; Portaria n.º 352/2024.
 * Note: Cat H (pensions) is taxed at progressive rates — no exemption under IFICI.
 */
export function calculateIFICI(
  profile: EngineTaxProfile,
  events: EngineIncomeEvent[],
  taxYear: number
): CalculationResult {
  return new IFICICalculator().calculateIFICI(profile, events, taxYear);
}
