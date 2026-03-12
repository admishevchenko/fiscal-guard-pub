import { describe, it, expect } from "vitest";
import { IFICICalculator, calculateIFICI } from "../src/calculators/IFICICalculator.js";
import { RegimeExpiredError } from "../src/types.js";
import type { EngineIncomeEvent, EngineTaxProfile } from "../src/types.js";

const calc = new IFICICalculator();

const IFICI_PROFILE: EngineTaxProfile = {
  regime: "IFICI",
  regimeEntryDate: "2025-01-01",
  regimeExitDate: null,
  professionCode: "2132", // Software developer — eligible
  isInnovationActivity: true,
};

function event(overrides: Partial<EngineIncomeEvent> = {}): EngineIncomeEvent {
  return {
    id: "e1",
    taxYear: 2026,
    sourceCountry: "PT",
    source: "PT",
    category: "A",
    grossAmountCents: 5_000_000,
    receivedAt: "2026-06-01T00:00:00Z",
    professionCode: "2132",
    ...overrides,
  };
}

describe("IFICICalculator — Art. 58-A EBF", () => {
  it("Cat A PT eligible → FLAT_20 at 20%, matches NHR flat-rate rule", () => {
    const r = calc.calculateIFICI(IFICI_PROFILE, [event()], 2026);
    expect(r.regime).toBe("IFICI");
    expect(r.flat20IncomeCents).toBe(5_000_000);
    expect(r.flat20TaxCents).toBe(1_000_000); // 5M × 20%
    expect(r.totalTaxCents).toBe(1_000_000);
  });

  // Scenario 11: IFICI Cat H pension → PROGRESSIVE (Art. 58-A(3) EBF — no exemption)
  it("Scenario 11 — IFICI Cat H pension: PROGRESSIVE (Art. 58-A(3) EBF — no pension exemption)", () => {
    const r = calc.calculateIFICI(
      IFICI_PROFILE,
      [event({ category: "H", source: "FOREIGN", sourceCountry: "GB", grossAmountCents: 5_000_000 })],
      2026
    );
    // Must NOT be in pension exempt bucket
    expect(r.pensionExemptIncomeCents).toBe(0);
    // Must be in progressive bucket
    expect(r.progressiveIncomeCents).toBe(5_000_000);
    expect(r.progressiveTaxCents).toBeGreaterThan(0);
    // Event treatment must be PROGRESSIVE
    expect(r.classifiedEvents[0]?.treatment).toBe("PROGRESSIVE");
  });

  it("Cat H pension from DTA country (GB): PROGRESSIVE under IFICI — DTA exemption does not rescue pensions from progressive table", () => {
    // Under IFICI, Cat H → PROGRESSIVE always (IncomeClassifier returns PENSION_EXEMPT
    // only for NHR; the IFICI calc overrides to PROGRESSIVE). Verify.
    const r = calc.calculateIFICI(
      IFICI_PROFILE,
      [event({ category: "H", source: "FOREIGN", sourceCountry: "GB", grossAmountCents: 2_000_000 })],
      2026
    );
    expect(r.pensionExemptIncomeCents).toBe(0);
    expect(r.progressiveIncomeCents).toBe(2_000_000);
  });

  it("Cat E foreign dividends from DTA country → DTA_EXEMPT", () => {
    const r = calc.calculateIFICI(
      IFICI_PROFILE,
      [event({ category: "E", source: "FOREIGN", sourceCountry: "US", grossAmountCents: 1_500_000 })],
      2026
    );
    expect(r.dtaExemptIncomeCents).toBe(1_500_000);
    expect(r.totalTaxCents).toBe(0);
  });

  it("Cat E dividends from Panama (PA, blacklisted) → BLACKLIST_35 (Art. 72(12) CIRS)", () => {
    // Art. 72(12) CIRS: Cat E/F/G income from Portaria 150/2004 listed jurisdictions
    // is subject to the 35% special rate, NOT progressive brackets.
    const r = calc.calculateIFICI(
      IFICI_PROFILE,
      [event({ category: "E", source: "FOREIGN", sourceCountry: "PA", grossAmountCents: 1_000_000 })],
      2026
    );
    expect(r.blacklist35IncomeCents).toBe(1_000_000);
    expect(r.progressiveIncomeCents).toBe(0);
    // 35% of €10,000 = €3,500 = 350,000 cents
    expect(r.blacklist35TaxCents).toBe(350_000);
    expect(r.totalTaxCents).toBe(350_000);
  });

  // High Earner Scenario: €300k+ progressive income with solidarity surcharge
  it("Scenario 16 (IFICI) — High Earner: €300k progressive income triggers both solidarity tiers", () => {
    const r = calc.calculateIFICI(
      IFICI_PROFILE,
      [event({
        id: "high-earner",
        category: "A",
        source: "PT",
        professionCode: "7112", // non-eligible → progressive
        grossAmountCents: 30_000_000, // €300,000
      })],
      2026
    );

    expect(r.progressiveIncomeCents).toBe(30_000_000);

    // Solidarity tier 1: (€250k - €80k) × 2.5% = €4,250 = 425,000 cents
    // Solidarity tier 2: (€300k - €250k) × 5% = €2,500 = 250,000 cents
    expect(r.solidaritySurchargeCents).toBe(675_000);

    // OE 2026 bracket calculation (see ProgressiveTaxCalculator.test.ts Scenario 16)
    expect(r.progressiveTaxCents).toBe(13_261_273);
    expect(r.totalTaxCents).toBe(13_936_273);
  });

  it("calculateIFICI convenience function produces identical result to class method", () => {
    const events = [event({ grossAmountCents: 8_000_000 })];
    const fromClass = calc.calculateIFICI(IFICI_PROFILE, events, 2026);
    const fromFn = calculateIFICI(IFICI_PROFILE, events, 2026);
    expect(fromFn.totalTaxCents).toBe(fromClass.totalTaxCents);
    expect(fromFn.effectiveRate).toBe(fromClass.effectiveRate);
    expect(fromFn.regime).toBe("IFICI");
  });

  // Scenario 13: 10-year regime expiry throws RegimeExpiredError
  it("Scenario 13 — Regime entered 2015 → expired for tax year 2026", () => {
    const expired: EngineTaxProfile = {
      ...IFICI_PROFILE,
      regimeEntryDate: "2015-01-01",
    };
    expect(() => calc.calculateIFICI(expired, [], 2026)).toThrow(RegimeExpiredError);
  });

  it("metadata.flatRate is '0.20000000'", () => {
    const r = calc.calculateIFICI(IFICI_PROFILE, [], 2026);
    expect(r.metadata.flatRate).toBe("0.20000000");
  });

  it("metadata.legalRefs explicitly mentions Art. 58-A EBF pension rule", () => {
    const r = calc.calculateIFICI(IFICI_PROFILE, [], 2026);
    const refs = r.metadata.legalRefs.join(" ");
    expect(refs).toMatch(/Art\. 58-A/);
    expect(refs).toMatch(/Cat H/);
  });

  it("metadata.isInnovationActivity reflects profile flag", () => {
    const r = calc.calculateIFICI(IFICI_PROFILE, [], 2026);
    expect(r.metadata.isInnovationActivity).toBe(true);
  });

  it("UY income in 2026 is NOT blacklisted → DTA does not apply (UY no DTA) → PROGRESSIVE but not via blacklist", () => {
    // UY has no DTA with Portugal and is de-listed from blacklist in 2026.
    // Income is PROGRESSIVE (not DTA_EXEMPT, not via blacklist rule).
    const r = calc.calculateIFICI(
      IFICI_PROFILE,
      [event({ category: "E", source: "FOREIGN", sourceCountry: "UY", receivedAt: "2026-03-11T00:00:00Z" })],
      2026
    );
    // Not in blacklisted bucket — verified by the fact that the treatment is
    // PROGRESSIVE due to "no applicable DTA", not blacklist override.
    expect(r.progressiveIncomeCents).toBe(5_000_000);
    // No punitive 35% — just standard progressive rates
    expect(r.solidaritySurchargeCents).toBe(0); // income below €80k threshold
  });
});
