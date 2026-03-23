import { calculateTaxAction } from "@/actions/tax";
import { getTaxProfile, getIncomeEventsForYear } from "@/actions/profile";
import { ELIGIBLE_PROFESSION_CODES, SUSPECT_PROFESSION_CODES } from "@fiscal-guard/tax-engine";
import { TaxSummaryCard } from "@/components/dashboard/TaxSummaryCard";
import { RegimeComparisonChart } from "@/components/dashboard/RegimeComparisonChart";
import { IncomeBreakdownChart } from "@/components/dashboard/IncomeBreakdownChart";
import { IncomeEventsPanel } from "@/components/dashboard/IncomeEventsPanel";
import type { IncomeEventRow } from "@/components/dashboard/IncomeEventsPanel";
import { TaxYearSelector } from "@/components/dashboard/TaxYearSelector";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import type { CalculationResult } from "@fiscal-guard/tax-engine";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const currentYear = new Date().getFullYear();
  const requestedYear = typeof params["year"] === "string" ? parseInt(params["year"], 10) : NaN;
  const taxYear =
    !isNaN(requestedYear) && requestedYear >= 2024 && requestedYear <= 2030
      ? requestedYear
      : currentYear >= 2024
        ? Math.min(currentYear, 2030)
        : 2024;

  // Fetch profession code for eligibility banner
  const taxProfile = await getTaxProfile();
  const professionCode = taxProfile?.profession_code ?? "";
  const codeIsEligible = ELIGIBLE_PROFESSION_CODES.has(professionCode);
  const codeIsSuspect = SUSPECT_PROFESSION_CODES.has(professionCode);
  const codeIsUnknown = professionCode.length === 4 && !codeIsEligible && !codeIsSuspect;

  // Fetch income events independently so they display even when calculation
  // throws (e.g. RegimeNotActiveError for years before the regime entry date).
  const rawEvents = await getIncomeEventsForYear(taxYear);

  let calculation: CalculationResult | null = null;
  let calcErrorName: string | null = null;
  let calcErrorMessage: string | null = null;
  try {
    calculation = await calculateTaxAction(taxYear);
  } catch (err) {
    if (err instanceof Error) {
      calcErrorName = err.name;
      calcErrorMessage = err.message;
    }
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tax year {taxYear} · Regime: {taxProfile?.regime ?? "—"} · Code:{" "}
            <span className={codeIsEligible ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
              {professionCode || "not set"}
            </span>
          </p>
        </div>
        <TaxYearSelector currentYear={taxYear} />
      </div>

      {/* Profession code eligibility banner */}
      {codeIsUnknown && (
        <Card className="border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
          <CardContent className="pt-4 text-sm text-red-800 dark:text-red-300 flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">
                ❌ Profession code <code className="font-mono">{professionCode}</code> is not on the Portaria n.º 352/2024 eligible list
              </p>
              <p className="mt-1">
                Your Portuguese-source income (Category A/B) is being taxed at{" "}
                <strong>progressive rates (12.5–48%)</strong> instead of the{" "}
                <strong>20% NHR/IFICI flat rate</strong>. Update your profession code
                to a valid CPP 2010 code (e.g. <code className="font-mono">2131</code> for IT/software).
              </p>
            </div>
            <Link href="/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Fix profession code →
            </Link>
          </CardContent>
        </Card>
      )}

      <Separator />

      {calculation ? (
        <>
          {/* Tax summary metrics */}
          <TaxSummaryCard
            flat20TaxCents={calculation.flat20TaxCents}
            dtaExemptCents={calculation.dtaExemptIncomeCents}
            progressiveTaxCents={calculation.progressiveTaxCents}
            solidaritySurchargeCents={calculation.solidaritySurchargeCents}
            totalTaxCents={calculation.totalTaxCents}
            totalGrossIncomeCents={calculation.totalGrossIncomeCents}
            regime={calculation.regime}
          />

          {/* Pending manual review warning */}
          {calculation.pendingManualReviewIncomeCents > 0 && (
            <Card className="border-amber-400 bg-amber-50">
              <CardContent className="pt-4 text-sm text-amber-800">
                ⚠️{" "}
                <strong>
                  {new Intl.NumberFormat("pt-PT", {
                    style: "currency",
                    currency: "EUR",
                  }).format(
                    calculation.pendingManualReviewIncomeCents / 100
                  )}{" "}
                </strong>
                of income is pending manual review of your profession code
                against Portaria n.º 352/2024 Annex. Conservative progressive
                rates have been applied. Please contact your tax adviser to
                resolve this flag.
              </CardContent>
            </Card>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <RegimeComparisonChart
                  data={[
                    {
                      name: `${calculation.regime} (your regime)`,
                      totalTaxCents: calculation.totalTaxCents,
                    },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <IncomeBreakdownChart
                  data={[
                    {
                      name: "Flat 20%",
                      valueCents: calculation.flat20TaxCents,
                      color: "hsl(var(--primary))",
                    },
                    {
                      name: "DTA Exempt",
                      valueCents: calculation.dtaExemptIncomeCents,
                      color: "#22c55e",
                    },
                    {
                      name: "Progressive",
                      valueCents: calculation.progressiveTaxCents,
                      color: "#f59e0b",
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          {/* Per-event breakdown with delete */}
          {(() => {
            const eventRows: IncomeEventRow[] = calculation.classifiedEvents.map(
              (ce) => ({
                id: ce.event.id,
                taxYear: ce.event.taxYear,
                category: ce.event.category,
                grossAmountCents: ce.event.grossAmountCents,
                // taxable = gross × coefficient (or gross if no coefficient)
                taxableAmountCents:
                  ce.event.category === "B" && ce.event.catBCoefficient != null
                    ? Math.round(ce.event.grossAmountCents * ce.event.catBCoefficient)
                    : ce.event.grossAmountCents,
                source: ce.event.source,
                sourceCountry: ce.event.sourceCountry ?? null,
                description: ce.event.description ?? null,
                treatment: ce.treatment,
                taxCents: ce.taxCents,
              })
            );
            return <IncomeEventsPanel events={eventRows} taxYear={taxYear} />;
          })()}
        </>
      ) : calcErrorName && rawEvents.length > 0 ? (
        /* Regime calculation error — show events without tax breakdown */
        <>
          <Card className="border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
            <CardContent className="pt-4 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold">
                ⚠️ Tax calculation unavailable for {taxYear}
              </p>
              <p className="mt-1">
                {calcErrorName === "RegimeNotActiveError"
                  ? `Your NHR/IFICI regime was not yet active for tax year ${taxYear}. Income events are shown below but no tax liability can be calculated.`
                  : calcErrorName === "RegimeExpiredError"
                    ? `Your NHR/IFICI regime had already expired for tax year ${taxYear}. Income events are shown below but no tax liability can be calculated.`
                    : calcErrorMessage ?? "An unexpected error occurred during calculation."}
              </p>
            </CardContent>
          </Card>
          <IncomeEventsPanel
            events={rawEvents.map((r) => ({
              id: r.id,
              taxYear: r.tax_year,
              category: r.category,
              grossAmountCents: r.gross_amount_cents,
              taxableAmountCents:
                r.category === "B" && r.cat_b_coefficient != null
                  ? Math.round(r.gross_amount_cents * r.cat_b_coefficient)
                  : r.gross_amount_cents,
              source: r.source,
              sourceCountry: r.source_country,
              description: r.description,
              // treatment and taxCents intentionally omitted — calculation failed
            }))}
            taxYear={taxYear}
          />
        </>
      ) : rawEvents.length > 0 ? (
        /* Has events but calculation returned null (shouldn't happen, defensive) */
        <IncomeEventsPanel
          events={rawEvents.map((r) => ({
            id: r.id,
            taxYear: r.tax_year,
            category: r.category,
            grossAmountCents: r.gross_amount_cents,
            taxableAmountCents:
              r.category === "B" && r.cat_b_coefficient != null
                ? Math.round(r.gross_amount_cents * r.cat_b_coefficient)
                : r.gross_amount_cents,
            source: r.source,
            sourceCountry: r.source_country,
            description: r.description,
          }))}
          taxYear={taxYear}
        />
      ) : (
        /* CTA when no income events exist */
        <Card className="flex flex-col items-center gap-4 py-16 text-center">
          <CardContent className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-primary/10 p-4 text-3xl">📊</div>
            <div>
              <h2 className="text-lg font-semibold">
                Run your first calculation
              </h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                Add your income events for {taxYear} to calculate your NHR /
                IFICI tax liability.
              </p>
            </div>
            <Link href={`/onboarding?step=income&year=${taxYear}`} className={buttonVariants()}>Add income events</Link>
          </CardContent>
        </Card>
      )}

      {/* Scope disclaimer */}
      <p className="text-xs text-muted-foreground text-center pt-2 border-t">
        Fiscal Guard calculates <strong>IRS (income tax)</strong> only.
        VAT (IVA), social security (Segurança Social), and municipal surcharge (Derrama)
        are out of scope. Always verify results with a certified tax advisor (<em>TOC/ROC</em>).
      </p>

    </div>
  );
}


