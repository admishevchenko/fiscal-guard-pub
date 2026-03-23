import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { getTaxProfile } from "@/actions/profile";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const existingProfile = await getTaxProfile();

  // Read ?year= so the income form can pre-select the right tax year when
  // the user arrives from a year-specific dashboard view (e.g. ?year=2025).
  const rawYear = typeof params["year"] === "string" ? parseInt(params["year"], 10) : NaN;
  const defaultYear =
    !isNaN(rawYear) && rawYear >= 2024 && rawYear <= 2030 ? rawYear : undefined;

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
            {...(defaultYear !== undefined ? { defaultYear } : {})}
          />
        </CardContent>
      </Card>
    </div>
  );
}
