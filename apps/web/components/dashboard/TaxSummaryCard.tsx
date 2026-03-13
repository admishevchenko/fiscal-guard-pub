"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface TaxSummaryCardProps {
  flat20TaxCents: number;
  dtaExemptCents: number;
  progressiveTaxCents: number;
  solidaritySurchargeCents: number;
  totalTaxCents: number;
  totalGrossIncomeCents: number;
  regime: "NHR" | "IFICI";
}

const EUR = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
});

function centsToEur(cents: number): string {
  return EUR.format(cents / 100);
}

interface MetricProps {
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
}

function Metric({ label, value, sublabel, highlight }: MetricProps) {
  return (
    <Card className={highlight ? "border-primary/50 bg-primary/5" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={
            highlight
              ? "text-2xl font-bold text-primary"
              : "text-2xl font-bold"
          }
        >
          {value}
        </p>
        {sublabel && (
          <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function TaxSummaryCard({
  flat20TaxCents,
  dtaExemptCents,
  progressiveTaxCents,
  solidaritySurchargeCents,
  totalTaxCents,
  totalGrossIncomeCents,
  regime,
}: TaxSummaryCardProps) {
  const effectiveRatePct =
    totalGrossIncomeCents > 0
      ? ((totalTaxCents / totalGrossIncomeCents) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Tax Summary</h2>
        <Badge variant="secondary">{regime}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Metric
          label="Total Gross Income"
          value={centsToEur(totalGrossIncomeCents)}
          sublabel="All income events"
        />
        <Metric
          label="20% Flat Rate Tax"
          value={centsToEur(flat20TaxCents)}
          sublabel="Art. 72(10) CIRS / Art. 58-A EBF"
        />
        <Metric
          label="DTA Exempt Income"
          value={centsToEur(dtaExemptCents)}
          sublabel="Foreign income exempt via DTA"
        />
        <Metric
          label="Progressive Tax"
          value={centsToEur(progressiveTaxCents + solidaritySurchargeCents)}
          sublabel={`Incl. solidarity surcharge (${centsToEur(solidaritySurchargeCents)})`}
        />
        <Metric
          label="Total Tax Liability"
          value={centsToEur(totalTaxCents)}
          sublabel={`Effective rate: ${effectiveRatePct}%`}
          highlight
        />
      </div>
    </div>
  );
}
