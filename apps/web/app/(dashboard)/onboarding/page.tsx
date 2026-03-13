import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default function OnboardingPage() {
  return (
    <div className="flex min-h-[calc(100vh-72px)] items-start justify-center pt-12">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl">
            Set up your tax profile
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Complete the steps below so Fiscal Guard can calculate your NHR or
            IFICI tax liability.
          </p>
        </CardHeader>
        <CardContent>
          <OnboardingWizard />
        </CardContent>
      </Card>
    </div>
  );
}
