import { z } from "zod";

export const OnboardingSchema = z.object({
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters"),

  regime: z.enum(["NHR", "IFICI"]),

  regimeEntryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be an ISO date (YYYY-MM-DD)")
    .refine(
      (val) => new Date(val) > new Date("2009-01-01"),
      { message: "Date must be after 2009-01-01" }
    )
    .refine(
      (val) => new Date(val) < new Date(),
      { message: "Date must be before today" }
    ),

  professionCode: z
    .string()
    .regex(/^\d{4}$/, "Profession code must be exactly 4 digits"),
});

export type OnboardingFormData = z.infer<typeof OnboardingSchema>;

/** Partial schema used by Step 1 of the onboarding wizard. */
export const Step1Schema = OnboardingSchema.pick({
  displayName: true,
  regime: true,
  regimeEntryDate: true,
});
export type Step1Data = z.infer<typeof Step1Schema>;

/** Partial schema used by Step 2 of the onboarding wizard. */
export const Step2Schema = OnboardingSchema.pick({ professionCode: true });
export type Step2Data = z.infer<typeof Step2Schema>;
