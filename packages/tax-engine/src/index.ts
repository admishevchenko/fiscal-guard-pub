/**
 * @fiscal-guard/tax-engine
 *
 * Core tax calculation engine for Portugal NHR/IFICI regimes.
 * Legal basis: Portaria n.º 352/2024 + Ordinance 292/2025.
 *
 * Public API:
 *   - TaxEngine        — orchestrator class (NHR + IFICI dispatch)
 *   - NHRCalculator    — Art. 16 CIRS (NHR Legacy)
 *   - IFICICalculator  — Art. 58-A EBF (IFICI)
 *   - calculateIFICI   — convenience function for IFICI calculation
 *   - IncomeClassifier — per-event treatment classification
 *   - BlacklistValidator — Portaria 150/2004 + Ordinance 292/2025
 *   - ProgressiveTaxCalculator — 2026 OE brackets + solidarity surcharge
 */

export { TaxEngine } from "./TaxEngine.js";
export { NHRCalculator } from "./calculators/NHRCalculator.js";
export { IFICICalculator, calculateIFICI } from "./calculators/IFICICalculator.js";
export { ProgressiveTaxCalculator } from "./calculators/ProgressiveTaxCalculator.js";
export type { ProgressiveTaxResult } from "./calculators/ProgressiveTaxCalculator.js";
export { IncomeClassifier } from "./classifiers/IncomeClassifier.js";
export { BlacklistValidator } from "./validators/BlacklistValidator.js";

export type {
  EngineIncomeEvent,
  EngineTaxProfile,
  TaxTreatment,
  ClassifiedEvent,
  CalculationResult,
  CalculationMetadata,
} from "./types.js";
export { RegimeExpiredError, RegimeNotActiveError } from "./types.js";

// Reference data (read-only)
export { ELIGIBLE_PROFESSION_CODES, SUSPECT_PROFESSION_CODES } from "./data/eligibleProfessions.js";
export { DTA_COUNTRY_CODES } from "./data/dtaCountries.js";
export { BLACKLISTED_JURISDICTIONS, BLACKLIST_MAP } from "./data/blacklistedJurisdictions.js";
export type { BlacklistEntry } from "./data/blacklistedJurisdictions.js";
