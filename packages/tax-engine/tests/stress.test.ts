/**
 * Stress test suite for TaxEngine — 50 complex fiscal profiles.
 *
 * Coverage targets:
 *   - NHR Legacy (Art. 16 CIRS) and IFICI 2.0 (Art. 58-A EBF) regimes
 *   - Progressive bracket stacking with solidarity surcharge (Art. 68-A CIRS):
 *       Tier 1: 2.5% on €80k–€250k; Tier 2: 5% above €250k
 *   - DTA-exempt foreign dividends/capital-gains (Portaria n.º 352/2024, Art. 4(1)(b))
 *   - FLAT_20 domestic eligible income vs non-eligible domestic income
 *   - NHR Cat H FOREIGN pension:
 *       Pre-2020 NHR with election → PENSION_EXEMPT (0%); Lei n.º 2/2020, Art. 12
 *       NHR entry 2020+ (mandatory) → PENSION_10PCT (10%); Art. 72(10) CIRS (amended)
 *       PT-sourced NHR pension → PROGRESSIVE
 *   - IFICI Cat H always PROGRESSIVE (Art. 58-A(3) EBF — no pension exemption)
 *   - Point-in-time blacklist: HK/LI/UY blacklisted before 2026-01-01, clear after
 *     (Ordinance 292/2025)
 *   - 10-year regime lock-in boundary (entry 2016 → valid through 2025 → expired 2026)
 *   - Decimal.js 8dp precision — no IEEE 754 float drift
 *   - Sum consistency: sum(classifiedEvents.taxCents by bucket) ≡ reported bucket totals
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { TaxEngine } from "../src/TaxEngine.js";
import { ProgressiveTaxCalculator } from "../src/calculators/ProgressiveTaxCalculator.js";
import { RegimeExpiredError, RegimeNotActiveError } from "../src/types.js";
import type { EngineIncomeEvent, EngineTaxProfile, CalculationResult } from "../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkProfile(overrides: Partial<EngineTaxProfile> = {}): EngineTaxProfile {
  return {
    regime: "IFICI",
    regimeEntryDate: "2025-01-01",
    regimeExitDate: null,
    professionCode: "2132", // Software developer — eligible
    isInnovationActivity: false,
    ...overrides,
  };
}

function mkEvent(overrides: Partial<EngineIncomeEvent> = {}): EngineIncomeEvent {
  return {
    id: "default",
    taxYear: 2026,
    sourceCountry: "PT",
    source: "PT",
    category: "A",
    grossAmountCents: 10_000_000,
    receivedAt: "2026-06-01T00:00:00Z",
    professionCode: "2132",
    ...overrides,
  };
}

/**
 * Invariant: sum of classifiedEvents taxCents per treatment must
 * equal the corresponding bucket total in the result.
 */
function assertBucketConsistency(r: CalculationResult): void {
  const sumFlat20 = r.classifiedEvents
    .filter((e) => e.treatment === "FLAT_20")
    .reduce((acc, e) => acc + e.taxCents, 0);
  // Allow ±1 cent per event for pro-rata rounding across the flat-20 bucket
  const flat20EventCount = r.classifiedEvents.filter((e) => e.treatment === "FLAT_20").length;
  expect(Math.abs(sumFlat20 - r.flat20TaxCents)).toBeLessThanOrEqual(flat20EventCount);

  const sumPension = r.classifiedEvents
    .filter((e) => e.treatment === "PENSION_EXEMPT")
    .reduce((acc, e) => acc + e.taxCents, 0);
  expect(sumPension).toBe(0);

  // PENSION_10PCT bucket (Art. 72(10) CIRS as amended by Lei 2/2020)
  const sumPen10Events = r.classifiedEvents
    .filter((e) => e.treatment === "PENSION_10PCT")
    .reduce((acc, e) => acc + e.taxCents, 0);
  const pen10EventCount = r.classifiedEvents.filter((e) => e.treatment === "PENSION_10PCT").length;
  expect(Math.abs(sumPen10Events - r.pension10pctTaxCents)).toBeLessThanOrEqual(pen10EventCount);

  const sumDta = r.classifiedEvents
    .filter((e) => e.treatment === "DTA_EXEMPT")
    .reduce((acc, e) => acc + e.taxCents, 0);
  expect(sumDta).toBe(0);

  // BLACKLIST_35 bucket validation (Art. 72(12) CIRS)
  const sumBl35Events = r.classifiedEvents
    .filter((e) => e.treatment === "BLACKLIST_35")
    .reduce((acc, e) => acc + e.taxCents, 0);
  const bl35EventCount = r.classifiedEvents.filter((e) => e.treatment === "BLACKLIST_35").length;
  expect(Math.abs(sumBl35Events - r.blacklist35TaxCents)).toBeLessThanOrEqual(bl35EventCount);

  // pendingManualReviewIncomeCents is a SUBSET of progressiveIncomeCents (not additive).
  // Validate it is bounded by progressiveIncomeCents.
  expect(r.pendingManualReviewIncomeCents).toBeLessThanOrEqual(r.progressiveIncomeCents);

  // Every ClassifiedEvent must carry a non-empty reasoningJson (audit trail requirement).
  for (const ce of r.classifiedEvents) {
    expect(ce.reasoningJson.length).toBeGreaterThan(0);
    const parsed = JSON.parse(ce.reasoningJson) as { rule?: string; status?: string };
    expect(typeof parsed.rule).toBe("string");
    expect(typeof parsed.status).toBe("string");
  }

  const totalIncome =
    r.flat20IncomeCents +
    r.dtaExemptIncomeCents +
    r.pensionExemptIncomeCents +
    r.pension10pctIncomeCents +
    r.progressiveIncomeCents +
    r.blacklist35IncomeCents;
  expect(totalIncome).toBe(r.totalGrossIncomeCents);
  expect(r.totalTaxCents).toBe(
    r.flat20TaxCents + r.progressiveTaxCents + r.solidaritySurchargeCents + r.blacklist35TaxCents + r.pension10pctTaxCents
  );
}

// ---------------------------------------------------------------------------
// Solidarity surcharge reference: standalone calculator for assertions
// ---------------------------------------------------------------------------
const progCalc = new ProgressiveTaxCalculator();

// ---------------------------------------------------------------------------
// Profile factory presets
// ---------------------------------------------------------------------------

const NHR_2020 = mkProfile({ regime: "NHR", regimeEntryDate: "2020-01-01" });
const NHR_2016 = mkProfile({ regime: "NHR", regimeEntryDate: "2016-01-01" }); // expires after 2025
/** Pre-2020 NHR holder who elected to maintain the old pension exemption (Lei 2/2020, Art. 12) */
const NHR_PRE2020_ELECTED = mkProfile({
  regime: "NHR",
  regimeEntryDate: "2019-01-01",
  nhrPensionExemptionElected: true,
});
const IFICI_2025 = mkProfile({ regime: "IFICI", regimeEntryDate: "2025-01-01" });
const IFICI_2024 = mkProfile({ regime: "IFICI", regimeEntryDate: "2024-01-01" });
const IFICI_INNOVATION = mkProfile({ regime: "IFICI", regimeEntryDate: "2025-01-01", isInnovationActivity: true });

// ---------------------------------------------------------------------------
// 50 stress scenarios
// ---------------------------------------------------------------------------

describe("TaxEngine stress tests — 50 complex profiles", () => {

  // ── SOLIDARITY SURCHARGE TIER VERIFICATION ─────────────────────────────

  it("S01 — IFICI: €400k progressive income triggers both solidarity tiers", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s01", category: "A", source: "PT", professionCode: "9999", grossAmountCents: 40_000_000 }), // non-eligible → progressive
    ], 2026);
    expect(r.progressiveIncomeCents).toBe(40_000_000);
    // Tier 1: (€250k - €80k) × 2.5% = €4,250 = 425,000 cents
    // Tier 2: (€400k - €250k) × 5% = €7,500 = 750,000 cents
    expect(r.solidaritySurchargeCents).toBe(1_175_000);
    expect(r.progressiveTaxCents).toBeGreaterThan(0);
    assertBucketConsistency(r);
  });

  it("S02 — NHR: €500k progressive income (non-eligible profession, PT) — full solidarity", () => {
    const engine = TaxEngine.fromProfile(NHR_2020);
    const r = engine.calculate([
      mkEvent({ id: "s02", source: "PT", professionCode: "7112", grossAmountCents: 50_000_000 }),
    ], 2026);
    expect(r.progressiveIncomeCents).toBe(50_000_000);
    // Tier 2: (€500k - €250k) × 5% = €12,500 = 1,250,000 cents
    // Tier 1: (€250k - €80k) × 2.5% = €4,250 = 425,000 cents
    expect(r.solidaritySurchargeCents).toBe(1_675_000);
    assertBucketConsistency(r);
  });

  it("S03 — Solidarity tier boundary: exactly €250k (25M cents) — no tier 2", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s03", source: "PT", professionCode: "9999", grossAmountCents: 25_000_000 }),
    ], 2026);
    // Tier 1: (€250k - €80k) × 2.5% = 425,000 cents
    // Tier 2: 0 (income = threshold, not above)
    expect(r.solidaritySurchargeCents).toBe(425_000);
    assertBucketConsistency(r);
  });

  it("S04 — Solidarity tier boundary: €250k + 1 cent — tier 2 fires on 1 cent", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s04", source: "PT", professionCode: "9999", grossAmountCents: 25_000_001 }),
    ], 2026);
    // Tier 2: 1 cent × 5% = 0.05 → rounds to 0 cents
    // Tier 1: 425,000 cents
    expect(r.solidaritySurchargeCents).toBe(425_000); // 0.05 rounds to 0
    assertBucketConsistency(r);
  });

  it("S05 — Solidarity tier 1 boundary: exactly €80k (8M cents) — no surcharge", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s05", source: "PT", professionCode: "9999", grossAmountCents: 8_000_000 }),
    ], 2026);
    expect(r.solidaritySurchargeCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S06 — Solidarity tier 1: €80k + 1 cent — surcharge on 1 cent at 2.5%", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s06", source: "PT", professionCode: "9999", grossAmountCents: 8_000_001 }),
    ], 2026);
    // 1 cent × 2.5% = 0.025 → rounds to 0
    expect(r.solidaritySurchargeCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S07 — Solidarity does NOT apply to FLAT_20 income (Art. 68-A applies to progressive bucket only)", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      // Eligible PT-sourced → FLAT_20; even €500k worth doesn't trigger solidarity
      mkEvent({ id: "s07", source: "PT", professionCode: "2132", grossAmountCents: 50_000_000 }),
    ], 2026);
    expect(r.flat20IncomeCents).toBe(50_000_000);
    expect(r.progressiveIncomeCents).toBe(0);
    expect(r.solidaritySurchargeCents).toBe(0); // no progressive income → no surcharge
    expect(r.flat20TaxCents).toBe(10_000_000); // 50M × 20%
    assertBucketConsistency(r);
  });

  // ── DTA EXEMPTION METHOD ────────────────────────────────────────────────

  it("S08 — IFICI: €600k foreign dividends from UK (DTA) → fully DTA_EXEMPT", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s08", category: "E", source: "FOREIGN", sourceCountry: "GB", grossAmountCents: 60_000_000 }),
    ], 2026);
    expect(r.dtaExemptIncomeCents).toBe(60_000_000);
    expect(r.totalTaxCents).toBe(0);
    expect(r.solidaritySurchargeCents).toBe(0); // DTA income not in progressive bucket
    assertBucketConsistency(r);
  });

  it("S09 — NHR: €400k foreign capital gains from DE (DTA) → DTA_EXEMPT, no solidarity", () => {
    const engine = TaxEngine.fromProfile(NHR_2020);
    const r = engine.calculate([
      mkEvent({ id: "s09", category: "G", source: "FOREIGN", sourceCountry: "DE", grossAmountCents: 40_000_000 }),
    ], 2026);
    expect(r.dtaExemptIncomeCents).toBe(40_000_000);
    expect(r.totalTaxCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S10 — Mixed: €300k DTA dividends (US) + €200k non-eligible PT income — solidarity on PT only", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s10a", category: "E", source: "FOREIGN", sourceCountry: "US", grossAmountCents: 30_000_000 }),
      mkEvent({ id: "s10b", source: "PT", professionCode: "9999", grossAmountCents: 20_000_000 }),
    ], 2026);
    expect(r.dtaExemptIncomeCents).toBe(30_000_000);
    expect(r.progressiveIncomeCents).toBe(20_000_000);
    // Tier 1: (€200k - €80k) × 2.5% = €3,000 = 300,000 cents
    expect(r.solidaritySurchargeCents).toBe(300_000);
    assertBucketConsistency(r);
  });

  it("S11 — Multiple DTA countries: FR dividends + JP interest + SG royalties → all DTA_EXEMPT", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s11a", category: "E", source: "FOREIGN", sourceCountry: "FR", grossAmountCents: 15_000_000 }),
      mkEvent({ id: "s11b", category: "E", source: "FOREIGN", sourceCountry: "JP", grossAmountCents: 10_000_000 }),
      mkEvent({ id: "s11c", category: "B", source: "FOREIGN", sourceCountry: "SG", grossAmountCents: 8_000_000 }),
    ], 2026);
    expect(r.dtaExemptIncomeCents).toBe(33_000_000);
    expect(r.totalTaxCents).toBe(0);
    assertBucketConsistency(r);
  });

  // ── BLACKLIST + ORDINANCE 292/2025 BOUNDARY ────────────────────────────

  it("S12 — HK Cat E income dated 2025-12-31: IS blacklisted → BLACKLIST_35 (Art. 72(12) CIRS, pre-Ordinance 292/2025)", () => {
    // HK was on the blacklist until 2026-01-01. Cat E on 2025-12-31 → 35% special rate.
    const engine = TaxEngine.fromProfile(NHR_2020);
    const r = engine.calculate([
      mkEvent({ id: "s12", category: "E", source: "FOREIGN", sourceCountry: "HK",
        receivedAt: "2025-12-31T23:59:59Z", grossAmountCents: 5_000_000 }),
    ], 2026);
    expect(r.blacklist35IncomeCents).toBe(5_000_000);
    expect(r.progressiveIncomeCents).toBe(0);
    // 35% of €50,000 = €17,500 = 1,750,000 cents
    expect(r.blacklist35TaxCents).toBe(1_750_000);
    expect(r.dtaExemptIncomeCents).toBe(0);
    assertBucketConsistency(r);
  });

  // S13 — F1 fix: HK income on 2026-01-01 — NOT blacklisted (Ordinance 292/2025) + PT-HK DTA in force
  // (Resolução AR n.º 119/2012, signed 2011, effective 2012-06-11) → DTA_EXEMPT.
  // Previously tested as PROGRESSIVE under the false assumption that HK had no DTA with Portugal.
  it("S13 — HK Cat E income 2026-01-01: NOT blacklisted (Ord 292/2025) + PT-HK DTA → DTA_EXEMPT", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s13", category: "E", source: "FOREIGN", sourceCountry: "HK",
        receivedAt: "2026-01-01T00:00:00Z", grossAmountCents: 5_000_000 }),
    ], 2026);
    // HK de-listed from blacklist AND has active PT-HK DTA → DTA_EXEMPT (0% rate)
    expect(r.dtaExemptIncomeCents).toBe(5_000_000);
    expect(r.progressiveIncomeCents).toBe(0);
    expect(r.blacklist35IncomeCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S14 — LI Cat E income dated 2025-06-15: IS blacklisted → BLACKLIST_35 (Art. 72(12) CIRS)", () => {
    // Liechtenstein de-listed 2026-01-01 by Ordinance 292/2025. Income in 2025 → still blacklisted.
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s14", category: "E", source: "FOREIGN", sourceCountry: "LI",
        receivedAt: "2025-06-15T00:00:00Z", grossAmountCents: 4_000_000 }),
    ], 2026);
    expect(r.blacklist35IncomeCents).toBe(4_000_000);
    expect(r.progressiveIncomeCents).toBe(0);
    // 35% of €40,000 = €14,000 = 1,400,000 cents
    expect(r.blacklist35TaxCents).toBe(1_400_000);
    assertBucketConsistency(r);
  });

  it("S15 — UY income dated 2026-03-11: NOT blacklisted → PROGRESSIVE (no PT-UY DTA)", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s15", category: "E", source: "FOREIGN", sourceCountry: "UY",
        receivedAt: "2026-03-11T00:00:00Z", grossAmountCents: 3_500_000 }),
    ], 2026);
    expect(r.progressiveIncomeCents).toBe(3_500_000);
    expect(r.dtaExemptIncomeCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S16 — Macao (MO) always blacklisted, Cat E → BLACKLIST_35 (Art. 72(12) CIRS)", () => {
    // Macao remains on Portaria 150/2004 blacklist (not removed by Ord 292/2025).
    // Cat E from blacklisted jurisdiction → 35% special rate, NOT progressive brackets.
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s16", category: "E", source: "FOREIGN", sourceCountry: "MO",
        receivedAt: "2026-06-01T00:00:00Z", grossAmountCents: 50_000_000 }),
    ], 2026);
    expect(r.blacklist35IncomeCents).toBe(50_000_000);
    expect(r.progressiveIncomeCents).toBe(0);
    // 35% of €500,000 = €175,000 = 17,500,000 cents
    expect(r.blacklist35TaxCents).toBe(17_500_000);
    assertBucketConsistency(r);
  });

  it("S17 — Panama (PA) blacklisted, Cat E €400k → BLACKLIST_35 at 35% (Art. 72(12) CIRS)", () => {
    // Art. 72(12) CIRS: 35% flat rate on Cat E from blacklisted jurisdictions.
    // Solidarity surcharge does NOT apply to BLACKLIST_35 bucket (progressive bucket only).
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s17", category: "E", source: "FOREIGN", sourceCountry: "PA", grossAmountCents: 40_000_000 }),
    ], 2026);
    expect(r.blacklist35IncomeCents).toBe(40_000_000);
    expect(r.progressiveIncomeCents).toBe(0);
    // 35% of €400,000 = €140,000 = 14,000,000 cents
    expect(r.blacklist35TaxCents).toBe(14_000_000);
    // Solidarity applies only to progressive bucket — 0 progressive income here
    expect(r.solidaritySurchargeCents).toBe(0);
    assertBucketConsistency(r);
  });

  // ── HIGH-VALUE PROFESSION CODES ─────────────────────────────────────────

  it("S18 — IFICI: code 1120 (CEO/Executive director) → FLAT_20", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s18", professionCode: "1120", grossAmountCents: 25_000_000 }),
    ], 2026);
    expect(r.flat20IncomeCents).toBe(25_000_000);
    expect(r.flat20TaxCents).toBe(5_000_000); // 25M × 20%
    expect(r.solidaritySurchargeCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S19 — IFICI: code 2211 (Médico generalista) → FLAT_20", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s19", professionCode: "2211", grossAmountCents: 20_000_000 }),
    ], 2026);
    expect(r.flat20IncomeCents).toBe(20_000_000);
    expect(r.flat20TaxCents).toBe(4_000_000);
    assertBucketConsistency(r);
  });

  it("S20 — IFICI: code 2310 (University professor) → FLAT_20", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s20", professionCode: "2310", grossAmountCents: 15_000_000 }),
    ], 2026);
    expect(r.flat20IncomeCents).toBe(15_000_000);
    expect(r.flat20TaxCents).toBe(3_000_000);
    assertBucketConsistency(r);
  });

  it("S21 — NHR: code 2421 (Advogado) → FLAT_20", () => {
    const engine = TaxEngine.fromProfile(NHR_2020);
    const r = engine.calculate([
      mkEvent({ id: "s21", professionCode: "2421", grossAmountCents: 30_000_000 }),
    ], 2026);
    expect(r.flat20IncomeCents).toBe(30_000_000);
    expect(r.flat20TaxCents).toBe(6_000_000);
    assertBucketConsistency(r);
  });

  it("S22 — Non-eligible code 5000 (waiter/service) → PROGRESSIVE, solidarity fires at €350k", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s22", professionCode: "5000", grossAmountCents: 35_000_000 }),
    ], 2026);
    expect(r.progressiveIncomeCents).toBe(35_000_000);
    // Tier 2: (€350k - €250k) × 5% = €5,000 = 500,000 cents
    // Tier 1: 425,000 cents
    expect(r.solidaritySurchargeCents).toBe(925_000);
    assertBucketConsistency(r);
  });

  it("S23 — Profile profession fallback: event has no code, profile has eligible 2143 → FLAT_20", () => {
    const engine = TaxEngine.fromProfile(mkProfile({ professionCode: "2143" }));
    const r = engine.calculate([
      mkEvent({ id: "s23", professionCode: undefined, grossAmountCents: 12_000_000 }),
    ], 2026);
    expect(r.flat20IncomeCents).toBe(12_000_000);
    assertBucketConsistency(r);
  });

  it("S24 — Profile profession fallback: event has no code, profile has non-eligible 9999 → PROGRESSIVE", () => {
    const engine = TaxEngine.fromProfile(mkProfile({ professionCode: "9999" }));
    const r = engine.calculate([
      mkEvent({ id: "s24", professionCode: undefined, grossAmountCents: 12_000_000 }),
    ], 2026);
    expect(r.progressiveIncomeCents).toBe(12_000_000);
    assertBucketConsistency(r);
  });

  // ── CAT H PENSION EDGE CASES ────────────────────────────────────────────

  it("S25 — NHR pre-2020 elected Cat H FOREIGN pension (GB, DTA): PENSION_EXEMPT — Art. 72(10) CIRS + Lei 2/2020 Art. 12", () => {
    const engine = TaxEngine.fromProfile(NHR_PRE2020_ELECTED);
    const r = engine.calculate([
      mkEvent({ id: "s25", category: "H", source: "FOREIGN", sourceCountry: "GB", grossAmountCents: 20_000_000 }),
    ], 2026);
    expect(r.pensionExemptIncomeCents).toBe(20_000_000);
    expect(r.totalTaxCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S26 — NHR pre-2020 elected Cat H FOREIGN pension (US): PENSION_EXEMPT — Rule 3 fires before Rule 4", () => {
    // Rule 3 fires before Rule 4 — pension exempt via NHR election, not DTA route
    const engine = TaxEngine.fromProfile(NHR_PRE2020_ELECTED);
    const r = engine.calculate([
      mkEvent({ id: "s26", category: "H", source: "FOREIGN", sourceCountry: "US", grossAmountCents: 15_000_000 }),
    ], 2026);
    expect(r.pensionExemptIncomeCents).toBe(15_000_000);
    expect(r.dtaExemptIncomeCents).toBe(0);
    expect(r.totalTaxCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S26b — NHR 2020 Cat H FOREIGN pension: PENSION_10PCT — mandatory 10% rate (Lei 2/2020, Art. 12)", () => {
    // NHR entry 2020-01-01: no election possible → mandatory 10% rate
    const engine = TaxEngine.fromProfile(NHR_2020);
    const r = engine.calculate([
      mkEvent({ id: "s26b", category: "H", source: "FOREIGN", sourceCountry: "GB", grossAmountCents: 20_000_000 }),
    ], 2026);
    expect(r.pension10pctIncomeCents).toBe(20_000_000);
    expect(r.pension10pctTaxCents).toBe(2_000_000); // 20M × 10%
    expect(r.pensionExemptIncomeCents).toBe(0);
    expect(r.totalTaxCents).toBe(2_000_000);
    expect(r.classifiedEvents[0]?.treatment).toBe("PENSION_10PCT");
    assertBucketConsistency(r);
  });

  it("S27 — NHR Cat H PT-sourced pension: PROGRESSIVE — not exempt (Art. 72(10) covers foreign-source only)", () => {
    const engine = TaxEngine.fromProfile(NHR_2020);
    const r = engine.calculate([
      mkEvent({ id: "s27", category: "H", source: "PT", sourceCountry: "PT", grossAmountCents: 10_000_000 }),
    ], 2026);
    expect(r.pensionExemptIncomeCents).toBe(0);
    expect(r.progressiveIncomeCents).toBe(10_000_000);
    expect(r.totalTaxCents).toBeGreaterThan(0);
    assertBucketConsistency(r);
  });

  it("S28 — IFICI Cat H FOREIGN pension: PROGRESSIVE (Art. 58-A(3) EBF — no exemption)", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s28", category: "H", source: "FOREIGN", sourceCountry: "GB", grossAmountCents: 40_000_000 }),
    ], 2026);
    expect(r.pensionExemptIncomeCents).toBe(0);
    expect(r.progressiveIncomeCents).toBe(40_000_000);
    // €400k → both solidarity tiers
    expect(r.solidaritySurchargeCents).toBe(1_175_000);
    assertBucketConsistency(r);
  });

  it("S29 — IFICI Cat H PT-sourced pension: PROGRESSIVE — same as foreign, no special treatment", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s29", category: "H", source: "PT", sourceCountry: "PT", grossAmountCents: 10_000_000 }),
    ], 2026);
    expect(r.pensionExemptIncomeCents).toBe(0);
    expect(r.progressiveIncomeCents).toBe(10_000_000);
    assertBucketConsistency(r);
  });

  it("S30 — NHR pre-2020 elected: €500k foreign pension → PENSION_EXEMPT — no solidarity triggered", () => {
    const engine = TaxEngine.fromProfile(NHR_PRE2020_ELECTED);
    const r = engine.calculate([
      mkEvent({ id: "s30", category: "H", source: "FOREIGN", sourceCountry: "DE", grossAmountCents: 50_000_000 }),
    ], 2026);
    expect(r.pensionExemptIncomeCents).toBe(50_000_000);
    expect(r.totalTaxCents).toBe(0);
    expect(r.solidaritySurchargeCents).toBe(0);
    assertBucketConsistency(r);
  });

  // ── 10-YEAR REGIME LOCK-IN BOUNDARY ────────────────────────────────────

  it("S31 — NHR entry 2016: last valid year 2025 → throws RegimeExpiredError for 2026", () => {
    const engine = TaxEngine.fromProfile(NHR_2016);
    expect(() => engine.calculate([mkEvent()], 2026)).toThrow(RegimeExpiredError);
  });

  it("S32 — NHR entry 2016: valid for 2025 (last year of 10-year lock)", () => {
    const engine = TaxEngine.fromProfile(NHR_2016);
    const r = engine.calculate([mkEvent({ taxYear: 2025, receivedAt: "2025-06-01T00:00:00Z" })], 2025);
    expect(r.taxYear).toBe(2025);
    expect(r.regime).toBe("NHR");
  });

  it("S33 — NHR entry 2017: valid for 2026 (year 10 of lock)", () => {
    const engine = TaxEngine.fromProfile(mkProfile({ regime: "NHR", regimeEntryDate: "2017-01-01" }));
    const r = engine.calculate([mkEvent()], 2026);
    expect(r.regime).toBe("NHR");
  });

  it("S34 — IFICI entry 2025: requesting 2024 throws RegimeNotActiveError", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    expect(() => engine.calculate([mkEvent({ taxYear: 2024 })], 2024)).toThrow(RegimeNotActiveError);
  });

  it("S35 — Explicit exit date: NHR exited 2023-12-31 → expired for 2026", () => {
    const engine = TaxEngine.fromProfile(mkProfile({
      regime: "NHR",
      regimeEntryDate: "2018-01-01",
      regimeExitDate: "2023-12-31",
    }));
    expect(() => engine.calculate([mkEvent()], 2026)).toThrow(RegimeExpiredError);
  });

  // ── COMPLEX MIXED-INCOME SCENARIOS ─────────────────────────────────────

  it("S36 — IFICI innovation: FLAT_20 + DTA dividends + progressive PT — three buckets", () => {
    const engine = TaxEngine.fromProfile(IFICI_INNOVATION);
    const r = engine.calculate([
      mkEvent({ id: "s36a", professionCode: "2132", grossAmountCents: 20_000_000 }),          // FLAT_20
      mkEvent({ id: "s36b", category: "E", source: "FOREIGN", sourceCountry: "US", grossAmountCents: 30_000_000 }), // DTA_EXEMPT
      mkEvent({ id: "s36c", professionCode: "9999", grossAmountCents: 10_000_000 }),           // PROGRESSIVE
    ], 2026);
    expect(r.flat20IncomeCents).toBe(20_000_000);
    expect(r.dtaExemptIncomeCents).toBe(30_000_000);
    expect(r.progressiveIncomeCents).toBe(10_000_000);
    expect(r.flat20TaxCents).toBe(4_000_000);
    expect(r.metadata.isInnovationActivity).toBe(true);
    assertBucketConsistency(r);
  });

  it("S37 — NHR pre-2020 elected: FLAT_20 + PENSION_EXEMPT + DTA + progressive — all four buckets", () => {
    const engine = TaxEngine.fromProfile(NHR_PRE2020_ELECTED);
    const r = engine.calculate([
      mkEvent({ id: "s37a", professionCode: "2111", grossAmountCents: 15_000_000 }),                                  // FLAT_20
      mkEvent({ id: "s37b", category: "H", source: "FOREIGN", sourceCountry: "FR", grossAmountCents: 8_000_000 }),  // PENSION_EXEMPT (pre-2020 elected)
      mkEvent({ id: "s37c", category: "E", source: "FOREIGN", sourceCountry: "CH", grossAmountCents: 12_000_000 }), // DTA_EXEMPT
      mkEvent({ id: "s37d", professionCode: "9999", grossAmountCents: 5_000_000 }),                                   // PROGRESSIVE
    ], 2026);
    expect(r.flat20IncomeCents).toBe(15_000_000);
    expect(r.pensionExemptIncomeCents).toBe(8_000_000);
    expect(r.dtaExemptIncomeCents).toBe(12_000_000);
    expect(r.progressiveIncomeCents).toBe(5_000_000);
    expect(r.totalGrossIncomeCents).toBe(40_000_000);
    assertBucketConsistency(r);
  });

  it("S38 — High earner IFICI: €1M split across eligible PT + DTA + progressive — effective rate < 20%", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s38a", professionCode: "2132", grossAmountCents: 40_000_000 }),            // FLAT_20
      mkEvent({ id: "s38b", category: "E", source: "FOREIGN", sourceCountry: "GB", grossAmountCents: 40_000_000 }), // DTA_EXEMPT
      mkEvent({ id: "s38c", professionCode: "9999", grossAmountCents: 20_000_000 }),            // PROGRESSIVE
    ], 2026);
    expect(r.totalGrossIncomeCents).toBe(100_000_000);
    expect(r.flat20TaxCents).toBe(8_000_000);        // 40M × 20%
    expect(r.dtaExemptIncomeCents).toBe(40_000_000);
    // Effective rate < 20% because DTA income is untaxed
    const effectiveRate = new Decimal(r.effectiveRate);
    expect(effectiveRate.lessThan(new Decimal("0.20"))).toBe(true);
    assertBucketConsistency(r);
  });

  it("S39 — NHR: five eligible Cat B PT events summing €500k → FLAT_20 sum consistent", () => {
    const engine = TaxEngine.fromProfile(NHR_2020);
    const events = [10, 8, 12, 15, 5].map((m, i) =>
      mkEvent({ id: `s39-${i}`, category: "B", professionCode: "2431", grossAmountCents: m * 1_000_000 })
    );
    const r = engine.calculate(events, 2026);
    expect(r.flat20IncomeCents).toBe(50_000_000);
    expect(r.flat20TaxCents).toBe(10_000_000);
    expect(r.solidaritySurchargeCents).toBe(0);
    assertBucketConsistency(r);
  });

  it("S40 — IFICI: three progressive events summing €350k → solidarity = 925,000 cents", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const events = [15, 10, 10].map((m, i) =>
      mkEvent({ id: `s40-${i}`, professionCode: "9999", grossAmountCents: m * 1_000_000 })
    );
    const r = engine.calculate(events, 2026);
    expect(r.progressiveIncomeCents).toBe(35_000_000);
    expect(r.solidaritySurchargeCents).toBe(925_000);
    assertBucketConsistency(r);
  });

  // ── DECIMAL.JS PRECISION ────────────────────────────────────────────────

  it("S41 — Decimal.js precision: bracket 5 rate 0.311 — no IEEE 754 drift (OE 2026)", () => {
    // 0.311 is not exactly representable in IEEE 754 double precision.
    // Decimal.js with string literals must produce the exact result.
    // Old bracket 5 rate was 0.328 (also not representable); OE 2026 uses 0.311.
    // Income at bracket 5 midpoint: midpoint of €23,089–€29,397 ≈ €26,243 = 2,624,300 cents
    const raw = progCalc.calculateProgressiveTax(2_624_300);
    // Effective rate on total income is a blend starting from 12.5%, below the bracket 5 marginal 31.1%
    const effectiveOnTotal = new Decimal(raw.progressiveTaxCents).dividedBy(2_624_300);
    expect(effectiveOnTotal.lessThan(new Decimal("0.312"))).toBe(true);
    // And above the first bracket rate (12.5%) — confirms brackets are stacking correctly
    expect(effectiveOnTotal.greaterThan(new Decimal("0.125"))).toBe(true);
    // The marginal rate in bracket 5 must be exactly 0.311 — verify via marginal diff
    // Bracket 4 top = 2,308,900 cents; the increment falls entirely in bracket 5
    const atBracket4Top = progCalc.calculateProgressiveTax(2_308_900);
    const marginalTaxCents = raw.progressiveTaxCents - atBracket4Top.progressiveTaxCents;
    const marginalIncomeCents = 2_624_300 - 2_308_900; // 315,400 cents
    // 315,400 × 0.311 = 98,089.4 → ROUND_HALF_UP → 98,089
    const expectedMarginal = new Decimal(315_400).times(new Decimal("0.31100000"))
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(marginalTaxCents).toBe(expectedMarginal);
  });

  it("S42 — Decimal.js: effectiveRate is always exactly 8 decimal places", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s42", grossAmountCents: 33_333_333 }),
    ], 2026);
    // Must be exactly 8dp string
    expect(r.effectiveRate).toMatch(/^\d+\.\d{8}$/);
  });

  it("S43 — Zero income → effectiveRate is '0.00000000'", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([], 2026);
    expect(r.effectiveRate).toBe("0.00000000");
    expect(r.totalTaxCents).toBe(0);
  });

  it("S44 — Single cent income: €0.01 (1 cent) → progressive tax = 0, no float error", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s44", professionCode: "9999", grossAmountCents: 1 }),
    ], 2026);
    expect(r.progressiveIncomeCents).toBe(1);
    expect(r.progressiveTaxCents).toBe(0); // 1 × 0.13 = 0.13 → rounds to 0
    assertBucketConsistency(r);
  });

  // ── EFFECTIVE RATE SANITY BOUNDS ────────────────────────────────────────

  it("S45 — IFICI eligible €500k: effective rate exactly 20% (no progressive component)", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s45", professionCode: "2132", grossAmountCents: 50_000_000 }),
    ], 2026);
    expect(r.effectiveRate).toBe("0.20000000");
    assertBucketConsistency(r);
  });

  it("S46 — IFICI €300k progressive: effective rate below 48% (top bracket) + solidarity", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s46", professionCode: "9999", grossAmountCents: 30_000_000 }),
    ], 2026);
    // Must be below 48% + 5% = 53% (solidarity never exceeds 5% of total)
    expect(new Decimal(r.effectiveRate).lessThan(new Decimal("0.53"))).toBe(true);
    // Must exceed the lowest bracket (13%)
    expect(new Decimal(r.effectiveRate).greaterThan(new Decimal("0.13"))).toBe(true);
    assertBucketConsistency(r);
  });

  it("S47 — NHR: DTA-only income → effective rate 0%", () => {
    const engine = TaxEngine.fromProfile(NHR_2020);
    const r = engine.calculate([
      mkEvent({ id: "s47", category: "E", source: "FOREIGN", sourceCountry: "NL", grossAmountCents: 100_000_000 }),
    ], 2026);
    expect(r.effectiveRate).toBe("0.00000000");
    expect(r.totalTaxCents).toBe(0);
  });

  it("S48 — NHR pre-2020 elected vs IFICI: same pension income — NHR exempt (0%), IFICI progressive (costlier)", () => {
    // Lei n.º 2/2020 Art. 12: pre-2020 NHR with election → PENSION_EXEMPT (0%)
    // Art. 58-A(3) EBF: IFICI has no pension exemption → PROGRESSIVE
    const pension = [mkEvent({ id: "pen", category: "H", source: "FOREIGN", sourceCountry: "GB", grossAmountCents: 30_000_000 })];
    const nhrResult = TaxEngine.fromProfile(NHR_PRE2020_ELECTED).calculate(pension, 2026);
    const ificiResult = TaxEngine.fromProfile(IFICI_2025).calculate(pension, 2026);
    // NHR pre-2020 elected: pension exempt → 0 tax
    expect(nhrResult.totalTaxCents).toBe(0);
    // IFICI: pension progressive → nonzero tax
    expect(ificiResult.totalTaxCents).toBeGreaterThan(0);
    expect(ificiResult.solidaritySurchargeCents).toBeGreaterThan(0);
  });

  it("S49 — classifyAll() returns correct treatment for each event without computing full tax", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const events = [
      mkEvent({ id: "c1", professionCode: "2132", grossAmountCents: 10_000_000 }),           // FLAT_20
      mkEvent({ id: "c2", category: "E", source: "FOREIGN", sourceCountry: "US", grossAmountCents: 10_000_000 }), // DTA_EXEMPT
      mkEvent({ id: "c3", professionCode: "9999", grossAmountCents: 10_000_000 }),            // PROGRESSIVE
    ];
    const classified = engine.classifyAll(events, 2026);
    expect(classified[0]?.treatment).toBe("FLAT_20");
    expect(classified[1]?.treatment).toBe("DTA_EXEMPT");
    expect(classified[2]?.treatment).toBe("PROGRESSIVE");
    // Each entry must have a lawRef and reasoningJson string
    classified.forEach((c) => {
      expect(c.lawRef).toBeTruthy();
      expect(c.reasoningJson.length).toBeGreaterThan(0);
    });
  });

  it("S50 — Extreme high earner: €2M progressive income — all bracket and solidarity assertions", () => {
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s50", professionCode: "9999", grossAmountCents: 200_000_000 }), // €2M
    ], 2026);
    expect(r.progressiveIncomeCents).toBe(200_000_000);
    // Solidarity (Art. 68-A CIRS):
    //   Tier 1: (€250k - €80k) × 2.5% = €170k × 2.5% = €4,250 = 425,000 cents
    //   Tier 2: (€2M  - €250k) × 5.0% = €1,750k × 5% = €87,500 = 8,750,000 cents
    //   Total  = 9,175,000 cents
    expect(r.solidaritySurchargeCents).toBe(9_175_000);
    // Progressive tax must be > 0 and effective rate < 0.55 (bracket 8 is 48% + solidarity)
    expect(r.progressiveTaxCents).toBeGreaterThan(0);
    expect(new Decimal(r.effectiveRate).lessThan(new Decimal("0.55"))).toBe(true);
    assertBucketConsistency(r);
  });

  // --- Manual Review Flag tests ---

  it("S51 — PENDING_MANUAL_REVIEW: NHR Cat A/PT code 2433 (suspect) → conservative PROGRESSIVE tax; pendingManualReviewIncomeCents populated; reasoningJson status=pending", () => {
    // Portaria n.º 352/2024, Annex — code 2433 is in SUSPECT_PROFESSION_CODES (CPP 2010 ambiguity).
    // Engine must NOT grant FLAT_20; must apply PROGRESSIVE conservatively and warn the user.
    const engine = TaxEngine.fromProfile(NHR_2020);
    const r = engine.calculate([
      mkEvent({ id: "s51a", professionCode: "2433", grossAmountCents: 15_000_000 }),        // suspect → PENDING
      mkEvent({ id: "s51b", professionCode: "2132", grossAmountCents: 10_000_000 }),        // eligible → FLAT_20
    ], 2026);

    // Suspect income goes into PROGRESSIVE (conservative), NOT flat20
    expect(r.flat20IncomeCents).toBe(10_000_000);
    expect(r.pendingManualReviewIncomeCents).toBe(15_000_000);
    // pendingManualReview is a subset of progressive
    expect(r.progressiveIncomeCents).toBe(15_000_000);
    // No FLAT_20 for the suspect event
    const pendingEvent = r.classifiedEvents.find((e) => e.event.id === "s51a");
    expect(pendingEvent?.treatment).toBe("PENDING_MANUAL_REVIEW");
    // reasoningJson must carry status=pending and code=2433
    const reasoning = JSON.parse(pendingEvent?.reasoningJson ?? "{}") as { status: string; code: string };
    expect(reasoning.status).toBe("pending");
    expect(reasoning.code).toBe("2433");
    assertBucketConsistency(r);
  });

  it("S52 — PENDING_MANUAL_REVIEW: IFICI Cat A/PT code 2433 + high income → progressive tax, pendingManualReview field set; no FLAT_20 claimed", () => {
    // IFICI regime; same SUSPECT check applies regardless of regime — no FLAT_20 for 2433.
    const engine = TaxEngine.fromProfile(IFICI_2025);
    const r = engine.calculate([
      mkEvent({ id: "s52", professionCode: "2433", grossAmountCents: 50_000_000 }), // €500k suspect
    ], 2026);

    expect(r.flat20IncomeCents).toBe(0);
    expect(r.pendingManualReviewIncomeCents).toBe(50_000_000);
    expect(r.progressiveIncomeCents).toBe(50_000_000);
    expect(r.progressiveTaxCents).toBeGreaterThan(0);
    expect(r.solidaritySurchargeCents).toBeGreaterThan(0);
    // Effective rate must be HIGHER than 20% (progressive > flat)
    expect(new Decimal(r.effectiveRate).greaterThan(new Decimal("0.20"))).toBe(true);
    assertBucketConsistency(r);
  });
});
