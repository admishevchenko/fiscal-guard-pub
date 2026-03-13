/**
 * Server action integration tests for actions/tax.ts
 * Uses mocked Supabase client and tax engine.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Supabase mock
// vi.hoisted() ensures variables referenced in vi.mock() factory are available
// (vi.mock is hoisted before variable declarations by Vitest)
// ---------------------------------------------------------------------------
const { mockFrom, mockGetUser } = vi.hoisted(() => {
  const mockGetUser = vi.fn().mockResolvedValue({
    data: { user: { id: "user-abc" } },
  });

  // Mock factory: returns different builders per table name
  const mockFrom = vi.fn((table: string) => {
    if (table === "calculations") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "calc-1" }, error: null }),
        }),
      };
    }
    if (table === "tax_reasoning_log") {
      return {
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    // tax_profiles and income_events
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      }),
    };
  });

  return { mockFrom, mockGetUser };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

import { calculateTaxAction } from "@/actions/tax";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const VALID_PROFILE = {
  id: "profile-1",
  user_id: "user-abc",
  regime: "NHR",
  regime_entry_date: "2022-01-01",
  regime_exit_date: null,
  profession_code: "2131",
  is_innovation_activity: false,
  nhr_pension_exemption_elected: false,
};

const VALID_EVENTS = [
  {
    id: "evt-1",
    tax_year: 2026,
    category: "A",
    gross_amount_cents: 5_000_000,
    source: "PT",
    source_country: "PT",
    description: null,
    cat_b_coefficient: null as number | null,
  },
];

describe("calculateTaxAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Helper: set up Supabase mock for calculation tests ---
  function setupCalcMock(
    profile: Record<string, unknown>,
    events: Record<string, unknown>[],
  ) {
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "u1" } } }),
      },
      from: vi.fn((table: string) => {
        if (table === "tax_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: profile }),
            }),
          };
        }
        if (table === "income_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: events }),
              }),
            }),
          };
        }
        if (table === "calculations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: "calc-1" },
                error: null,
              }),
            }),
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any);
  }

  // --- Helper: build an income event with defaults ---
  function makeEvent(
    overrides: Partial<(typeof VALID_EVENTS)[0]> & { id?: string },
  ) {
    return {
      id: "evt-1",
      tax_year: 2026,
      category: "A",
      gross_amount_cents: 5_000_000,
      source: "PT",
      source_country: "PT",
      description: null,
      cat_b_coefficient: null as number | null,
      ...overrides,
    };
  }

  it("returns null when user is not authenticated", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: vi.fn(),
    } as any);

    const result = await calculateTaxAction(2026);
    expect(result).toBeNull();
  });

  it("returns null when no active tax profile exists", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      })),
    } as any);

    const result = await calculateTaxAction(2026);
    expect(result).toBeNull();
  });

  it("returns null when user has no income events for the tax year", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "tax_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: VALID_PROFILE }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            // Returns empty events array
            mockReturnValue: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }),
    } as any);

    // income_events returns empty: action should return null
    const result = await calculateTaxAction(2026);
    // If profile found but events empty, returns null
    expect(result).toBeNull();
  });

  it("returns CalculationResult for NHR + PT Cat A eligible profession (flat20 = 20% of gross)", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "tax_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: VALID_PROFILE }),
            }),
          };
        }
        if (table === "income_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: VALID_EVENTS }),
              }),
            }),
          };
        }
        if (table === "calculations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "calc-1" }, error: null }),
            }),
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any);

    const result = await calculateTaxAction(2026);

    expect(result).not.toBeNull();
    // NHR + PT + eligible profession code 2131 → FLAT_20 at 20%
    // €50,000 → €10,000 tax
    expect(result!.flat20TaxCents).toBe(1_000_000); // €10,000
    expect(result!.regime).toBe("NHR");
  });

  it("upserts calculation row atomically (no delete+insert race)", async () => {
    const upsertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "calc-1" }, error: null }),
    });

    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "tax_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: VALID_PROFILE }),
            }),
          };
        }
        if (table === "income_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: VALID_EVENTS }),
              }),
            }),
          };
        }
        if (table === "calculations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
            upsert: upsertFn,
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any);

    await calculateTaxAction(2026);

    expect(upsertFn).toHaveBeenCalled();
  });

  it("inserts reasoning log rows after successful calculation", async () => {
    const logInsert = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "tax_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: VALID_PROFILE }),
            }),
          };
        }
        if (table === "income_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: VALID_EVENTS }),
              }),
            }),
          };
        }
        if (table === "calculations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "calc-99" }, error: null }),
            }),
          };
        }
        if (table === "tax_reasoning_log") {
          return {
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
            insert: logInsert,
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any);

    await calculateTaxAction(2026);

    expect(logInsert).toHaveBeenCalled();
    const logRows = logInsert.mock.calls[0]![0]!;
    expect(Array.isArray(logRows)).toBe(true);
    expect(logRows[0]).toMatchObject({
      user_id: "u1",
      tax_year: 2026,
      regime: "NHR",
    });
  });

  /**
   * Regression: Cat G (capital gains / incrementos patrimoniais) domestic income
   * must flow through the entire action pipeline and land in progressiveTaxCents,
   * not flat20TaxCents (Art. 10 CIRS → IncomeClassifier Rule 5 → PROGRESSIVE).
   *
   * NOTE: Art. 72(1)(b) CIRS autonomous 28% rate and Art. 43(2) CIRS 50% inclusion
   * are not yet modelled — conservative PROGRESSIVE treatment (Art. 68 CIRS) is
   * intentionally used as the safe default.
   */
  it("Cat G domestic: progressiveIncomeCents > 0, flat20TaxCents = 0 (Art. 10 / Art. 68 CIRS)", async () => {
    const CAT_G_EVENTS = [
      {
        id: "evt-g",
        tax_year: 2026,
        category: "G",
        gross_amount_cents: 5_000_000, // €50,000
        source: "PT",
        source_country: "PT",
        description: null,
        cat_b_coefficient: null as number | null,
      },
    ];

    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "tax_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: VALID_PROFILE }),
            }),
          };
        }
        if (table === "income_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: CAT_G_EVENTS }),
              }),
            }),
          };
        }
        if (table === "calculations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "calc-g" }, error: null }),
            }),
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any);

    const result = await calculateTaxAction(2026);

    expect(result).not.toBeNull();
    // Cat G domestic → PROGRESSIVE; no flat-rate tax
    expect(result!.flat20TaxCents).toBe(0);
    // Progressive income must include the full €50,000
    expect(result!.progressiveIncomeCents).toBe(5_000_000);
    // Progressive tax must be positive (some tax owed at general rates)
    expect(result!.progressiveTaxCents).toBeGreaterThan(0);
  });

  // ===================================================================
  // Comprehensive calculation tests — income classification & tax math
  // ===================================================================

  it("NHR + PT Cat A non-eligible profession → PROGRESSIVE (Art. 68 CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, profession_code: "9999" },
      [makeEvent({ category: "A", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.flat20TaxCents).toBe(0);
    expect(result!.progressiveIncomeCents).toBe(5_000_000);
    expect(result!.progressiveTaxCents).toBeGreaterThan(0);
  });

  it("NHR + PT Cat A suspect profession (2433) → PROGRESSIVE conservative (Portaria 352/2024)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, profession_code: "2433" },
      [makeEvent({ category: "A", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.flat20TaxCents).toBe(0);
    // Suspect codes land in progressive bucket with a manual-review flag
    expect(result!.progressiveIncomeCents).toBeGreaterThanOrEqual(5_000_000);
    expect(result!.pendingManualReviewIncomeCents).toBe(5_000_000);
  });

  it("NHR + PT Cat B eligible Yr1 → FLAT_20 at 37.5% base (Art. 31(17) CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({
        category: "B",
        source: "PT",
        source_country: "PT",
        gross_amount_cents: 10_000_000,
        cat_b_coefficient: 0.375,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    // 100,000€ × 0.375 × 0.20 = 7,500€ = 750,000 cents
    expect(result!.flat20TaxCents).toBe(750_000);
  });

  it("NHR + PT Cat B eligible Yr2 → FLAT_20 at 56.25% base (Art. 31(18) CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({
        category: "B",
        source: "PT",
        source_country: "PT",
        gross_amount_cents: 10_000_000,
        cat_b_coefficient: 0.5625,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    // 100,000€ × 0.5625 × 0.20 = 11,250€ = 1,125,000 cents
    expect(result!.flat20TaxCents).toBe(1_125_000);
  });

  it("NHR + PT Cat B eligible Yr3 → FLAT_20 at 75% base (Art. 31 CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({
        category: "B",
        source: "PT",
        source_country: "PT",
        gross_amount_cents: 10_000_000,
        cat_b_coefficient: 0.75,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    // 100,000€ × 0.75 × 0.20 = 15,000€ = 1,500,000 cents
    expect(result!.flat20TaxCents).toBe(1_500_000);
  });

  it("NHR + PT Cat E → PROGRESSIVE (Art. 5 / Art. 68 CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({ category: "E", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.flat20TaxCents).toBe(0);
    expect(result!.progressiveIncomeCents).toBe(5_000_000);
  });

  it("NHR + Cat E FOREIGN DTA (US) → DTA_EXEMPT (Portaria 352/2024 Art. 4(1)(b))", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({
        category: "E",
        source: "FOREIGN",
        source_country: "US",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.dtaExemptIncomeCents).toBe(5_000_000);
    expect(result!.flat20TaxCents).toBe(0);
  });

  it("NHR + Cat E FOREIGN blacklisted (PA) → BLACKLIST_35 (Art. 72(12) CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({
        category: "E",
        source: "FOREIGN",
        source_country: "PA",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.blacklist35IncomeCents).toBe(5_000_000);
    expect(result!.blacklist35TaxCents).toBe(1_750_000);
  });

  it("NHR + PT Cat F → PROGRESSIVE (Art. 8 / Art. 68 CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({ category: "F", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.flat20TaxCents).toBe(0);
    expect(result!.progressiveIncomeCents).toBe(5_000_000);
  });

  it("NHR + Cat F FOREIGN DTA (DE) → DTA_EXEMPT (Portaria 352/2024)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({
        category: "F",
        source: "FOREIGN",
        source_country: "DE",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.dtaExemptIncomeCents).toBe(5_000_000);
  });

  it("NHR + Cat G FOREIGN DTA (GB) → DTA_EXEMPT (Portaria 352/2024)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({
        category: "G",
        source: "FOREIGN",
        source_country: "GB",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.dtaExemptIncomeCents).toBe(5_000_000);
  });

  it("NHR + Cat G FOREIGN blacklisted (PA) → BLACKLIST_35 (Art. 72(12) CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({
        category: "G",
        source: "FOREIGN",
        source_country: "PA",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.blacklist35IncomeCents).toBe(5_000_000);
    expect(result!.blacklist35TaxCents).toBe(1_750_000);
  });

  it("NHR + PT Cat H → PROGRESSIVE (Art. 11 / Art. 68 CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [makeEvent({ category: "H", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.flat20TaxCents).toBe(0);
    expect(result!.progressiveIncomeCents).toBe(5_000_000);
  });

  /**
   * Pre-2020 NHR holder who did NOT elect pension exemption → PENSION_10PCT.
   * Lei n.º 2/2020, Art. 12: without election, 10% rate applies.
   */
  it("NHR + Cat H FOREIGN pre-2020 + no election → PENSION_10PCT (Art. 72(10) + Lei 2/2020)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime_entry_date: "2019-06-01", nhr_pension_exemption_elected: false },
      [makeEvent({
        category: "H",
        source: "FOREIGN",
        source_country: "FR",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.pensionExemptIncomeCents).toBe(0);
    expect(result!.pension10pctIncomeCents).toBe(5_000_000);
    expect(result!.pension10pctTaxCents).toBe(500_000);
  });

  /**
   * Pre-2020 NHR holder who ELECTED pension exemption → PENSION_EXEMPT (0% tax).
   * Lei n.º 2/2020, Art. 12 transitional provision.
   */
  it("NHR + Cat H FOREIGN pre-2020 + elected exemption → PENSION_EXEMPT (Lei 2/2020, Art. 12)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime_entry_date: "2019-06-01", nhr_pension_exemption_elected: true },
      [makeEvent({
        category: "H",
        source: "FOREIGN",
        source_country: "FR",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.pensionExemptIncomeCents).toBe(5_000_000);
    expect(result!.pension10pctIncomeCents).toBe(0);
    expect(result!.pension10pctTaxCents).toBe(0);
  });

  it("NHR + Cat H FOREIGN post-2020 → PENSION_10PCT (Art. 72(10) CIRS as amended)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime_entry_date: "2022-01-01" },
      [makeEvent({
        category: "H",
        source: "FOREIGN",
        source_country: "FR",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.pension10pctIncomeCents).toBe(5_000_000);
    expect(result!.pension10pctTaxCents).toBe(500_000);
  });

  it("IFICI + PT Cat A eligible → FLAT_20 (Art. 58-A(1) EBF)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime: "IFICI", profession_code: "2131" },
      [makeEvent({ category: "A", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.flat20TaxCents).toBe(1_000_000);
    expect(result!.regime).toBe("IFICI");
  });

  it("IFICI + PT Cat A non-eligible → PROGRESSIVE (Art. 68 CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime: "IFICI", profession_code: "9999" },
      [makeEvent({ category: "A", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.flat20TaxCents).toBe(0);
    expect(result!.progressiveIncomeCents).toBe(5_000_000);
  });

  it("IFICI + PT Cat B eligible Yr1 → FLAT_20 at 37.5% (Art. 58-A EBF + Art. 31 CIRS)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime: "IFICI", profession_code: "2131" },
      [makeEvent({
        category: "B",
        source: "PT",
        source_country: "PT",
        gross_amount_cents: 10_000_000,
        cat_b_coefficient: 0.375,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    // 100,000€ × 0.375 × 0.20 = 7,500€ = 750,000 cents
    expect(result!.flat20TaxCents).toBe(750_000);
  });

  it("IFICI + Cat E FOREIGN DTA (US) → DTA_EXEMPT (Portaria 352/2024)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime: "IFICI", profession_code: "2131" },
      [makeEvent({
        category: "E",
        source: "FOREIGN",
        source_country: "US",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.dtaExemptIncomeCents).toBe(5_000_000);
  });

  it("IFICI + Cat H FOREIGN → PROGRESSIVE, NO pension exemption (Art. 58-A EBF)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime: "IFICI", profession_code: "2131" },
      [makeEvent({
        category: "H",
        source: "FOREIGN",
        source_country: "FR",
        gross_amount_cents: 5_000_000,
      })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.pension10pctIncomeCents).toBe(0);
    expect(result!.pensionExemptIncomeCents).toBe(0);
    expect(result!.progressiveIncomeCents).toBe(5_000_000);
    expect(result!.progressiveTaxCents).toBeGreaterThan(0);
  });

  it("IFICI + PT Cat H → PROGRESSIVE (Art. 58-A EBF)", async () => {
    setupCalcMock(
      { ...VALID_PROFILE, regime: "IFICI", profession_code: "2131" },
      [makeEvent({ category: "H", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 })],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.progressiveIncomeCents).toBe(5_000_000);
  });

  it("Mixed events: NHR Cat A FLAT_20 + Cat E DTA_EXEMPT + Cat G PROGRESSIVE", async () => {
    setupCalcMock(
      { ...VALID_PROFILE },
      [
        makeEvent({ id: "evt-a", category: "A", source: "PT", source_country: "PT", gross_amount_cents: 5_000_000 }),
        makeEvent({ id: "evt-e", category: "E", source: "FOREIGN", source_country: "US", gross_amount_cents: 2_000_000 }),
        makeEvent({ id: "evt-g", category: "G", source: "PT", source_country: "PT", gross_amount_cents: 3_000_000 }),
      ],
    );
    const result = await calculateTaxAction(2026);
    expect(result).not.toBeNull();
    expect(result!.flat20IncomeCents).toBe(5_000_000);
    expect(result!.dtaExemptIncomeCents).toBe(2_000_000);
    expect(result!.progressiveIncomeCents).toBe(3_000_000);
  });

  // ===================================================================
  // Idempotency tests — skip recalc when inputs unchanged
  // ===================================================================

  it("skips DB writes when input_hash matches existing calculation", async () => {
    // We need to intercept the upsert calls to verify they are NOT called.
    const upsertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "calc-1" }, error: null }),
    });

    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "tax_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: VALID_PROFILE }),
            }),
          };
        }
        if (table === "income_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: VALID_EVENTS }),
              }),
            }),
          };
        }
        if (table === "calculations") {
          // Simulate existing calc with a matching hash.
          // We compute the real hash by importing createHash.
          const { createHash } = require("crypto");
          const payload = JSON.stringify({
            p: {
              regime: VALID_PROFILE.regime,
              entry: VALID_PROFILE.regime_entry_date,
              exit: VALID_PROFILE.regime_exit_date,
              code: VALID_PROFILE.profession_code,
              innovation: VALID_PROFILE.is_innovation_activity,
              pensionElected: VALID_PROFILE.nhr_pension_exemption_elected,
            },
            e: VALID_EVENTS.slice()
              .sort((a: any, b: any) => a.id.localeCompare(b.id))
              .map((ev: any) => ({
                id: ev.id,
                cat: ev.category,
                src: ev.source,
                sc: ev.source_country,
                amt: ev.gross_amount_cents,
                coeff: ev.cat_b_coefficient,
              })),
          });
          const matchingHash = createHash("sha256").update(payload).digest("hex");

          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "calc-cached", input_hash: matchingHash },
                  }),
                }),
              }),
            }),
            upsert: upsertFn,
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any);

    const result = await calculateTaxAction(2026);

    // Should still return a valid result (engine still runs for the response)
    expect(result).not.toBeNull();
    // But upsert on calculations should NOT have been called
    expect(upsertFn).not.toHaveBeenCalled();
  });

  it("recalculates and writes when input_hash does NOT match (data changed)", async () => {
    const upsertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: "calc-new" }, error: null }),
    });

    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn((table: string) => {
        if (table === "tax_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: VALID_PROFILE }),
            }),
          };
        }
        if (table === "income_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: VALID_EVENTS }),
              }),
            }),
          };
        }
        if (table === "calculations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "calc-old", input_hash: "stale-hash-does-not-match" },
                  }),
                }),
              }),
            }),
            upsert: upsertFn,
          };
        }
        return {
          delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    } as any);

    const result = await calculateTaxAction(2026);

    expect(result).not.toBeNull();
    // Hash mismatch → upsert should have been called
    expect(upsertFn).toHaveBeenCalled();
  });
});
