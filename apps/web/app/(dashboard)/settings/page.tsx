import { redirect } from "next/navigation";
import { getTaxProfile, getDisplayName } from "@/actions/profile";
import { EditProfileForm } from "@/components/settings/EditProfileForm";
import type { OnboardingFormData } from "@/lib/validations/taxProfile";

export default async function SettingsPage() {
  const [taxProfile, displayName] = await Promise.all([
    getTaxProfile(),
    getDisplayName(),
  ]);

  if (!taxProfile) {
    redirect("/onboarding");
  }

  const defaultValues: OnboardingFormData = {
    displayName: displayName ?? "",
    regime: taxProfile.regime,
    regimeEntryDate: taxProfile.regime_entry_date,
    professionCode: taxProfile.profession_code,
    ...(taxProfile.nhr_pension_exemption_elected
      ? { nhrPensionExemptionElected: taxProfile.nhr_pension_exemption_elected }
      : {}),
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tax profile settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Update your NHR/IFICI regime details and profession code.
          Changes apply immediately to all tax calculations.
        </p>
      </div>
      <EditProfileForm defaultValues={defaultValues} />
    </div>
  );
}
