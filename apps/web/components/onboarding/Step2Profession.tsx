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
import { Step2Schema, type Step2Data } from "@/lib/validations/taxProfile";
import {
  ELIGIBLE_PROFESSION_CODES,
  SUSPECT_PROFESSION_CODES,
} from "@fiscal-guard/tax-engine";


// Human-readable labels for the most common eligible codes
const COMMON_CODES: { code: string; label: string }[] = [
  { code: "1120", label: "1120 — Executive director" },
  { code: "2131", label: "2131 — IT / Information systems" },
  { code: "2132", label: "2132 — Software developer" },
  { code: "2133", label: "2133 — Network & systems engineer" },
  { code: "2140", label: "2140 — Architect / Industrial designer" },
  { code: "2141", label: "2141 — Civil engineer" },
  { code: "2142", label: "2142 — Electrical engineer" },
  { code: "2211", label: "2211 — General practitioner (doctor)" },
  { code: "2212", label: "2212 — Medical specialist" },
  { code: "2310", label: "2310 — University professor" },
  { code: "2410", label: "2410 — Finance specialist" },
  { code: "2421", label: "2421 — Lawyer" },
];

interface Step2ProfessionProps {
  defaultValues?: Partial<Step2Data>;
  onNext: (data: Step2Data) => void;
  onBack: () => void;
}

export function Step2Profession({
  defaultValues,
  onNext,
  onBack,
}: Step2ProfessionProps) {
  const form = useForm<Step2Data, unknown, Step2Data>({
    resolver: zodResolver(Step2Schema),
    defaultValues: {
      professionCode: defaultValues?.professionCode ?? "",
    },
  });

  const code = useWatch({ control: form.control, name: "professionCode" });
  const isComplete = /^\d{4}$/.test(code ?? "");
  const isEligible = isComplete && ELIGIBLE_PROFESSION_CODES.has(code);
  const isSuspect = isComplete && SUSPECT_PROFESSION_CODES.has(code);
  const isUnknown = isComplete && !isEligible && !isSuspect;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onNext)} className="space-y-6">
        <FormField
          control={form.control}
          name="professionCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profession code (CPP 2010)</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. 2131"
                  maxLength={4}
                  inputMode="numeric"
                  pattern="\d{4}"
                  {...field}
                />
              </FormControl>

              {/* Real-time eligibility badge */}
              {isComplete && (
                <div
                  className={
                    isEligible
                      ? "rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 px-3 py-2 text-xs text-green-800 dark:text-green-300"
                      : isSuspect
                        ? "rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
                        : "rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-3 py-2 text-xs text-red-800 dark:text-red-300"
                  }
                >
                  {isEligible && (
                    <>✅ <strong>Eligible</strong> — qualifies for the 20% NHR/IFICI flat rate on Portuguese-source income (Portaria n.º 352/2024 Annex).</>
                  )}
                  {isSuspect && (
                    <>⚠️ <strong>Pending manual review</strong> — this code&apos;s eligibility is ambiguous under Portaria n.º 352/2024. A conservative progressive rate will apply until a compliance officer clears the flag.</>
                  )}
                  {isUnknown && (
                    <>❌ <strong>Not recognised</strong> — this code is not in the Portaria n.º 352/2024 eligible list. Portuguese-source income will be taxed at the <strong>progressive rate</strong> (12.5%–48%), not the 20% flat rate. Check the reference table below.</>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Use your <strong>CPP 2010</strong> code (Classificação Portuguesa
                das Profissões) from the Annex to Portaria n.º 352/2024 — not
                your CAE/CNAEF economic activity code.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Quick-reference table */}
        <details className="group text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
            📋 Common eligible codes (Portaria n.º 352/2024 Annex)
          </summary>
          <div className="mt-2 rounded-md border divide-y text-xs overflow-hidden">
            {COMMON_CODES.map(({ code: c, label }) => (
              <button
                key={c}
                type="button"
                onClick={() => form.setValue("professionCode", c, { shouldValidate: true })}
                className="w-full text-left px-3 py-1.5 hover:bg-muted/50 transition-colors font-mono"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-muted-foreground">
            Click a code to auto-fill. Full list in the{" "}
            <a
              href="https://dre.pt/dre/detalhe/portaria/352-2024-868920958"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              official Portaria text ↗
            </a>
            .
          </p>
        </details>

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack}>
            ← Back
          </Button>
          <Button type="submit">Next →</Button>
        </div>
      </form>
    </Form>
  );
}

