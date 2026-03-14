"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { saveTaxProfile, saveIncomeEvents } from "@/actions/profile";
import { Step1Regime } from "./Step1Regime";
import { Step2Profession } from "./Step2Profession";
import { Step3Income } from "./Step3Income";
import type { Step1Data, Step2Data } from "@/lib/validations/taxProfile";
import type { IncomeEventFormData } from "@/lib/validations/incomeEvent";

type WizardProfileData = Step1Data & Step2Data;

/** Minimal profile data passed from server when user already has a profile. */
export interface ExistingProfile {
  regime: "NHR" | "IFICI";
  regimeEntryDate: string;
  professionCode: string;
}

const STEP_LABELS = [
  "Regime & dates",
  "Profession code",
  "Income events",
] as const;

interface OnboardingWizardProps {
  existingProfile?: ExistingProfile | undefined;
}

export function OnboardingWizard({ existingProfile }: OnboardingWizardProps) {
  const router = useRouter();

  // If the user already has a profile, always jump to income step.
  // Profile editing should be done separately, not during income add.
  // IMPORTANT: Only honor ?step=income when existingProfile is present to
  // prevent orphan income events being created without a tax profile.
  const hasProfile = existingProfile !== undefined;
  const initialStep: 0 | 1 | 2 = hasProfile ? 2 : 0;

  const [step, setStep] = useState<0 | 1 | 2>(initialStep);
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
    const isAddIncomeOnly = hasProfile;
    const profile = profileData as WizardProfileData;

    // When adding income only, the user already has a profile — skip save.
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
      {/* Existing profile banner — shown when adding income to an existing profile */}
      {hasProfile && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
          <span className="text-blue-600 font-medium">Active profile:</span>
          <Badge variant="outline">{existingProfile.regime}</Badge>
          <span className="text-muted-foreground">
            since {existingProfile.regimeEntryDate}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {existingProfile.professionCode === "0000"
              ? "No profession code"
              : `Code: ${existingProfile.professionCode}`}
          </span>
        </div>
      )}

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
          onBack={hasProfile ? undefined : () => setStep(1)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
