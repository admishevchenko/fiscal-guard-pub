/**
 * Blacklisted jurisdictions per Portaria n.º 150/2004, as amended.
 *
 * ⚠ Ordinance 292/2025 (effective 2026-01-01):
 *   HK (Hong Kong), LI (Liechtenstein), UY (Uruguay) REMOVED from blacklist.
 *   Their entries carry removedEffectiveDate = "2026-01-01".
 *
 * Query pattern for ACTIVE blacklisted jurisdictions as of a given date:
 *   removedEffectiveDate === null || new Date(removedEffectiveDate) > asOfDate
 *
 * Art. 72(12) CIRS — tax consequence for active blacklisted jurisdictions:
 *   Cat E / F / G (capital/rental/gains): 35% special rate ("BLACKLIST_35" treatment)
 *   Cat A / B / H (employment/self-employment/pensions): progressive rates (20% flat denied)
 *   Classification by category is performed by IncomeClassifier, not here.
 *
 * Engine-internal copy — mirrors the `blacklisted_jurisdictions` DB seed.
 */

export interface BlacklistEntry {
  countryCode: string;
  /**
   * ISO 8601 date when the removal becomes effective.
   * null = still actively blacklisted.
   */
  removedEffectiveDate: string | null;
}

export const BLACKLISTED_JURISDICTIONS: readonly BlacklistEntry[] = [
  // --- De-listed by Ordinance 292/2025, effective 2026-01-01 ---
  { countryCode: "HK", removedEffectiveDate: "2026-01-01" }, // Hong Kong
  { countryCode: "LI", removedEffectiveDate: "2026-01-01" }, // Liechtenstein
  { countryCode: "UY", removedEffectiveDate: "2026-01-01" }, // Uruguay

  // --- Still actively blacklisted (Portaria n.º 150/2004) ---
  { countryCode: "AD", removedEffectiveDate: null }, // Andorra
  { countryCode: "AG", removedEffectiveDate: null }, // Antigua and Barbuda
  { countryCode: "AI", removedEffectiveDate: null }, // Anguilla
  { countryCode: "AN", removedEffectiveDate: null }, // Netherlands Antilles
  { countryCode: "AW", removedEffectiveDate: null }, // Aruba
  { countryCode: "BB", removedEffectiveDate: null }, // Barbados
  { countryCode: "BH", removedEffectiveDate: null }, // Bahrain
  { countryCode: "BM", removedEffectiveDate: null }, // Bermuda
  { countryCode: "BS", removedEffectiveDate: null }, // Bahamas
  { countryCode: "BZ", removedEffectiveDate: null }, // Belize
  { countryCode: "CK", removedEffectiveDate: null }, // Cook Islands
  { countryCode: "CW", removedEffectiveDate: null }, // Curaçao
  { countryCode: "DM", removedEffectiveDate: null }, // Dominica
  { countryCode: "GD", removedEffectiveDate: null }, // Grenada
  { countryCode: "GI", removedEffectiveDate: null }, // Gibraltar
  { countryCode: "GG", removedEffectiveDate: null }, // Guernsey
  { countryCode: "IM", removedEffectiveDate: null }, // Isle of Man
  { countryCode: "JE", removedEffectiveDate: null }, // Jersey
  { countryCode: "JO", removedEffectiveDate: null }, // Jordan
  { countryCode: "KI", removedEffectiveDate: null }, // Kiribati
  { countryCode: "KN", removedEffectiveDate: null }, // Saint Kitts and Nevis
  { countryCode: "KY", removedEffectiveDate: null }, // Cayman Islands
  { countryCode: "LB", removedEffectiveDate: null }, // Lebanon
  { countryCode: "LC", removedEffectiveDate: null }, // Saint Lucia
  { countryCode: "LR", removedEffectiveDate: null }, // Liberia
  { countryCode: "MH", removedEffectiveDate: null }, // Marshall Islands
  { countryCode: "MO", removedEffectiveDate: null }, // Macao
  { countryCode: "MS", removedEffectiveDate: null }, // Montserrat
  { countryCode: "MU", removedEffectiveDate: null }, // Mauritius
  { countryCode: "MV", removedEffectiveDate: null }, // Maldives
  { countryCode: "NR", removedEffectiveDate: null }, // Nauru
  { countryCode: "NU", removedEffectiveDate: null }, // Niue
  { countryCode: "PA", removedEffectiveDate: null }, // Panama
  { countryCode: "PW", removedEffectiveDate: null }, // Palau
  { countryCode: "SA", removedEffectiveDate: null }, // Saudi Arabia
  { countryCode: "SB", removedEffectiveDate: null }, // Solomon Islands
  { countryCode: "SC", removedEffectiveDate: null }, // Seychelles
  { countryCode: "SX", removedEffectiveDate: null }, // Sint Maarten
  { countryCode: "TC", removedEffectiveDate: null }, // Turks and Caicos Islands
  { countryCode: "TO", removedEffectiveDate: null }, // Tonga
  { countryCode: "TV", removedEffectiveDate: null }, // Tuvalu
  { countryCode: "UM", removedEffectiveDate: null }, // US Minor Outlying Islands
  { countryCode: "VC", removedEffectiveDate: null }, // Saint Vincent
  { countryCode: "VG", removedEffectiveDate: null }, // British Virgin Islands
  { countryCode: "VI", removedEffectiveDate: null }, // US Virgin Islands
  { countryCode: "VU", removedEffectiveDate: null }, // Vanuatu
  { countryCode: "WS", removedEffectiveDate: null }, // Samoa
];

/** O(1) lookup map for engine use */
export const BLACKLIST_MAP: ReadonlyMap<string, BlacklistEntry> = new Map(
  BLACKLISTED_JURISDICTIONS.map((e) => [e.countryCode, e])
);
