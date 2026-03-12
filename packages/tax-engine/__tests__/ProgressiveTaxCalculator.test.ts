import { describe, it, expect } from "vitest";
import { ProgressiveTaxCalculator } from "../src/calculators/ProgressiveTaxCalculator.js";

const calc = new ProgressiveTaxCalculator();

describe("ProgressiveTaxCalculator", () => {
  it("Zero income → zero tax, zero solidarity, effectiveRate = 0.00000000", () => {
    const r = calc.calculateProgressiveTax(0);
    expect(r.progressiveTaxCents).toBe(0);
    expect(r.solidaritySurchargeCents).toBe(0);
    expect(r.totalTaxCents).toBe(0);
    expect(r.effectiveRate).toBe("0.00000000");
  });

  // Bracket boundary accuracy — exactly €8,342 (834,200 cents) — top of bracket 1
  it("Bracket boundary: €8,342 (834,200 cents) is entirely in bracket 1 at 12.5% (OE 2026)", () => {
    const r = calc.calculateProgressiveTax(834_200);
    // 834,200 × 0.125 = 104,275.0 → 104,275
    expect(r.progressiveTaxCents).toBe(104_275);
    expect(r.solidaritySurchargeCents).toBe(0); // below solidarity threshold
    expect(r.totalTaxCents).toBe(104_275);
  });

  it("One cent above bracket 1 boundary — 834,201 cents: 1 extra cent taxed at bracket 2 rate 15.7%", () => {
    const r = calc.calculateProgressiveTax(834_201);
    // Bracket 1: 834,200 × 0.125 = 104,275.0
    // Bracket 2: 1 × 0.157 = 0.157 → rounds to 0
    // Total: 104,275
    expect(r.progressiveTaxCents).toBe(104_275);
  });

  it("Income exactly at solidarity tier 1 threshold (€80,000 = 8,000,000 cents) — no surcharge", () => {
    const r = calc.calculateProgressiveTax(8_000_000);
    expect(r.solidaritySurchargeCents).toBe(0);
  });

  it("Income 1 cent above solidarity tier 1 threshold — surcharge = 0 (rounds down)", () => {
    const r = calc.calculateProgressiveTax(8_000_001);
    // 1 cent × 0.025 = 0.025 → rounds to 0
    expect(r.solidaritySurchargeCents).toBe(0);
  });

  it("Solidarity tier 1 only — €100,000 (10,000,000 cents)", () => {
    const r = calc.calculateProgressiveTax(10_000_000);
    // Tier 1 surcharge: (10,000,000 - 8,000,000) × 0.025 = 2,000,000 × 0.025 = 50,000 cents
    expect(r.solidaritySurchargeCents).toBe(50_000);
  });

  it("Max tier 1 + zero tier 2 — exactly €250,000 (25,000,000 cents)", () => {
    const r = calc.calculateProgressiveTax(25_000_000);
    // Tier 1: (25,000,000 - 8,000,000) × 0.025 = 17,000,000 × 0.025 = 425,000
    // Tier 2: 0 (exactly at threshold, not above)
    expect(r.solidaritySurchargeCents).toBe(425_000);
  });

  // Scenario 16: High Earner — €300,000 (30,000,000 cents)
  // Verifies both solidarity tiers are computed correctly.
  it("Scenario 16 — High Earner €300,000: solidarity surcharge = €6,750 (tier1 + tier2)", () => {
    const r = calc.calculateProgressiveTax(30_000_000);

    // Solidarity tier 1: (€250,000 - €80,000) × 2.5% = €170,000 × 0.025 = €4,250
    //   = 17,000,000 × 0.025 = 425,000 cents
    // Solidarity tier 2: (€300,000 - €250,000) × 5% = €50,000 × 0.05 = €2,500
    //   = 5,000,000 × 0.05 = 250,000 cents
    // Total solidarity = 675,000 cents = €6,750
    expect(r.solidaritySurchargeCents).toBe(675_000);

    // OE 2026 progressive brackets for €300,000 (30,000,000 cents):
    // B1:   834,200 × 0.125       =   104,275.000
    // B2:   424,500 × 0.157       =    66,646.500
    // B3:   525,100 × 0.212       =   111,321.200
    // B4:   525,100 × 0.241       =   126,549.100
    // B5:   630,800 × 0.311       =   196,178.800
    // B6: 1,369,300 × 0.349       =   477,885.700
    // B7:   347,600 × 0.431       =   149,815.600  (Lei 73-A/2025: 43.1%)
    // B8: 4,006,800 × 0.446       = 1,787,032.800  (Lei 73-A/2025: 44.6%)
    // B9:21,336,600 × 0.48        =10,241,568.000
    // Sum = 13,261,272.700 → 13,261,273 cents
    expect(r.progressiveTaxCents).toBe(13_261_273);

    expect(r.totalTaxCents).toBe(13_936_273); // 13,261,273 + 675,000

    // Effective rate = 13,936,273 / 30,000,000 = 0.46454243
    expect(r.effectiveRate).toBe("0.46454243");
  });

  // Scenario 15: Decimal.js precision — no float rounding errors on OE 2026 rates
  it("Scenario 15 — Decimal.js precision: bracket 5 rate 31.1% avoids float error (OE 2026)", () => {
    // 0.311 in IEEE 754 double is not exactly representable.
    // Decimal.js with string input must produce exact result.
    // Income exactly at top of bracket 5: €29,397 = 2,939,700 cents.
    // 630,800 × 0.311 = 196,178.8 → rounds to 196,179.
    const r = calc.calculateProgressiveTax(2_939_700); // top of bracket 5
    // B1:   834,200 × 0.125 = 104,275.0
    // B2:   424,500 × 0.157 =  66,646.5
    // B3:   525,100 × 0.212 = 111,321.2
    // B4:   525,100 × 0.241 = 126,549.1
    // B5:   630,800 × 0.311 = 196,178.8
    // Sum = 604,970.6 → 604,971
    expect(r.progressiveTaxCents).toBe(604_971);
  });

  it("Solidarity tier 1 and 2 constants are correct per Art. 68-A CIRS", () => {
    expect(ProgressiveTaxCalculator.SOLIDARITY_TIER_1_THRESHOLD_CENTS).toBe(8_000_000);
    expect(ProgressiveTaxCalculator.SOLIDARITY_TIER_1_RATE).toBe("0.02500000");
    expect(ProgressiveTaxCalculator.SOLIDARITY_TIER_2_THRESHOLD_CENTS).toBe(25_000_000);
    expect(ProgressiveTaxCalculator.SOLIDARITY_TIER_2_RATE).toBe("0.05000000");
  });

  it("Throws RangeError for negative input", () => {
    expect(() => calc.calculateProgressiveTax(-1)).toThrow(RangeError);
  });
});
