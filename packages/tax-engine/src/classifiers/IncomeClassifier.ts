import { ELIGIBLE_PROFESSION_CODES, SUSPECT_PROFESSION_CODES } from "../data/eligibleProfessions.js";
import { DTA_COUNTRY_CODES } from "../data/dtaCountries.js";
import { BlacklistValidator } from "../validators/BlacklistValidator.js";
import type { EngineIncomeEvent, EngineTaxProfile, TaxTreatment } from "../types.js";

/** Shape of the machine-readable reasoning object embedded in each ClassifiedEvent. */
export interface ClassificationReasoning {
  rule: string;
  code?: string;
  status: "verified" | "pending" | "exempt" | "progressive" | "blacklist";
  note?: string;
}

/**
 * Income categories eligible for the DTA exemption method.
 * Art. 4(1)(b) Portaria n.º 352/2024 — Cat A/B/E/F/G from DTA-country, foreign-sourced.
 * Category H is intentionally excluded: NHR uses PENSION_EXEMPT; IFICI uses PROGRESSIVE.
 */
const DTA_ELIGIBLE_CATEGORIES: ReadonlySet<string> = new Set(["A", "B", "E", "F", "G"]);

/**
 * Capital and passive income categories subject to the Art. 72(12) CIRS 35% special rate
 * when sourced from actively blacklisted jurisdictions.
 * Cat E = rendimentos de capitais (dividends, interest, royalties as capital)
 * Cat F = rendimentos prediais (rental income)
 * Cat G = incrementos patrimoniais (capital gains)
 */
const BLACKLIST_CAPITAL_CATEGORIES: ReadonlySet<string> = new Set(["E", "F", "G"]);

/**
 * Classifies a single income event into a TaxTreatment bucket.
 *
 * Classification priority (top rule wins):
 *
 * 1. Blacklisted jurisdiction — Art. 72(12) CIRS; Portaria n.º 150/2004
 *       Cat E/F/G → BLACKLIST_35 (35% special rate on capital/rental/gains).
 *       Cat A/B/H → fall through (Art. 72(12) scope is Cat E/F/G only).
 *
 * 2. Cat A/B + PT + profession code check:
 *    a) Code in SUSPECT_PROFESSION_CODES → PENDING_MANUAL_REVIEW
 *       (conservative PROGRESSIVE tax applied until manual review resolves the flag)
 *    b) Code in ELIGIBLE_PROFESSION_CODES → FLAT_20
 *       Portaria n.º 352/2024, Art. 4(1)(a); Art. 72(10) CIRS.
 *    Both NHR and IFICI share this rule.
 *
 * 3. Cat H + NHR + FOREIGN-sourced → PENSION_EXEMPT or PENSION_10PCT
 *    Art. 72(10) CIRS + Lei n.º 2/2020 (OE 2020), Art. 12 transitional:
 *      - Pre-2020 NHR + nhrPensionExemptionElected === true → PENSION_EXEMPT (0%)
 *      - Pre-2020 NHR without election, OR 2020-2023 NHR   → PENSION_10PCT (10%)
 *    PT-sourced Cat H falls through to PROGRESSIVE. IFICI: no pension exemption.
 *
 * 4. Cat A/B/E/F/G + FOREIGN + DTA country → DTA_EXEMPT
 *    Portaria n.º 352/2024, Art. 4(1)(b) — exemption method.
 *
 * 5. All other → PROGRESSIVE
 *    Art. 68 CIRS general progressive brackets.
 */
export class IncomeClassifier {
  private readonly blacklistValidator = new BlacklistValidator();

  classify(
    event: EngineIncomeEvent,
    profile: EngineTaxProfile,
    asOfDate: Date
  ): { treatment: TaxTreatment; reasoningJson: string } {
    const country = event.sourceCountry.toUpperCase();

    // --- Rule 1: Blacklisted jurisdiction — Art. 72(12) CIRS ---
    // Art. 72(12) CIRS scope is "rendimentos de capitais, prediais e mais-valias":
    //   Cat E (capitais), Cat F (prediais), Cat G (mais-valias) → BLACKLIST_35 (35% special rate).
    //   Cat A/B/H: Art. 72(12) does NOT apply — fall through to Rules 2–5 for correct treatment.
    //   (Art. 72(10) CIRS FLAT_20 entitlement has no territorial exclusion for blacklisted payers.)
    // Portaria n.º 150/2004 (as amended by Ordinance 292/2025)
    if (this.blacklistValidator.isActivelyBlacklisted(country, asOfDate)) {
      if (BLACKLIST_CAPITAL_CATEGORIES.has(event.category)) {
        return {
          treatment: "BLACKLIST_35",
          reasoningJson: JSON.stringify({
            rule: "Art. 72(12) CIRS; Portaria n.º 150/2004 (as amended by Ordinance 292/2025)",
            status: "blacklist",
            note: `Cat ${event.category} income from blacklisted jurisdiction ${country} — 35% special rate`,
          } satisfies ClassificationReasoning),
        };
      }
      // Cat A/B/H: blacklist penalty inapplicable; continue to Rules 2–5.
    }

    // --- Rule 2: Cat A/B + PT + profession code check ---
    // Portaria n.º 352/2024, Art. 4(1)(a); Art. 72(10) CIRS
    if (
      (event.category === "A" || event.category === "B") &&
      event.source === "PT"
    ) {
      const code = event.professionCode ?? profile.professionCode;

      // No profession code — cannot be eligible for flat rate
      if (code === undefined) {
        return {
          treatment: "PROGRESSIVE" as const,
          reasoningJson: JSON.stringify({
            rule: "Art. 68 CIRS — no profession code provided",
            status: "progressive",
          } satisfies ClassificationReasoning),
        };
      }

      // 2a: Suspect code — PENDING_MANUAL_REVIEW (conservative: apply PROGRESSIVE until resolved)
      if (SUSPECT_PROFESSION_CODES.has(code)) {
        return {
          treatment: "PENDING_MANUAL_REVIEW",
          reasoningJson: JSON.stringify({
            rule: "Portaria n.º 352/2024, Annex — manual verification required",
            code,
            status: "pending",
            note:
              `CPP 2010 code ${code} is in the SUSPECT set: eligibility under Portaria n.º 352/2024 ` +
              "Annex is ambiguous. PROGRESSIVE rates applied conservatively. " +
              "Resolve via AT informação vinculativa before claiming FLAT_20.",
          } satisfies ClassificationReasoning),
        };
      }

      // 2b: Confirmed eligible — FLAT_20
      if (ELIGIBLE_PROFESSION_CODES.has(code)) {
        return {
          treatment: "FLAT_20",
          reasoningJson: JSON.stringify({
            rule:
              profile.regime === "IFICI"
                ? "Art. 58-A(1) EBF; Portaria n.º 352/2024, Art. 4(2)"
                : "Art. 72(10) CIRS; Portaria n.º 352/2024, Art. 4(1)(a)",
            code,
            status: "verified",
          } satisfies ClassificationReasoning),
        };
      }

      // PT Cat A/B with non-eligible, non-suspect profession → progressive
      return {
        treatment: "PROGRESSIVE",
        reasoningJson: JSON.stringify({
          rule: "Art. 68 CIRS — profession code not in Portaria n.º 352/2024 Annex",
          code,
          status: "progressive",
        } satisfies ClassificationReasoning),
      };
    }

    // --- Rule 3: Cat H + NHR + FOREIGN → PENSION_EXEMPT or PENSION_10PCT ---
    // Art. 72(10) CIRS — NHR Legacy pension treatment. "Rendimentos de pensões de
    // fonte estrangeira" (foreign-source only). PT-sourced Cat H → PROGRESSIVE (Rule 5).
    //
    // Lei n.º 2/2020 (OE 2020), Art. 12 transitional provision:
    //   Entry < 2020-01-01 + nhrPensionExemptionElected === true → PENSION_EXEMPT (0%)
    //   Entry < 2020-01-01 + election not made/false            → PENSION_10PCT  (10%)
    //   Entry 2020-01-01 onwards                                → PENSION_10PCT  (10%; mandatory)
    //
    // IFICI: Cat H is always PROGRESSIVE per Art. 58-A(3) EBF.
    if (event.category === "H" && event.source === "FOREIGN") {
      if (profile.regime === "NHR") {
        const entryYear = parseInt(profile.regimeEntryDate.slice(0, 4), 10);
        if (entryYear < 2020 && profile.nhrPensionExemptionElected === true) {
          return {
            treatment: "PENSION_EXEMPT",
            reasoningJson: JSON.stringify({
              rule: "Art. 72(10) CIRS; Lei n.º 2/2020 (OE 2020), Art. 12 — NHR pre-2020 exemption elected",
              status: "exempt",
            } satisfies ClassificationReasoning),
          };
        }
        return {
          treatment: "PENSION_10PCT",
          reasoningJson: JSON.stringify({
            rule: "Art. 72(10) CIRS as amended by Lei n.º 2/2020 (OE 2020) — NHR pension 10% special rate",
            status: "verified",
            note:
              entryYear < 2020
                ? "Pre-2020 NHR; exemption election not made — mandatory 10% rate"
                : "NHR entry 2020+; mandatory 10% rate (no exemption election possible)",
          } satisfies ClassificationReasoning),
        };
      }
      // IFICI: falls through to PROGRESSIVE (Rule 5)
    }

    // --- Rule 4: Foreign + DTA country → DTA_EXEMPT ---
    // Cat A/B/E/F/G from DTA country, foreign-sourced.
    // Portaria n.º 352/2024, Art. 4(1)(b) — exemption method.
    if (
      event.source === "FOREIGN" &&
      DTA_ELIGIBLE_CATEGORIES.has(event.category) &&
      DTA_COUNTRY_CODES.has(country)
    ) {
      return {
        treatment: "DTA_EXEMPT",
        reasoningJson: JSON.stringify({
          rule: "Portaria n.º 352/2024, Art. 4(1)(b) — DTA exemption method",
          status: "exempt",
          note: `DTA country: ${country}`,
        } satisfies ClassificationReasoning),
      };
    }

    // --- Rule 5: Default → PROGRESSIVE ---
    return {
      treatment: "PROGRESSIVE",
      reasoningJson: JSON.stringify({
        rule: "Art. 68 CIRS + Art. 68-A CIRS — general progressive brackets",
        status: "progressive",
      } satisfies ClassificationReasoning),
    };
  }
}
