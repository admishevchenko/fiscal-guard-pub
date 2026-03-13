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
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: "calc-1" }, error: null }),
        }),
      };
    }
    if (table === "tax_reasoning_log") {
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
    cat_b_coefficient: null,
  },
];

describe("calculateTaxAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    const deleteEq = vi.fn().mockReturnThis();
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
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "calc-1" }, error: null }),
            }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    } as any);

    const result = await calculateTaxAction(2026);

    expect(result).not.toBeNull();
    // NHR + PT + eligible profession code 2131 → FLAT_20 at 20%
    // €50,000 → €10,000 tax
    expect(result!.flat20TaxCents).toBe(1_000_000); // €10,000
    expect(result!.regime).toBe("NHR");
  });

  it("deletes existing calculation for the year before inserting", async () => {
    const deleteFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() });
    const insertFn = vi.fn().mockReturnValue({
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
          return { delete: deleteFn, insert: insertFn };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    } as any);

    await calculateTaxAction(2026);

    expect(deleteFn).toHaveBeenCalled();
    expect(insertFn).toHaveBeenCalled();
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
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "calc-99" }, error: null }),
            }),
          };
        }
        if (table === "tax_reasoning_log") {
          return { insert: logInsert };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }),
    } as any);

    await calculateTaxAction(2026);

    expect(logInsert).toHaveBeenCalled();
    const logRows = logInsert.mock.calls[0][0];
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
        cat_b_coefficient: null,
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
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: { id: "calc-g" }, error: null }),
            }),
          };
        }
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
});
