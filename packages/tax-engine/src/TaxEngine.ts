import { NHRCalculator } from "./calculators/NHRCalculator.js";
import { IFICICalculator } from "./calculators/IFICICalculator.js";
import { IncomeClassifier } from "./classifiers/IncomeClassifier.js";
import type {
  EngineIncomeEvent,
  EngineTaxProfile,
  CalculationResult,
  ClassifiedEvent,
  TaxTreatment,
} from "./types.js";

/**
 * TaxEngine — Orchestrator for NHR and IFICI tax calculations.
 *
 * Dispatches to NHRCalculator (Art. 16 CIRS) or IFICICalculator (Art. 58-A EBF)
 * based on the user's active regime.
 *
 * Usage:
 *   const result = TaxEngine.fromProfile(profile).calculate(events, 2026);
 *   // or
 *   const engine = new TaxEngine(profile);
 *   const result = engine.calculate(events, 2026);
 *   const breakdown = engine.classifyAll(events, 2026);
 */
export class TaxEngine {
  private readonly nhrCalc = new NHRCalculator();
  private readonly ificiCalc = new IFICICalculator();
  private readonly classifier = new IncomeClassifier();

  constructor(private readonly profile: EngineTaxProfile) {}

  /**
   * Static factory — creates a TaxEngine bound to the given profile.
   */
  static fromProfile(profile: EngineTaxProfile): TaxEngine {
    return new TaxEngine(profile);
  }

  /**
   * Calculates the full tax liability for the given events and tax year.
   * Dispatches to NHR or IFICI based on profile.regime.
   *
   * @throws RegimeExpiredError    if the regime has expired for taxYear
   * @throws RegimeNotActiveError  if the regime had not yet started for taxYear
   */
  calculate(events: EngineIncomeEvent[], taxYear: number): CalculationResult {
    switch (this.profile.regime) {
      case "NHR":
        return this.nhrCalc.calculateNHR(this.profile, events, taxYear);
      case "IFICI":
        return this.ificiCalc.calculateIFICI(this.profile, events, taxYear);
      default: {
        const _exhaustive: never = this.profile.regime;
        throw new Error(`[fiscal-guard] Unknown regime: ${String(_exhaustive)}`);
      }
    }
  }

  /**
   * Classifies all income events without computing the full tax calculation.
   * Useful for UI display of per-event treatment before confirming a full run.
   *
   * Uses year-end as the blacklist reference date for the given taxYear.
   */
  classifyAll(
    events: EngineIncomeEvent[],
    taxYear: number
  ): Array<{ event: EngineIncomeEvent; treatment: TaxTreatment; lawRef: string; reasoningJson: string }> {
    return events.map((event) => {
      const asOfDate = new Date(event.receivedAt);
      const { treatment, reasoningJson } = this.classifier.classify(event, this.profile, asOfDate);

      const lawRef = TREATMENT_LAW_REFS[treatment](this.profile.regime);
      return { event, treatment, lawRef, reasoningJson };
    });
  }
}

const TREATMENT_LAW_REFS: Record<
  TaxTreatment,
  (regime: string) => string
> = {
  FLAT_20: () =>
    "Art. 72(10) CIRS / Art. 58-A(3) EBF; Portaria n.º 352/2024, Art. 4 — 20% flat rate",
  DTA_EXEMPT: () =>
    "Portaria n.º 352/2024, Art. 4(1)(b) — DTA exemption method",
  PENSION_EXEMPT: () =>
    "Art. 72(10) CIRS — NHR Cat H pension exemption (NHR Legacy pre-2020 with election)",
  PENSION_10PCT: () =>
    "Art. 72(10) CIRS as amended by Lei n.º 2/2020 (OE 2020) — NHR pension 10% special rate",
  PROGRESSIVE: (regime) =>
    regime === "IFICI"
      ? "Art. 68 CIRS + Art. 68-A CIRS solidarity surcharge (IFICI: Cat H also progressive per Art. 58-A EBF)"
      : "Art. 68 CIRS + Art. 68-A CIRS solidarity surcharge",
  BLACKLIST_35: () =>
    "Art. 72(12) CIRS — 35% special rate on Cat E/F/G from Portaria n.º 150/2004 blacklisted jurisdictions",
  PENDING_MANUAL_REVIEW: () =>
    "Portaria n.º 352/2024, Annex — profession code pending manual review; " +
    "PROGRESSIVE rates applied conservatively until compliance officer resolves flag",
};
