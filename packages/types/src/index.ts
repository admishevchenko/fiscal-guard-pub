/**
 * Shared TypeScript types for Fiscal Guard.
 * Legal basis: Portaria n.º 352/2024 (NHR/IFICI regimes)
 */

// ---------------------------------------------------------------------------
// Tax Regime
// ---------------------------------------------------------------------------

/**
 * NHR  – Non-Habitual Resident regime (pre-2024 applicants).
 *         Art. 16 CIRS, as amended by Lei n.º 24/2020.
 * IFICI – Incentivo Fiscal à Investigação Científica e Inovação
 *         (post-2024 applicants). Art. 58-A EBF, Portaria n.º 352/2024.
 */
export type TaxRegime = "NHR" | "IFICI";

// ---------------------------------------------------------------------------
// Income Types
// ---------------------------------------------------------------------------

/**
 * Portuguese income categories (categorias) per CIRS.
 * Category A – Dependent work income (Art. 2 CIRS)
 * Category B – Self-employment / business (Art. 3 CIRS)
 * Category E – Capital income (dividends, interest) (Art. 5 CIRS)
 * Category F – Property rental income (Art. 8 CIRS)
 * Category G – Capital gains (Art. 9 CIRS)
 * Category H – Pensions (Art. 11 CIRS)
 */
export type IncomeCategory = "A" | "B" | "E" | "F" | "G" | "H";

/**
 * Whether income originates in Portugal or abroad.
 * Determines exemption eligibility under DTA treaties.
 * Portaria n.º 352/2024, Art. 4.
 */
export type IncomeSource = "PT" | "FOREIGN";

// ---------------------------------------------------------------------------
// Income Event
// ---------------------------------------------------------------------------

/**
 * A single income event for a given tax year.
 * All monetary values are stored in **integer cents** (EUR).
 */
export interface IncomeEvent {
  id: string;
  userId: string;
  taxYear: number;
  /** ISO 3166-1 alpha-2 country code of the income source country */
  sourceCountry: string;
  source: IncomeSource;
  category: IncomeCategory;
  /** Gross income in EUR cents (integer, never float) */
  grossAmountCents: number;
  /** ISO 4217 currency code of original income (before EUR conversion) */
  originalCurrency: string;
  /** FX rate to EUR at time of receipt, stored as string to preserve precision */
  fxRateToEur: string;
  /** Description / payer reference */
  description?: string;
  /** ISO 8601 UTC date of receipt */
  receivedAt: string;
  /** CNAEF / Annex profession code, required for Cat A/B eligibility check */
  professionCode?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Mirrors auth.users — created automatically on signup.
 * nif lives here (user identity), not on TaxProfile (regime application).
 */
export interface Profile {
  id: string;
  userId: string;
  displayName: string | null;
  /** Portuguese NIF (Número de Identificação Fiscal), 9 digits. Nullable until set. */
  nif: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Tax Profile
// ---------------------------------------------------------------------------

/**
 * A user's NHR/IFICI regime profile.
 * Tracks the 10-year lock-in per Art. 16(9) CIRS / Art. 58-A(7) EBF.
 */
export interface TaxProfile {
  id: string;
  userId: string;
  regime: TaxRegime;
  /** ISO 8601 UTC date when the regime was granted */
  regimeEntryDate: string;
  /**
   * ISO 8601 UTC date when the regime ended (voluntary exit or 10-year expiry).
   * Null while the regime is active.
   */
  regimeExitDate: string | null;
  /** CNAEF profession code matching the Annex to Portaria n.º 352/2024 */
  professionCode: string;
  /** Whether the user is currently in an eligible innovation activity (IFICI only) */
  isInnovationActivity: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Tax Calculation
// ---------------------------------------------------------------------------

/**
 * Result of a tax computation for a given tax year.
 * All monetary values are integer cents.
 * Intermediate rate coefficients are stored as strings (Decimal.js serialisation).
 */
export interface Calculation {
  id: string;
  userId: string;
  taxProfileId: string;
  taxYear: number;
  /** Sum of all PT-sourced income subject to the 20% flat rate, in cents */
  ptTaxableIncomeCents: number;
  /** Sum of all foreign income exempt under DTA, in cents */
  foreignExemptIncomeCents: number;
  /** Sum of income from blacklisted jurisdictions at progressive rates, in cents */
  blacklistedJurisdictionIncomeCents: number;
  /** Tax due on PT income at 20% flat rate, in cents */
  flatRateTaxCents: number;
  /** Tax due on blacklisted jurisdiction income (progressive), in cents */
  progressiveTaxCents: number;
  /** Total tax liability, in cents */
  totalTaxCents: number;
  /** Effective rate as Decimal string (e.g. "0.18234567") */
  effectiveRate: string;
  /** Snapshot of the regime and rates used — JSON string */
  calculationMetadata: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export interface EligibleProfession {
  code: string;
  description: string;
  /** Portaria n.º 352/2024 Annex section reference */
  annexRef: string;
}

export interface DtaCountry {
  /** ISO 3166-1 alpha-2 */
  countryCode: string;
  countryName: string;
  /** DTA treaty reference */
  treatyRef: string;
}

/**
 * Jurisdiction on the Portuguese tax blacklist.
 * Source: Portaria n.º 150/2004, as amended by Ordinance 292/2025.
 * Note: HK, Liechtenstein, Uruguay removed effective Jan 2026.
 */
export interface BlacklistedJurisdiction {
  /** ISO 3166-1 alpha-2 */
  countryCode: string;
  countryName: string;
  /** Portaria reference that added this jurisdiction */
  addedByPortaria: string;
  /** Portaria reference that removed this jurisdiction, if applicable */
  removedByPortaria?: string;
  /** ISO 8601 date when removal became effective */
  removedEffectiveDate?: string;
}
