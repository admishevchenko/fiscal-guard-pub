import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaxSummaryCard } from "@/components/dashboard/TaxSummaryCard";

// TaxSummaryCard is a pure presentational component — no mocks needed.

const BASE_PROPS = {
  flat20TaxCents: 10_000_00,     // €10,000
  dtaExemptCents: 20_000_00,     // €20,000
  progressiveTaxCents: 0,
  solidaritySurchargeCents: 0,
  totalTaxCents: 10_000_00,
  totalGrossIncomeCents: 50_000_00, // €50,000
  regime: "NHR" as const,
};

describe("TaxSummaryCard", () => {
  it("renders the total gross income in pt-PT currency format", () => {
    render(<TaxSummaryCard {...BASE_PROPS} />);
    // €50,000 — match currency amount regardless of locale separator style
    expect(screen.getByText(/50[\s\u00a0.]?000/)).toBeInTheDocument();
  });

  it("renders the 20% flat rate tax amount", () => {
    render(<TaxSummaryCard {...BASE_PROPS} />);
    // €10,000 flat tax — appears in multiple cards (also total tax), use getAllByText
    const matches = screen.getAllByText(/10[\s\u00a0.]?000/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows correct effective rate (20% for €10k tax on €50k gross)", () => {
    render(<TaxSummaryCard {...BASE_PROPS} />);
    // effective = 10000 / 50000 * 100 = 20.0%
    expect(screen.getByText(/effective rate: 20\.0%/i)).toBeInTheDocument();
  });

  it("shows 7.5% effective rate for Cat B Year-1 scenario", () => {
    // €140,000 gross, €10,500 tax (flat 20% on €52,500 taxable base)
    render(
      <TaxSummaryCard
        {...BASE_PROPS}
        totalGrossIncomeCents={14_000_000}
        flat20TaxCents={1_050_000}
        totalTaxCents={1_050_000}
      />
    );
    expect(screen.getByText(/effective rate: 7\.5%/i)).toBeInTheDocument();
  });

  it("shows 0.0% effective rate when gross income is zero (no division-by-zero)", () => {
    render(
      <TaxSummaryCard
        {...BASE_PROPS}
        totalGrossIncomeCents={0}
        flat20TaxCents={0}
        totalTaxCents={0}
      />
    );
    expect(screen.getByText(/effective rate: 0\.0%/i)).toBeInTheDocument();
  });

  it("renders the NHR regime badge", () => {
    render(<TaxSummaryCard {...BASE_PROPS} regime="NHR" />);
    expect(screen.getByText("NHR")).toBeInTheDocument();
  });

  it("renders the IFICI regime badge", () => {
    render(<TaxSummaryCard {...BASE_PROPS} regime="IFICI" />);
    expect(screen.getByText("IFICI")).toBeInTheDocument();
  });
});
