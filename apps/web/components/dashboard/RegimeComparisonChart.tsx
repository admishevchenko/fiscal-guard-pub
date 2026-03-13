"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface RegimeComparisonDatum {
  name: string;
  totalTaxCents: number;
}

interface RegimeComparisonChartProps {
  /** Optional data override. Defaults to illustrative mock values. */
  data?: RegimeComparisonDatum[];
}

const DEFAULT_DATA: RegimeComparisonDatum[] = [
  { name: "NHR", totalTaxCents: 1_500_000 },
  { name: "IFICI", totalTaxCents: 1_200_000 },
];

/** Formats cents as a compact euro string for the chart axis / tooltip */
function formatEur(cents: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

function euroTickFormatter(value: unknown): string {
  return typeof value === "number" ? formatEur(value) : String(value);
}

interface TooltipPayloadEntry {
  value: unknown;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const rawValue = entry?.value;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {typeof rawValue === "number" ? formatEur(rawValue) : "-"}
      </p>
    </div>
  );
}

export function RegimeComparisonChart({
  data = DEFAULT_DATA,
}: RegimeComparisonChartProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Total tax liability by regime</h3>
      <p className="text-xs text-muted-foreground">
        Your total tax liability under your current NHR/IFICI regime.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          barCategoryGap="40%"
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 13 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={euroTickFormatter}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={70}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="totalTaxCents"
            name="Total tax"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
