"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { saveTaxProfile } from "@/actions/profile";
import { OnboardingSchema, type OnboardingFormData } from "@/lib/validations/taxProfile";
import { ELIGIBLE_PROFESSION_CODES, SUSPECT_PROFESSION_CODES } from "@fiscal-guard/tax-engine";

interface EditProfileFormProps {
  defaultValues: OnboardingFormData;
}

const REGIME_OPTIONS = [
  {
    value: "NHR" as const,
    label: "NHR — Non-Habitual Resident",
    description: "Legacy regime for applicants registered before 1 Jan 2024. Art. 16 CIRS.",
  },
  {
    value: "IFICI" as const,
    label: "IFICI — Innovation & Research Incentive",
    description: "New regime (Portaria n.º 352/2024) for researchers and highly qualified professionals. Art. 58-A EBF.",
  },
];

export function EditProfileForm({ defaultValues }: EditProfileFormProps) {
  const router = useRouter();

  const form = useForm<OnboardingFormData>({
    resolver: zodResolver(OnboardingSchema),
    defaultValues,
  });

  const { isSubmitting } = form.formState;
  const regime = useWatch({ control: form.control, name: "regime" });
  const entryDate = useWatch({ control: form.control, name: "regimeEntryDate" });
  const professionCode = useWatch({ control: form.control, name: "professionCode" }) ?? "";

  const showPensionExemption =
    regime === "NHR" &&
    entryDate.length === 10 &&
    new Date(entryDate) < new Date("2020-01-01");

  const codeIsEligible = professionCode.length === 4 && ELIGIBLE_PROFESSION_CODES.has(professionCode);
  const codeIsSuspect = professionCode.length === 4 && SUSPECT_PROFESSION_CODES.has(professionCode);
  const codeIsUnknown = professionCode.length === 4 && !codeIsEligible && !codeIsSuspect;

  async function onSubmit(data: OnboardingFormData) {
    const result = await saveTaxProfile(data);
    if (result.error) {
      toast.error(`Failed to save: ${result.error}`);
      return;
    }
    toast.success("Tax profile updated successfully.");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

        {/* ── Personal details ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal details</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6 space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your full name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ── Tax regime ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tax regime</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6 space-y-6">
            <FormField
              control={form.control}
              name="regime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Regime</FormLabel>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mt-2">
                    {REGIME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => field.onChange(opt.value)}
                        className={cn(
                          "rounded-lg border p-4 text-left transition-colors",
                          field.value === opt.value
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-gray-200 hover:border-gray-300"
                        )}
                      >
                        <p className="font-medium text-sm">{opt.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{opt.description}</p>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="regimeEntryDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Regime entry date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    The date your NHR/IFICI status was granted by AT (Tax Authority).
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showPensionExemption && (
              <FormField
                control={form.control}
                name="nhrPensionExemptionElected"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <FormControl>
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300"
                        checked={field.value ?? false}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    </FormControl>
                    <div>
                      <FormLabel className="font-medium">
                        Elect NHR pension exemption (Lei n.º 2/2020 transitional provision)
                      </FormLabel>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Available to NHR holders registered before 2020-01-01. Foreign pension income
                        is exempt (0%) instead of the standard 10% rate. Art. 12 Lei n.º 2/2020.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* ── Profession code ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profession code</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-6 space-y-4">
            <FormField
              control={form.control}
              name="professionCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPP 2010 profession code</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 2131"
                      maxLength={4}
                      inputMode="numeric"
                      pattern="\d{4}"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    />
                  </FormControl>
                  {professionCode.length === 4 && (
                    <p className={cn(
                      "text-xs font-medium mt-1",
                      codeIsEligible && "text-green-600",
                      codeIsSuspect && "text-amber-600",
                      codeIsUnknown && "text-red-600",
                    )}>
                      {codeIsEligible && "✅ Eligible for 20% flat rate (Portaria n.º 352/2024)"}
                      {codeIsSuspect && "⚠️ Borderline — manual review may be required"}
                      {codeIsUnknown && "❌ Not on the eligible list — progressive rates apply"}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
