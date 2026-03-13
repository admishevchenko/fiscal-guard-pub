"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Step1Schema, type Step1Data } from "@/lib/validations/taxProfile";

interface Step1RegimeProps {
  defaultValues?: Partial<Step1Data>;
  onNext: (data: Step1Data) => void;
}

const REGIME_OPTIONS = [
  {
    value: "NHR" as const,
    label: "NHR -- Non-Habitual Resident",
    description:
      "Legacy regime for applicants registered before 1 January 2024. " +
      "20% flat rate on qualifying Portuguese-source income; DTA exemption on foreign income. " +
      "Art. 16 CIRS.",
  },
  {
    value: "IFICI" as const,
    label: "IFICI -- Innovation & Research Incentive",
    description:
      "New regime (Portaria n.º 352/2024) for researchers, highly qualified " +
      "professionals and innovation-activity workers. 20% flat rate; DTA exemption. " +
      "Art. 58-A EBF.",
  },
];

export function Step1Regime({ defaultValues, onNext }: Step1RegimeProps) {
  const form = useForm<Step1Data, unknown, Step1Data>({
    resolver: zodResolver(Step1Schema),
    defaultValues: {
      displayName: defaultValues?.displayName ?? "",
      regimeEntryDate: defaultValues?.regimeEntryDate ?? "",
      // Only set regime if provided -- avoids exactOptionalPropertyTypes error
      ...(defaultValues?.regime !== undefined
        ? { regime: defaultValues.regime }
        : {}),
      ...(defaultValues?.nhrPensionExemptionElected !== undefined
        ? { nhrPensionExemptionElected: defaultValues.nhrPensionExemptionElected }
        : {}),
    },
  });

  const regime = useWatch({ control: form.control, name: "regime" });
  const entryDate = useWatch({ control: form.control, name: "regimeEntryDate" });

  // Lei n.º 2/2020, Art. 12: pension exemption election available only for
  // NHR holders registered before 2020-01-01
  const showPensionCheckbox =
    regime === "NHR" &&
    entryDate !== "" &&
    /^\d{4}-\d{2}-\d{2}$/.test(entryDate) &&
    new Date(entryDate) < new Date("2020-01-01");

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          void form.handleSubmit(onNext)(e);
        }}
        className="space-y-6"
      >
        {/* Display name */}
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Maria Silva" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Regime selection */}
        <FormField
          control={form.control}
          name="regime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tax regime</FormLabel>
              <FormControl>
                <div className="space-y-3">
                  {REGIME_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
                        field.value === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <input
                        type="radio"
                        value={option.value}
                        checked={field.value === option.value}
                        onChange={() => field.onChange(option.value)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      />
                      <div>
                        <p className="font-medium text-sm">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Regime entry date */}
        <FormField
          control={form.control}
          name="regimeEntryDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Regime entry date</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                The date your NHR/IFICI status was officially granted by the
                Portuguese Tax Authority (AT). Must be after 1 January 2009.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* NHR pre-2020 pension exemption election (Lei 2/2020, Art. 12) */}
        {showPensionCheckbox && (
          <FormField
            control={form.control}
            name="nhrPensionExemptionElected"
            render={({ field }) => (
              <FormItem className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                <FormControl>
                  <input
                    type="checkbox"
                    checked={field.value ?? false}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    aria-label="Elected pre-2020 pension exemption"
                  />
                </FormControl>
                <div>
                  <FormLabel className="text-sm font-medium">
                    Elected pre-2020 pension exemption (Lei 2/2020, Art. 12)
                  </FormLabel>
                  <p className="mt-1 text-xs text-muted-foreground">
                    NHR holders registered before 1 Jan 2020 may elect to maintain the
                    original full pension exemption instead of the 10% rate. Check this
                    if you made this election with the Portuguese Tax Authority.
                  </p>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="flex justify-end">
          <Button type="submit">Next</Button>
        </div>
      </form>
    </Form>
  );
}
