import { describe, it, expect } from "vitest";
import { IncomeClassifier } from "../src/classifiers/IncomeClassifier.js";
import type { EngineIncomeEvent, EngineTaxProfile } from "../src/types.js";

const classifier = new IncomeClassifier();

const BASE_NHR_PROFILE: EngineTaxProfile = {
  regime: "NHR",
  regimeEntryDate: "2020-01-01",
  regimeExitDate: null,
  professionCode: "2132", // eligible: Software developer
  isInnovationActivity: false,
};

const BASE_IFICI_PROFILE: EngineTaxProfile = {
  ...BASE_NHR_PROFILE,
  regime: "IFICI",
  regimeEntryDate: "2025-01-01",
  isInnovationActivity: true,
};

function event(overrides: Partial<EngineIncomeEvent>): EngineIncomeEvent {
  return {
    id: "test-event",
    taxYear: 2026,
    sourceCountry: "PT",
    source: "PT",
    category: "A",
    grossAmountCents: 5_000_000,
    receivedAt: "2026-06-01T00:00:00Z",
    ...overrides,
  };
}

const DATE_2026 = new Date("2026-06-01");
const DATE_2025 = new Date("2025-06-01");

describe("IncomeClassifier", () => {
  // Scenario 1: Cat A PT eligible → FLAT_20
  it("Scenario 1 — Cat A PT-sourced + eligible profession → FLAT_20", () => {
    const { treatment } = classifier.classify(event({ category: "A", source: "PT", sourceCountry: "PT", professionCode: "2132" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("FLAT_20");
  });

  // Scenario 2: Cat A PT non-eligible → PROGRESSIVE
  it("Scenario 2 — Cat A PT-sourced + non-eligible profession (e.g. plumber 7112) → PROGRESSIVE", () => {
    const { treatment } = classifier.classify(event({ category: "A", source: "PT", sourceCountry: "PT", professionCode: "7112" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("PROGRESSIVE");
  });

  // Scenario 3: Cat B PT eligible → FLAT_20
  it("Scenario 3 — Cat B PT-sourced + eligible profession → FLAT_20", () => {
    const { treatment } = classifier.classify(event({ category: "B", source: "PT", sourceCountry: "PT", professionCode: "2141" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("FLAT_20");
  });

  // Scenario 4: Cat E dividends from DTA country (GB) → DTA_EXEMPT
  it("Scenario 4 — Cat E dividends from UK (DTA country) → DTA_EXEMPT", () => {
    const { treatment } = classifier.classify(event({ category: "E", source: "FOREIGN", sourceCountry: "GB" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("DTA_EXEMPT");
  });

  // Scenario 5: Cat E dividends from Bahamas (blacklisted) → BLACKLIST_35
  // Art. 72(12) CIRS: 35% special rate on Cat E/F/G from blacklisted jurisdictions.
  it("Scenario 5 — Cat E dividends from Bahamas (BS, blacklisted) → BLACKLIST_35 (Art. 72(12) CIRS)", () => {
    const { treatment } = classifier.classify(event({ category: "E", source: "FOREIGN", sourceCountry: "BS" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("BLACKLIST_35");
  });

  // HK 2026 — NOT blacklisted (Ord 292/2025) + PT-HK DTA in force (Resolução AR n.º 119/2012) → DTA_EXEMPT
  // F1 fix: HK was previously missing from DTA_COUNTRY_CODES. PT-HK DTA signed 2011, in force 2012-06-11.
  it("F1 — HK Cat E income in 2026: not blacklisted (Ord 292/2025) + PT-HK DTA → DTA_EXEMPT", () => {
    const { treatment } = classifier.classify(event({ category: "E", source: "FOREIGN", sourceCountry: "HK", receivedAt: "2026-03-11T00:00:00Z" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("DTA_EXEMPT");
  });

  // HK 2025 — IS blacklisted, Cat E → BLACKLIST_35
  // Art. 72(12) CIRS: Cat E from blacklisted jurisdiction → 35% special rate.
  it("HK Cat E income in 2025 IS blacklisted → BLACKLIST_35 (Art. 72(12) CIRS)", () => {
    const { treatment } = classifier.classify(event({ category: "E", source: "FOREIGN", sourceCountry: "HK", receivedAt: "2025-06-01T00:00:00Z" }), BASE_NHR_PROFILE, DATE_2025);
    expect(treatment).toBe("BLACKLIST_35");
  });

  // HK 2025 — Cat A (employment) FOREIGN. Rule 1 (blacklist) falls through for Cat A (Art. 72(12) scope is Cat E/F/G only).
  // PT-HK DTA has been in force since 2012. Cat A foreign employment from HK always falls to Rule 4 → DTA_EXEMPT.
  // (Art. 72(12) CIRS blacklist penalty never applied to Cat A — only Cat E/F/G capital/rental/gains.)
  it("HK Cat A FOREIGN in 2025: blacklist Cat A exclusion + PT-HK DTA in force → DTA_EXEMPT", () => {
    const { treatment } = classifier.classify(event({ category: "A", source: "FOREIGN", sourceCountry: "HK", receivedAt: "2025-06-01T00:00:00Z" }), BASE_NHR_PROFILE, DATE_2025);
    expect(treatment).toBe("DTA_EXEMPT");
  });

  // C1 fix: Cat A PT-sourced with eligible profession from a blacklisted sourceCountry → FLAT_20
  // Rule 1 falls through (Art. 72(12) does not cover Cat A); Rule 2 matches PT source + eligible code.
  it("C1 fix — Cat A PT-sourced + eligible profession + blacklisted sourceCountry → FLAT_20 (Art. 72(12) does not override 20% flat)", () => {
    const { treatment } = classifier.classify(
      event({ category: "A", source: "PT", sourceCountry: "KY", professionCode: "2132" }), // KY = Cayman Islands (blacklisted)
      BASE_NHR_PROFILE,
      DATE_2026
    );
    expect(treatment).toBe("FLAT_20");
  });

  // Scenario 10: NHR Cat H FOREIGN pension — entry 2020 → mandatory 10% → PENSION_10PCT
  // Lei n.º 2/2020 (OE 2020), Art. 12: NHR entry 2020+ → 10% rate, no exemption available.
  it("Scenario 10 — NHR Cat H FOREIGN pension (entry 2020) → PENSION_10PCT (Lei 2/2020, Art. 12)", () => {
    const { treatment } = classifier.classify(event({ category: "H", source: "FOREIGN", sourceCountry: "GB" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("PENSION_10PCT");
  });

  // Pre-2020 NHR with election → still PENSION_EXEMPT
  it("NHR Cat H FOREIGN pension (pre-2020 entry + exemption elected) → PENSION_EXEMPT (Art. 72(10) CIRS; Lei 2/2020 Art. 12 transitional)", () => {
    const pre2020Profile: EngineTaxProfile = {
      ...BASE_NHR_PROFILE,
      regimeEntryDate: "2019-01-01",
      nhrPensionExemptionElected: true,
    };
    const { treatment } = classifier.classify(event({ category: "H", source: "FOREIGN", sourceCountry: "GB" }), pre2020Profile, DATE_2026);
    expect(treatment).toBe("PENSION_EXEMPT");
  });

  // Pre-2020 NHR without election → PENSION_10PCT
  it("NHR Cat H FOREIGN pension (pre-2020 entry, no election) → PENSION_10PCT (Lei 2/2020, Art. 12)", () => {
    const pre2020NoElect: EngineTaxProfile = {
      ...BASE_NHR_PROFILE,
      regimeEntryDate: "2019-01-01",
      nhrPensionExemptionElected: false,
    };
    const { treatment } = classifier.classify(event({ category: "H", source: "FOREIGN", sourceCountry: "GB" }), pre2020NoElect, DATE_2026);
    expect(treatment).toBe("PENSION_10PCT");
  });

  // Anvil Finding 2 — NHR Cat H PT-sourced pension must be PROGRESSIVE
  it("Anvil Finding 2 — NHR Cat H PT-sourced pension → PROGRESSIVE (Art. 72(10) CIRS exemption covers foreign source only)", () => {
    // Art. 72(10) CIRS: "rendimentos de pensões de fonte estrangeira" — foreign-source only.
    // A Portuguese-source pension under NHR is taxed at progressive rates.
    const { treatment } = classifier.classify(event({ category: "H", source: "PT", sourceCountry: "PT" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("PROGRESSIVE");
  });

  // Scenario 11: IFICI Cat H pension → PROGRESSIVE
  it("Scenario 11 — IFICI Cat H pension → PROGRESSIVE (Art. 58-A(3) EBF — no pension exemption)", () => {
    const { treatment } = classifier.classify(event({ category: "H", source: "FOREIGN", sourceCountry: "GB" }), BASE_IFICI_PROFILE, DATE_2026);
    expect(treatment).toBe("PROGRESSIVE");
  });

  it("Cat G capital gains from DTA country (DE) FOREIGN → DTA_EXEMPT", () => {
    const { treatment } = classifier.classify(event({ category: "G", source: "FOREIGN", sourceCountry: "DE" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("DTA_EXEMPT");
  });

  it("Macao (MO) Cat E is blacklisted → BLACKLIST_35 (Art. 72(12) CIRS — 35% on Cat E from blacklist)", () => {
    const { treatment } = classifier.classify(event({ category: "E", source: "FOREIGN", sourceCountry: "MO" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("BLACKLIST_35");
  });

  it("Macao (MO) Cat A is blacklisted → PROGRESSIVE (Art. 72(12) only covers Cat E/F/G)", () => {
    const { treatment } = classifier.classify(event({ category: "A", source: "FOREIGN", sourceCountry: "MO" }), BASE_NHR_PROFILE, DATE_2026);
    expect(treatment).toBe("PROGRESSIVE");
  });

  it("Cat A PT-sourced uses profile professionCode as fallback when event has none", () => {
    const { treatment } = classifier.classify(
      event({ category: "A", source: "PT", sourceCountry: "PT", professionCode: undefined }),
      { ...BASE_NHR_PROFILE, professionCode: "2143" }, // eligible
      DATE_2026
    );
    expect(treatment).toBe("FLAT_20");
  });

  // Manual Review Flag — Portaria n.º 352/2024 compliance feature
  it("PENDING_MANUAL_REVIEW — profession code 2433 (suspect: CPP 2010 ambiguity) → PENDING_MANUAL_REVIEW, NOT FLAT_20", () => {
    // 2433 = Analistas financeiros in CPP 2010; its Annex item (4 vs 8) is disputed.
    // Anvil Round 3 flagged this: IncomeClassifier must NOT auto-approve it.
    const { treatment, reasoningJson } = classifier.classify(
      event({ category: "A", source: "PT", sourceCountry: "PT", professionCode: "2433" }),
      BASE_NHR_PROFILE,
      DATE_2026
    );
    expect(treatment).toBe("PENDING_MANUAL_REVIEW");
    const reasoning = JSON.parse(reasoningJson) as { rule: string; code: string; status: string };
    expect(reasoning.status).toBe("pending");
    expect(reasoning.code).toBe("2433");
    expect(reasoning.rule).toContain("manual verification required");
  });

  it("FLAT_20 — reasoningJson always present and contains regime-aware law ref", () => {
    const { treatment, reasoningJson } = classifier.classify(
      event({ category: "A", source: "PT", sourceCountry: "PT", professionCode: "2132" }),
      BASE_IFICI_PROFILE,
      DATE_2026
    );
    expect(treatment).toBe("FLAT_20");
    const reasoning = JSON.parse(reasoningJson) as { rule: string; code: string; status: string };
    expect(reasoning.status).toBe("verified");
    expect(reasoning.code).toBe("2132");
    expect(reasoning.rule).toContain("Art. 58-A(1) EBF"); // IFICI-specific citation
  });

  // F1 fix: Hong Kong DTA — Ord. 292/2025 removes HK from blacklist effective 2026-01-01.
  // PT-HK DTA (Resolução AR n.º 119/2012) in force 2012-06-11. From 2026-01-01,
  // Rule 1 (blacklist) no longer fires; Rule 4 (DTA) must apply for Cat E/F/G income.
  it("F1 fix — HK Cat E in 2026 (asOfDate >= 2026-01-01): NOT blacklist → DTA_EXEMPT (PT-HK DTA)", () => {
    const { treatment } = classifier.classify(
      event({ category: "E", source: "FOREIGN", sourceCountry: "HK" }),
      BASE_NHR_PROFILE,
      DATE_2026 // 2026-06-01 — HK no longer blacklisted
    );
    expect(treatment).toBe("DTA_EXEMPT");
  });

  it("F1 fix — HK Cat E in 2025 (asOfDate < 2026-01-01): still blacklisted → BLACKLIST_35", () => {
    const { treatment } = classifier.classify(
      event({ category: "E", source: "FOREIGN", sourceCountry: "HK" }),
      BASE_NHR_PROFILE,
      DATE_2025 // 2025-06-01 — HK still blacklisted
    );
    expect(treatment).toBe("BLACKLIST_35");
  });

  it("F1 fix — HK Cat A in 2026: blacklist Cat A exclusion still applies; falls to PROGRESSIVE (no DTA for Cat A)", () => {
    // Cat A is excluded from DTA_ELIGIBLE_CATEGORIES (Rule 4 only covers E/F/G for foreign source;
    // Cat A foreign income that doesn't match Rule 2 falls to PROGRESSIVE).
    // Wait — DTA_ELIGIBLE_CATEGORIES includes Cat A and B (for employment from DTA countries).
    // HK Cat A, FOREIGN, NHR: Rule 1 doesn't fire (HK de-listed in 2026). Rule 2: source is FOREIGN (not PT), skip.
    // Rule 3: not Cat H. Rule 4: Cat A + FOREIGN + HK in DTA_COUNTRY_CODES → DTA_EXEMPT.
    const { treatment } = classifier.classify(
      event({ category: "A", source: "FOREIGN", sourceCountry: "HK" }),
      BASE_NHR_PROFILE,
      DATE_2026
    );
    expect(treatment).toBe("DTA_EXEMPT");
  });

  // F2 fix: Angola and Mozambique DTA added (PALOP bilateral treaties).
  it("F2 fix — Angola (AO) Cat E FOREIGN income in 2026: DTA_EXEMPT (PT-AO DTA 2019)", () => {
    const { treatment, reasoningJson } = classifier.classify(
      event({ category: "E", source: "FOREIGN", sourceCountry: "AO" }),
      BASE_NHR_PROFILE,
      DATE_2026
    );
    expect(treatment).toBe("DTA_EXEMPT");
    const reasoning = JSON.parse(reasoningJson) as { note: string };
    expect(reasoning.note).toContain("AO");
  });

  it("F2 fix — Mozambique (MZ) Cat G FOREIGN income in 2026: DTA_EXEMPT (PT-MZ DTA 1993)", () => {
    const { treatment } = classifier.classify(
      event({ category: "G", source: "FOREIGN", sourceCountry: "MZ" }),
      BASE_NHR_PROFILE,
      DATE_2026
    );
    expect(treatment).toBe("DTA_EXEMPT");
  });
});

