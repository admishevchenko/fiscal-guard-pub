import { BLACKLIST_MAP } from "../data/blacklistedJurisdictions.js";

/**
 * Validates whether a jurisdiction is actively blacklisted as of a given date.
 *
 * Legal basis: Portaria n.º 150/2004 (and subsequent amendments).
 *
 * Ordinance 292/2025 — effective 2026-01-01:
 *   Removes HK (Hong Kong), LI (Liechtenstein), and UY (Uruguay).
 *   These three entries carry `removedEffectiveDate: "2026-01-01"`.
 *   On or after 2026-01-01 they are NOT blacklisted; before that date they ARE.
 *
 * Art. 72(12) CIRS — tax consequence for active blacklisted jurisdictions:
 *   - Cat E / F / G: 35% special rate ("taxa especial de 35%") via BLACKLIST_35 treatment
 *   - Cat A / B / H: progressive rates (flat 20% rate is denied)
 *   This classification is applied by {@link IncomeClassifier}, not this validator.
 *   This validator answers ONLY the binary "is this jurisdiction currently blacklisted?"
 *
 * Ordinance 292/2025 compliance confirmed:
 *   ✓ HK removed effective 2026-01-01 — `asOfDate < new Date("2026-01-01")` strict-less-than
 *   ✓ LI removed effective 2026-01-01 — same logic
 *   ✓ UY removed effective 2026-01-01 — same logic
 *   ✓ Income received on exactly 2026-01-01 returns `false` (not blacklisted)
 *   ✓ Income received on 2025-12-31 returns `true` (still blacklisted)
 *   ✓ All other Portaria 150/2004 jurisdictions remain active (`removedEffectiveDate: null`)
 */
export class BlacklistValidator {
  /**
   * Returns `true` if the given country code is on the active blacklist as of
   * the provided date; `false` if not listed or already de-listed.
   *
   * @param countryCode ISO 3166-1 alpha-2 code (case-insensitive)
   * @param asOfDate    Point-in-time reference — use the income receipt date,
   *                    not the tax filing date.
   */
  isActivelyBlacklisted(countryCode: string, asOfDate: Date): boolean {
    const entry = BLACKLIST_MAP.get(countryCode.toUpperCase());
    if (entry === undefined) return false;
    if (entry.removedEffectiveDate === null) return true;

    // Strict less-than: on the effective removal date the jurisdiction is
    // already de-listed. Ordinance 292/2025 removal is "as of" 2026-01-01.
    const removalDate = new Date(entry.removedEffectiveDate);
    return asOfDate < removalDate;
  }
}
