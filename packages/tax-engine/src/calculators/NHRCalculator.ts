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

/** NHR flat rate — Art. 72(10) CIRS; Portaria n.º 352/2024, Art. 4(1)(a) */
const NHR_FLAT_RATE = new Decimal("0.20000000");
/**
 * NHR pension 10% special rate — Art. 72(10) CIRS as amended by Lei n.º 2/2020 (OE 2020).
 * Applies to NHR holders registered on or after 2020-01-01 (mandatory), and to
 * pre-2020 NHR holders who did not elect to maintain the old exemption.
 */
const NHR_PENSION_10PCT_RATE = new Decimal("0.10000000");
/** Art. 72(12) CIRS — 35% special rate on Cat E/F/G from blacklisted jurisdictions */
const BLACKLIST_35_RATE = new Decimal("0.35000000");
const EIGHT_DP = 8;

const METADATA_LEGAL_REFS = [
  "Art. 16 CIRS (NHR regime — Non-Habitual Resident)",
  "Art. 72(10) CIRS (20% flat rate on eligible PT-sourced income)",
  "Art. 72(10) CIRS + Lei n.º 2/2020 Art. 12 (NHR pension: PENSION_EXEMPT for pre-2020 elected; PENSION_10PCT otherwise)",
  "Art. 72(12) CIRS (35% special rate on Cat E/F/G from blacklisted jurisdictions)",
  "Portaria n.º 352/2024, Art. 4 (eligible activities + DTA exemption)",
  "Art. 68 CIRS (progressive brackets)",
  "Art. 68-A CIRS (solidarity surcharge: 2.5% on €80k–€250k, 5% above €250k)",
  "Portaria n.º 150/2004 as amended (blacklisted jurisdictions)",
  "Ordinance 292/2025 (HK, LI, UY removed from blacklist effective 2026-01-01)",
];

/**
 * Calculates NHR (Non-Habitual Resident) tax liability.
 *
 * NHR is the Legacy regime under Art. 16 CIRS for applicants registered
 * before the 2024 reform. Key differences vs IFICI:
 *   - Cat H (pensions): PENSION_EXEMPT under NHR (Art. 72(10) CIRS).
 *   - The 10-year lock applies from the year of first registration.
 */
export class NHRCalculator {
  private readonly classifier = new IncomeClassifier();
  private readonly progressiveCalc = new ProgressiveTaxCalculator();

  calculateNHR(
    profile: EngineTaxProfile,
    events: EngineIncomeEvent[],
    taxYear: number
  ): CalculationResult {
    this.validateRegime(profile, taxYear);

    // Use year-end as reference for blacklist checks — income received
    // at any point during the year uses that event's receivedAt for precision.

    let flat20IncomeCents = 0;
    let dtaExemptIncomeCents = 0;
    let pensionExemptIncomeCents = 0;
    let pension10pctIncomeCents = 0;
    let progressiveIncomeCents = 0;
    let pendingManualReviewIncomeCents = 0;
    let blacklist35IncomeCents = 0;

    const classifiedEvents: ClassifiedEvent[] = [];

    for (const event of events) {
      const asOfDate = new Date(event.receivedAt);
      const { treatment, reasoningJson } = this.classifier.classify(event, profile, asOfDate);

      let taxCents = 0;
      let lawRef: string;

      switch (treatment) {
        case "FLAT_20": {
          // Art. 72(10) CIRS; Portaria n.º 352/2024, Art. 4(1)(a)
          // taxCents is set to 0 here; pro-rated from aggregate flat20TaxCents below
          // to ensure sum(classifiedEvents.taxCents) === flat20TaxCents exactly.
          taxCents = 0;
          flat20IncomeCents += event.grossAmountCents;
          lawRef = "Art. 72(10) CIRS; Portaria n.º 352/2024, Art. 4(1)(a) — 20% flat rate";
          break;
        }
        case "DTA_EXEMPT": {
          // Portaria n.º 352/2024, Art. 4(1)(b) — exemption method
          taxCents = 0;
          dtaExemptIncomeCents += event.grossAmountCents;
          lawRef = "Portaria n.º 352/2024, Art. 4(1)(b) — DTA exemption method";
          break;
        }
        case "PENSION_EXEMPT": {
          // Art. 72(10) CIRS — NHR pension exemption (pre-2020 elected only)
          taxCents = 0;
          pensionExemptIncomeCents += event.grossAmountCents;
          lawRef = "Art. 72(10) CIRS — NHR Cat H pension exemption (pre-2020 applicants who elected to maintain)";
          break;
        }
        case "PENSION_10PCT": {
          // Art. 72(10) CIRS as amended by Lei n.º 2/2020 (OE 2020) — 10% special rate.
          // Applies to NHR entry 2020+ (mandatory) and pre-2020 without election.
          // taxCents = 0 here; pro-rated from aggregate pension10pctTaxCents below.
          taxCents = 0;
          pension10pctIncomeCents += event.grossAmountCents;
          lawRef = "Art. 72(10) CIRS as amended by Lei n.º 2/2020 (OE 2020) — NHR pension 10% special rate";
          break;
        }
        case "PENDING_MANUAL_REVIEW": {
          // Conservative treatment: apply PROGRESSIVE rates until a compliance officer
          // verifies the profession code against the Portaria n.º 352/2024 Annex.
          // Income counted in both pendingManualReviewIncomeCents (for UI warning) and
          // progressiveIncomeCents (for tax calculation — bracket stacking applies).
          taxCents = 0;
          pendingManualReviewIncomeCents += event.grossAmountCents;
          progressiveIncomeCents += event.grossAmountCents;
          lawRef =
            "Portaria n.º 352/2024, Annex — profession code pending manual review; " +
            "Art. 68 CIRS progressive rates applied conservatively";
          break;
        }
        case "PROGRESSIVE": {
          // Art. 68 CIRS + Art. 68-A solidarity surcharge.
          // Tax computed on the AGGREGATE progressive bucket below,
          // not per-event (bracket stacking applies to total income).
          taxCents = 0;
          progressiveIncomeCents += event.grossAmountCents;
          lawRef = "Art. 68 CIRS (progressive brackets) + Art. 68-A CIRS (solidarity surcharge)";
          break;
        }
        case "BLACKLIST_35": {
          // Art. 72(12) CIRS — 35% special rate on Cat E/F/G from blacklisted jurisdictions.
          // taxCents = 0 here; pro-rated from aggregate blacklist35TaxCents below.
          taxCents = 0;
          blacklist35IncomeCents += event.grossAmountCents;
          lawRef = "Art. 72(12) CIRS — 35% special rate on capital/rental income from blacklisted jurisdictions";
          break;
        }
      }

      classifiedEvents.push({ event, treatment, taxCents, lawRef, reasoningJson });
    }

    // Progressive tax on aggregate bucket (brackets + solidarity)
    const progressiveResult =
      this.progressiveCalc.calculateProgressiveTax(progressiveIncomeCents);

    // Update progressive events' taxCents pro-rata to the aggregate result
    // so the per-event breakdown is informative (not 0).
    // PENDING_MANUAL_REVIEW events are included in progressiveIncomeCents and also
    // receive a pro-rated taxCents here (conservative estimate for UI display).
    if (progressiveIncomeCents > 0) {
      const proRateFactor = new Decimal(progressiveResult.totalTaxCents).dividedBy(
        progressiveIncomeCents
      );
      for (const ce of classifiedEvents) {
        if (ce.treatment === "PROGRESSIVE" || ce.treatment === "PENDING_MANUAL_REVIEW") {
          ce.taxCents = proRateFactor
            .times(ce.event.grossAmountCents)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber();
        }
      }
    }

    // Flat-rate tax on aggregate (Decimal precision)
    const flat20TaxCents = NHR_FLAT_RATE.times(flat20IncomeCents)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    // Pro-rate flat-20 tax to individual events so sum(classifiedEvents.taxCents)
    // equals flat20TaxCents exactly (avoids per-event rounding divergence).
    if (flat20IncomeCents > 0) {
      const flat20ProRate = new Decimal(flat20TaxCents).dividedBy(flat20IncomeCents);
      for (const ce of classifiedEvents) {
        if (ce.treatment === "FLAT_20") {
          ce.taxCents = flat20ProRate
            .times(ce.event.grossAmountCents)
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
          ce.taxCents = bl35ProRate
            .times(ce.event.grossAmountCents)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber();
        }
      }
    }

    // Art. 72(10) CIRS (as amended by Lei n.º 2/2020) — 10% on PENSION_10PCT bucket.
    const pension10pctTaxCents = NHR_PENSION_10PCT_RATE.times(pension10pctIncomeCents)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();

    if (pension10pctIncomeCents > 0) {
      const pen10ProRate = new Decimal(pension10pctTaxCents).dividedBy(pension10pctIncomeCents);
      for (const ce of classifiedEvents) {
        if (ce.treatment === "PENSION_10PCT") {
          ce.taxCents = pen10ProRate
            .times(ce.event.grossAmountCents)
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toNumber();
        }
      }
    }

    const totalTaxCents = flat20TaxCents + progressiveResult.totalTaxCents + blacklist35TaxCents + pension10pctTaxCents;
    const totalGrossIncomeCents =
      flat20IncomeCents +
      dtaExemptIncomeCents +
      pensionExemptIncomeCents +
      pension10pctIncomeCents +
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
      flatRate: NHR_FLAT_RATE.toFixed(EIGHT_DP),
      solidarityTier1ThresholdCents: ProgressiveTaxCalculator.SOLIDARITY_TIER_1_THRESHOLD_CENTS,
      solidarityTier1Rate: ProgressiveTaxCalculator.SOLIDARITY_TIER_1_RATE,
      solidarityTier2ThresholdCents: ProgressiveTaxCalculator.SOLIDARITY_TIER_2_THRESHOLD_CENTS,
      solidarityTier2Rate: ProgressiveTaxCalculator.SOLIDARITY_TIER_2_RATE,
      blacklist35Rate: BLACKLIST_35_RATE.toFixed(EIGHT_DP),
      isInnovationActivity: profile.isInnovationActivity,
      legalRefs: METADATA_LEGAL_REFS,
    };

    return {
      regime: "NHR",
      taxYear,
      flat20IncomeCents,
      flat20TaxCents,
      dtaExemptIncomeCents,
      pensionExemptIncomeCents,
      pension10pctIncomeCents,
      pension10pctTaxCents,
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
   * Validates that the NHR regime is active for the given tax year.
   * Art. 16(9) CIRS: regime is valid for the year of first registration
   * and the 9 following years (10 years total).
   */
  private validateRegime(profile: EngineTaxProfile, taxYear: number): void {
    // Use string-slice parse to avoid UTC/timezone ambiguity with new Date() (L5 fix).
    const entryYear = parseInt(profile.regimeEntryDate.slice(0, 4), 10);
    const lastValidYear = entryYear + 9;

    if (taxYear < entryYear) {
      throw new RegimeNotActiveError("NHR", taxYear, profile.regimeEntryDate);
    }
    if (taxYear > lastValidYear) {
      const expiredDate = `${lastValidYear + 1}-01-01`;
      throw new RegimeExpiredError("NHR", taxYear, expiredDate);
    }
    if (
      profile.regimeExitDate !== null &&
      new Date(profile.regimeExitDate) < new Date(`${taxYear}-01-01`)
    ) {
      throw new RegimeExpiredError("NHR", taxYear, profile.regimeExitDate);
    }
  }
}
