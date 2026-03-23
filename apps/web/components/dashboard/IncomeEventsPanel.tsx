"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { deleteIncomeEvent } from "@/actions/profile";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Serialisable DTO — no Decimal / class instances allowed across the
// server → client boundary.
// ---------------------------------------------------------------------------

export interface IncomeEventRow {
  id: string;
  taxYear: number;
  category: "A" | "B" | "E" | "F" | "G" | "H";
  grossAmountCents: number;
  /** taxable amount after Art. 31 CIRS coefficient (same as gross for non-Cat B) */
  taxableAmountCents: number;
  source: "PT" | "FOREIGN";
  sourceCountry: string | null;
  description: string | null;
  /** undefined when calculation could not run (e.g. RegimeNotActiveError) */
  treatment?:
    | "FLAT_20"
    | "DTA_EXEMPT"
    | "PENSION_EXEMPT"
    | "PENSION_10PCT"
    | "PROGRESSIVE"
    | "PENDING_MANUAL_REVIEW"
    | "BLACKLIST_35"
    | undefined;
  /** undefined when calculation could not run */
  taxCents?: number | undefined;
}

const CATEGORY_LABELS: Record<string, string> = {
  A: "Cat A — Employment",
  B: "Cat B — Self-employment",
  E: "Cat E — Capital",
  F: "Cat F — Rental",
  G: "Cat G — Capital gains",
  H: "Cat H — Pensions",
};

const TREATMENT_BADGE: Record<
  IncomeEventRow["treatment"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  FLAT_20:               { label: "20% Flat rate", variant: "default" },
  DTA_EXEMPT:            { label: "DTA Exempt (0%)", variant: "secondary" },
  PENSION_EXEMPT:        { label: "Pension Exempt (0%)", variant: "secondary" },
  PENSION_10PCT:         { label: "Pension 10%", variant: "outline" },
  PROGRESSIVE:           { label: "Progressive", variant: "destructive" },
  PENDING_MANUAL_REVIEW: { label: "⚠️ Manual review", variant: "destructive" },
  BLACKLIST_35:          { label: "Blacklisted 35%", variant: "destructive" },
};

const EUR = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const fmt = (cents: number) => EUR.format(cents / 100);

interface IncomeEventsPanelProps {
  events: IncomeEventRow[];
  taxYear: number;
}

export function IncomeEventsPanel({ events, taxYear }: IncomeEventsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteIncomeEvent(id);
    if (result.error) {
      toast.error(result.error);
      setDeletingId(null);
      return;
    }
    toast.success("Income event deleted. Recalculating…");
    startTransition(() => {
      router.refresh();
    });
    setDeletingId(null);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">
          Income events · {taxYear}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({events.length} event{events.length !== 1 ? "s" : ""})
          </span>
        </CardTitle>
        <Link
          href={`/onboarding?step=income&year=${taxYear}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          + Add income
        </Link>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No income events for {taxYear}.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((evt) => {
              const badge = evt.treatment ? TREATMENT_BADGE[evt.treatment] : null;
              const isDeleting = deletingId === evt.id || isPending;
              const hasCoefficient = evt.taxableAmountCents !== evt.grossAmountCents;

              return (
                <div
                  key={evt.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2.5 gap-3 text-sm"
                >
                  {/* Left: category + description + source */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-xs text-muted-foreground">
                        {CATEGORY_LABELS[evt.category] ?? evt.category}
                      </span>
                      {badge ? (
                        <Badge variant={badge.variant} className="text-xs">
                          {badge.label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          — no calculation
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {evt.source === "PT" ? "🇵🇹 Domestic" : `🌍 ${evt.sourceCountry}`}
                      </span>
                    </div>
                    {evt.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {evt.description}
                      </p>
                    )}
                    {/* Show coefficient reduction for Cat B */}
                    {hasCoefficient && (
                      <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                        Art. 31 CIRS: taxable {fmt(evt.taxableAmountCents)} (
                        {((evt.taxableAmountCents / evt.grossAmountCents) * 100).toFixed(1)}% of gross)
                      </p>
                    )}
                  </div>

                  {/* Right: amounts + tax + delete */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-semibold">{fmt(evt.grossAmountCents)}</p>
                      <p className="text-xs text-muted-foreground">
                        {evt.treatment === "DTA_EXEMPT" || evt.treatment === "PENSION_EXEMPT"
                          ? "exempt"
                          : evt.taxCents !== undefined
                            ? `tax: ${fmt(evt.taxCents)}`
                            : "tax: —"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                      disabled={isDeleting}
                      onClick={() => handleDelete(evt.id)}
                      title="Delete income event"
                    >
                      {deletingId === evt.id ? "…" : "✕"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
