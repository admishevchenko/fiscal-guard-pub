"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { saveTaxProfile, saveIncomeEvents } from "@/actions/profile";
import { Step1Regime } from "./Step1Regime";
import { Step2Profession } from "./Step2Profession";
import { Step3Income } from "./Step3Income";
import type { Step1Data, Step2Data } from "@/lib/validations/taxProfile";
import type { IncomeEventFormData } from "@/lib/validations/incomeEvent";

type WizardProfileData = Step1Data & Step2Data;

const STEP_LABELS = [
  "Regime & dates",
  "Profession code",
  "Income events",
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?step=income lets returning users jump straight to Step 3
  const initialStep = searchParams.get("step") === "income" ? 2 : 0;
  const [step, setStep] = useState<0 | 1 | 2>(initialStep as 0 | 1 | 2);
  const [profileData, setProfileData] = useState<Partial<WizardProfileData>>(
    {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = ((step + 1) / STEP_LABELS.length) * 100;

  // ---- Step handlers -------------------------------------------------------

  function handleStep1Next(data: Step1Data) {
    setProfileData((prev) => ({ ...prev, ...data }));
    setStep(1);
  }

  function handleStep2Next(data: Step2Data) {
    setProfileData((prev) => ({ ...prev, ...data }));
    setStep(2);
  }

  async function handleStep3Submit(events: IncomeEventFormData[]) {
    const isAddIncomeOnly = initialStep === 2;
    const profile = profileData as WizardProfileData;

    // When arriving via ?step=income, the user already has a profile — skip save.
    if (!isAddIncomeOnly) {
      if (
        !profile.displayName ||
        !profile.regime ||
        !profile.regimeEntryDate ||
        !profile.professionCode
      ) {
        toast.error("Missing profile data. Please go back and fill in all steps.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (!isAddIncomeOnly) {
        const profileResult = await saveTaxProfile({
          displayName: profile.displayName,
          regime: profile.regime,
          regimeEntryDate: profile.regimeEntryDate,
          professionCode: profile.professionCode,
          ...(profile.nhrPensionExemptionElected !== undefined
            ? { nhrPensionExemptionElected: profile.nhrPensionExemptionElected }
            : {}),
        });

        if (profileResult.error) {
          toast.error(profileResult.error);
          return;
        }
      }

      if (events.length > 0) {
        const eventsResult = await saveIncomeEvents(events);
        if (eventsResult.error) {
          toast.error(eventsResult.error);
          return;
        }
      }

      toast.success(
        isAddIncomeOnly
          ? "Income events added! Recalculating your dashboard…"
          : "Profile saved! Redirecting to your dashboard…"
      );
      // Invalidate Router Cache BEFORE navigating so any pre-fetched snapshot
      // of /dashboard is discarded prior to the push (Next.js App Router pattern
      // for post-mutation cache busting).
      router.refresh();
      router.push("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Step1 default values: avoid passing `undefined` for `regime`
  // (exactOptionalPropertyTypes requires omitting the key rather than setting
  // it to undefined when the prop is typed as optional without `| undefined`)
  const step1Defaults: Parameters<typeof Step1Regime>[0]["defaultValues"] = {
    displayName: profileData.displayName ?? "",
    regimeEntryDate: profileData.regimeEntryDate ?? "",
    ...(profileData.regime !== undefined
      ? { regime: profileData.regime }
      : {}),
    ...(profileData.nhrPensionExemptionElected !== undefined
      ? { nhrPensionExemptionElected: profileData.nhrPensionExemptionElected }
      : {}),
  };

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Step {step + 1} of {STEP_LABELS.length}:{" "}
            <span className="font-medium text-foreground">
              {STEP_LABELS[step]}
            </span>
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step content */}
      {step === 0 && (
        <Step1Regime
          defaultValues={step1Defaults}
          onNext={handleStep1Next}
        />
      )}
      {step === 1 && (
        <Step2Profession
          defaultValues={{
            professionCode: profileData.professionCode ?? "",
          }}
          onNext={handleStep2Next}
          onBack={() => setStep(0)}
        />
      )}
      {step === 2 && (
        <Step3Income
          onSubmit={handleStep3Submit}
          onBack={() => setStep(1)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
