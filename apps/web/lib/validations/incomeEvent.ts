import { z } from "zod";

export const IncomeEventSchema = z
  .object({
    taxYear: z
      .number()
      .int("Tax year must be a whole number")
      .min(2024, "Tax year must be 2024 or later")
      .max(2030, "Tax year cannot exceed 2030"),

    category: z.enum(["A", "B", "E", "F", "G", "H"]),

    amountEuros: z
      .number()
      .positive("Amount must be positive")
      .finite("Amount must be a finite number")
      .refine(
        (val) => Math.abs(Math.round(val * 100) - val * 100) < 1e-9,
        { message: "Amount must have at most 2 decimal places" }
      ),

    source: z.enum(["DOMESTIC", "FOREIGN"]),

    /** ISO 3166-1 alpha-2 country code -- required when source === "FOREIGN" */
    sourceCountry: z
      .string()
      .length(2, "Country code must be exactly 2 characters (ISO alpha-2)")
      .optional(),

    description: z.string().optional(),

    /**
     * Art. 31 CIRS regime simplificado — activity year for Cat B income.
     * 1 = Year 1 of activity (Art. 31(17) CIRS → coefficient 0.375, 37.5% taxable)
     * 2 = Year 2 of activity (Art. 31(18) CIRS → coefficient 0.5625, 56.25% taxable)
     * 3 = Year 3+ (full coefficient 0.75, 75% taxable)
     * undefined = not Category B, or Cat B foreign where coefficient may differ
     */
    catBActivityYear: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  })
  .refine(
    (data) =>
      data.source !== "FOREIGN" ||
      (data.sourceCountry !== undefined && data.sourceCountry.length === 2),
    {
      message: "Source country (ISO alpha-2) is required for foreign income",
      path: ["sourceCountry"],
    }
  );

export type IncomeEventFormData = z.infer<typeof IncomeEventSchema>;
