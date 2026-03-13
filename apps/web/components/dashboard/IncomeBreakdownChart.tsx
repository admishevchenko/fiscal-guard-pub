"use client";

import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";

export interface IncomeBreakdownDatum {
  name: string;
  valueCents: number;
  color: string;
}

interface IncomeBreakdownChartProps {
  /** Tax amounts in cents for each treatment bucket. */
  data?: IncomeBreakdownDatum[];
}

const DEFAULT_DATA: IncomeBreakdownDatum[] = [
  { name: "Flat 20%", valueCents: 800_000, color: "hsl(var(--primary))" },
  { name: "DTA Exempt", valueCents: 2_500_000, color: "#22c55e" },
  { name: "Progressive", valueCents: 300_000, color: "#f59e0b" },
];

const EUR = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatEur(cents: number): string {
  return EUR.format(cents / 100);
}

interface TooltipPayloadEntry {
  name: unknown;
  value: unknown;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const rawValue = entry?.value;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="font-medium">{String(entry?.name ?? "")}</p>
      <p className="text-muted-foreground">
        {typeof rawValue === "number" ? formatEur(rawValue) : "-"}
      </p>
    </div>
  );
}

function renderCustomLabel(props: PieLabelRenderProps): React.ReactElement | null {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;

  // Guard: all required values must be numbers
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof midAngle !== "number" ||
    typeof innerRadius !== "number" ||
    typeof outerRadius !== "number" ||
    typeof percent !== "number" ||
    percent < 0.05
  ) {
    return null;
  }

  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function IncomeBreakdownChart({
  data = DEFAULT_DATA,
}: IncomeBreakdownChartProps) {
  // Filter out zero-value slices
  const chartData = data.filter((d) => d.valueCents > 0);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Income breakdown by treatment</h3>
      <p className="text-xs text-muted-foreground">
        Distribution of gross income across tax treatment categories.
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="valueCents"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={90}
            labelLine={false}
            label={renderCustomLabel}
          >
            {chartData.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={10}
            wrapperStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
