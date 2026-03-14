import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { getTaxProfile } from "@/actions/profile";

export default async function OnboardingPage() {
  const existingProfile = await getTaxProfile();

  return (
    <div className="flex min-h-[calc(100vh-72px)] items-start justify-center pt-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl">
            {existingProfile ? "Add income events" : "Set up your tax profile"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {existingProfile
              ? "Add income events for your existing tax profile."
              : "Complete the steps below so Fiscal Guard can calculate your NHR or IFICI tax liability."}
          </p>
        </CardHeader>
        <CardContent>
          <OnboardingWizard
            existingProfile={
              existingProfile
                ? {
                    regime: existingProfile.regime,
                    regimeEntryDate: existingProfile.regime_entry_date,
                    professionCode: existingProfile.profession_code,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
