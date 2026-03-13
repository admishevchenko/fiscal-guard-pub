"use client";

import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { IncomeEventSchema, type IncomeEventFormData } from "@/lib/validations/incomeEvent";

// Array wrapper schema for the form
const Step3Schema = z.object({
  events: z.array(IncomeEventSchema).min(0),
});
type Step3FormValues = z.infer<typeof Step3Schema>;

const CURRENT_YEAR = new Date().getFullYear();
const TAX_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030].filter(
  (y) => y <= CURRENT_YEAR + 1
);

const CATEGORY_LABELS: Record<string, string> = {
  A: "A — Dependent work income",
  B: "B — Self-employment / business",
  E: "E — Capital income (dividends, interest)",
  F: "F — Property rental income",
  G: "G — Capital gains",
  H: "H — Pensions",
};

const DEFAULT_EVENT: IncomeEventFormData = {
  taxYear: CURRENT_YEAR >= 2024 ? Math.min(CURRENT_YEAR, 2030) : 2024,
  category: "A",
  amountEuros: 1,
  source: "DOMESTIC",
};

interface Step3IncomeProps {
  onSubmit: (events: IncomeEventFormData[]) => void;
  onBack: () => void;
  isSubmitting?: boolean;
}

export function Step3Income({ onSubmit, onBack, isSubmitting }: Step3IncomeProps) {
  const form = useForm<Step3FormValues, unknown, Step3FormValues>({
    resolver: zodResolver(Step3Schema),
    defaultValues: {
      events: [{ ...DEFAULT_EVENT }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "events",
  });

  function handleSubmit(values: Step3FormValues) {
    onSubmit(values.events);
  }

  function handleValidationError() {
    toast.error("Please fix the highlighted errors before continuing.");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit, handleValidationError)} className="space-y-6">
        <div className="space-y-4">
          {fields.map((fieldItem, index) => (
            <IncomeEventRow
              key={fieldItem.id}
              index={index}
              form={form}
              onRemove={fields.length > 1 ? () => remove(index) : undefined}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => append({ ...DEFAULT_EVENT })}
        >
          + Add income event
        </Button>

        <Separator />

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            ← Back
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Finish setup →"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Single income event row
// ---------------------------------------------------------------------------

interface IncomeEventRowProps {
  index: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<Step3FormValues>>;
  onRemove?: (() => void) | undefined;
}

function IncomeEventRow({ index, form, onRemove }: IncomeEventRowProps) {
  const source = useWatch({
    control: form.control,
    name: `events.${index}.source`,
  });
  const category = useWatch({
    control: form.control,
    name: `events.${index}.category`,
  });

  // Cat B FOREIGN: warn that services rendered from Portugal are PT-source.
  // Art. 81 CIRS: source follows where the activity is performed, not where
  // the client is based. Remote work from Portugal → PT-source → 20% flat rate.
  const showRemoteWorkWarning = source === "FOREIGN" && category === "B";

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Event {index + 1}
        </span>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive"
          >
            Remove
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Tax year */}
        <FormField
          control={form.control}
          name={`events.${index}.taxYear`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tax year</FormLabel>
              <Select
                value={String(field.value)}
                onValueChange={(v) => field.onChange(Number(v))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TAX_YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category */}
        <FormField
          control={form.control}
          name={`events.${index}.category`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Amount */}
      <FormField
        control={form.control}
        name={`events.${index}.amountEuros`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Amount (€)</FormLabel>
            <FormControl>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...field}
                value={Number.isNaN(field.value as number) ? "" : field.value}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Source */}
      <FormField
        control={form.control}
        name={`events.${index}.source`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Income source</FormLabel>
            <FormControl>
              <div className="flex gap-4">
                {(["DOMESTIC", "FOREIGN"] as const).map((src) => (
                  <label
                    key={src}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      field.value === src
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      value={src}
                      checked={field.value === src}
                      onChange={() => field.onChange(src)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    {src === "DOMESTIC" ? "🇵🇹 Domestic" : "🌍 Foreign"}
                  </label>
                ))}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Regime simplificado activity year — only for Cat B */}
      {category === "B" && (
        <FormField
          control={form.control}
          name={`events.${index}.catBActivityYear`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Regime simplificado year</FormLabel>
              <Select
                value={field.value !== undefined ? String(field.value) : ""}
                onValueChange={(v) => field.onChange(v ? Number(v) : undefined)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select activity year…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="1">Year 1 of activity (37.5% taxable)</SelectItem>
                  <SelectItem value="2">Year 2 of activity (56.25% taxable)</SelectItem>
                  <SelectItem value="3">Year 3+ (75% taxable)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Under Art. 31 CIRS, only a portion of Cat B gross income is taxable
                (regime simplificado). Year 1 and 2 benefit from a reduced coefficient.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Remote-work warning: Cat B FOREIGN — services from PT are PT-source */}
      {showRemoteWorkWarning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p className="font-semibold">⚠️ Self-employment source rule (Art. 81 CIRS)</p>
          <p>
            If you perform these services <strong>physically from Portugal</strong> (e.g.
            remote work for a foreign client), the income is generally{" "}
            <strong>Portuguese-source</strong> and should be classified as{" "}
            <strong>🇵🇹 Domestic</strong> — taxable at the 20% NHR flat rate, not exempt.
          </p>
          <p>
            Select <strong>🌍 Foreign</strong> only if you were physically present in the
            foreign country while earning this income, or if you have a genuine foreign
            permanent establishment. Consult your tax advisor if unsure.
          </p>
        </div>
      )}

      {/* Source country (only when FOREIGN) */}
      {source === "FOREIGN" && (
        <FormField
          control={form.control}
          name={`events.${index}.sourceCountry`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source country (ISO alpha-2)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. US, GB, DE"
                  maxLength={2}
                  className="uppercase w-24"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value.toUpperCase() || undefined)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Description (optional) */}
      <FormField
        control={form.control}
        name={`events.${index}.description`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Description{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="e.g. Salary from Acme Ltd"
                {...field}
                value={field.value ?? ""}
                onChange={(e) =>
                  field.onChange(e.target.value || undefined)
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

