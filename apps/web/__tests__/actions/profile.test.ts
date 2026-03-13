/**
 * Server action integration tests for actions/profile.ts
 * Uses mocked Supabase client — no real DB connections.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Supabase mock — chainable builder pattern
// vi.hoisted() ensures variables are available when vi.mock() factory runs
// (vi.mock is hoisted to top of file by Vitest before any variable declarations)
// ---------------------------------------------------------------------------
const {
  mockInsert,
  mockUpdate,
  mockUpsert,
  mockDelete,
  mockSelect,
  mockFrom,
  mockGetUser,
} = vi.hoisted(() => {
  const mockInsert = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const mockUpsert = vi.fn().mockResolvedValue({ error: null });
  const mockDelete = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnThis(),
  });
  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
  });
  const mockFrom = vi.fn((_table: string) => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    upsert: mockUpsert,
    delete: mockDelete,
  }));
  const mockGetUser = vi.fn().mockResolvedValue({
    data: { user: { id: "user-abc" } },
  });
  return {
    mockInsert,
    mockUpdate,
    mockUpsert,
    mockDelete,
    mockSelect,
    mockFrom,
    mockGetUser,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

// Import AFTER mock setup
import {
  saveTaxProfile,
  saveIncomeEvents,
  deleteIncomeEvent,
} from "@/actions/profile";

describe("saveTaxProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing profile
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    });
    mockUpsert.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });
  });

  it("returns error when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await saveTaxProfile({
      displayName: "Test",
      regime: "NHR",
      regimeEntryDate: "2022-01-01",
      professionCode: "2131",
    });
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("returns Zod validation error for invalid data", async () => {
    const result = await saveTaxProfile({
      displayName: "",
      regime: "NHR",
      regimeEntryDate: "bad-date",
      professionCode: "",
    });
    expect(result.error).toBeTruthy();
  });

  it("calls supabase insert when no existing profile", async () => {
    await saveTaxProfile({
      displayName: "Maria",
      regime: "NHR",
      regimeEntryDate: "2022-01-15",
      professionCode: "2131",
    });
    // insert should have been called on tax_profiles
    const calls = mockFrom.mock.calls.map((c) => c[0]);
    expect(calls).toContain("tax_profiles");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("calls supabase update when an existing profile is found", async () => {
    // Mock existing profile
    const eqMock = vi.fn().mockReturnThis();
    const isMock = vi.fn().mockReturnThis();
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: { id: "profile-1" } });
    mockSelect.mockReturnValue({
      eq: eqMock,
      is: isMock,
      maybeSingle: maybeSingleMock,
    });
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: updateEqMock });

    await saveTaxProfile({
      displayName: "Maria",
      regime: "IFICI",
      regimeEntryDate: "2025-03-01",
      professionCode: "2132",
    });

    expect(mockUpdate).toHaveBeenCalled();
  });
});

describe("saveIncomeEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });
  });

  it("returns empty object immediately for empty events array", async () => {
    const result = await saveIncomeEvents([]);
    expect(result).toEqual({});
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("maps DOMESTIC source to 'PT' in the DB row", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 10000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.source).toBe("PT");
  });

  it("converts euro amount to integer cents", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 140000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.gross_amount_cents).toBe(14_000_000);
  });

  it("sets cat_b_coefficient to 0.375 for Cat B Year 1 (Art. 31(17) CIRS)", async () => {
    await saveIncomeEvents([
      {
        taxYear: 2026,
        category: "B",
        amountEuros: 140000,
        source: "DOMESTIC",
        catBActivityYear: 1,
      },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.cat_b_coefficient).toBe(0.375);
  });

  it("sets cat_b_coefficient to 0.5625 for Cat B Year 2 (Art. 31(18) CIRS)", async () => {
    await saveIncomeEvents([
      {
        taxYear: 2026,
        category: "B",
        amountEuros: 100000,
        source: "DOMESTIC",
        catBActivityYear: 2,
      },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.cat_b_coefficient).toBe(0.5625);
  });

  it("does NOT include cat_b_coefficient key for Cat A events", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 50000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(Object.keys(row)).not.toContain("cat_b_coefficient");
  });

  it("uses FOREIGN for source and includes sourceCountry", async () => {
    await saveIncomeEvents([
      {
        taxYear: 2026,
        category: "E",
        amountEuros: 20000,
        source: "FOREIGN",
        sourceCountry: "GB",
      },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.source).toBe("FOREIGN");
    expect(row.source_country).toBe("GB");
  });

  /**
   * Regression: Cat G (capital gains / incrementos patrimoniais) domestic income
   * must be persisted with source='PT' and no cat_b_coefficient (Art. 10 CIRS).
   * IncomeClassifier Rule 5 (Art. 68 CIRS) classifies this as PROGRESSIVE —
   * the conservative safe default.
   * NOTE: Art. 72(1)(b) CIRS autonomous 28% rate and Art. 43(2) CIRS 50% inclusion
   * are not yet modelled in the engine.
   */
  it("saves Cat G (capital gains) DOMESTIC income with correct DB mapping", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "G", amountEuros: 50000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.category).toBe("G");
    expect(row.source).toBe("PT");
    expect(row.gross_amount_cents).toBe(5_000_000);
    expect(Object.keys(row)).not.toContain("cat_b_coefficient");
  });

  // Art. 5 CIRS — Cat E covers investment income (rendimentos de capitais)
  it("saves Cat E DOMESTIC income with source PT and no coefficient", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "E", amountEuros: 8000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.category).toBe("E");
    expect(row.source).toBe("PT");
    expect(row.gross_amount_cents).toBe(800_000);
    expect(Object.keys(row)).not.toContain("cat_b_coefficient");
  });

  // Art. 5 CIRS — Cat E foreign investment income from a DTA country
  it("saves Cat E FOREIGN income with source country", async () => {
    await saveIncomeEvents([
      {
        taxYear: 2026,
        category: "E",
        amountEuros: 15000,
        source: "FOREIGN",
        sourceCountry: "US",
      },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.category).toBe("E");
    expect(row.source).toBe("FOREIGN");
    expect(row.source_country).toBe("US");
    expect(row.gross_amount_cents).toBe(1_500_000);
  });

  // Art. 8 CIRS — Cat F covers rental income (rendimentos prediais)
  it("saves Cat F DOMESTIC rental income with source PT", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "F", amountEuros: 24000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.category).toBe("F");
    expect(row.source).toBe("PT");
    expect(row.gross_amount_cents).toBe(2_400_000);
  });

  // Art. 8 CIRS — Cat F foreign rental income
  it("saves Cat F FOREIGN rental income with source country", async () => {
    await saveIncomeEvents([
      {
        taxYear: 2026,
        category: "F",
        amountEuros: 36000,
        source: "FOREIGN",
        sourceCountry: "DE",
      },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.source).toBe("FOREIGN");
    expect(row.source_country).toBe("DE");
  });

  // Art. 10 CIRS — Cat G foreign capital gains
  it("saves Cat G FOREIGN capital gains with source country", async () => {
    await saveIncomeEvents([
      {
        taxYear: 2026,
        category: "G",
        amountEuros: 100000,
        source: "FOREIGN",
        sourceCountry: "GB",
      },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.category).toBe("G");
    expect(row.source).toBe("FOREIGN");
    expect(row.source_country).toBe("GB");
    expect(row.gross_amount_cents).toBe(10_000_000);
  });

  // Art. 11 CIRS — Cat H covers pension income (rendimentos de pensões)
  it("saves Cat H DOMESTIC pension income with no coefficient", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "H", amountEuros: 18000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.category).toBe("H");
    expect(row.source).toBe("PT");
    expect(row.gross_amount_cents).toBe(1_800_000);
    expect(Object.keys(row)).not.toContain("cat_b_coefficient");
  });

  // Art. 11 CIRS — Cat H foreign pension income
  it("saves Cat H FOREIGN pension income with source country", async () => {
    await saveIncomeEvents([
      {
        taxYear: 2026,
        category: "H",
        amountEuros: 30000,
        source: "FOREIGN",
        sourceCountry: "FR",
      },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.category).toBe("H");
    expect(row.source).toBe("FOREIGN");
    expect(row.source_country).toBe("FR");
  });

  // Art. 31(1)(d) CIRS — Cat B Year 3+ uses standard 0.75 coefficient
  it("sets cat_b_coefficient to 0.75 for Cat B Year 3 (Art. 31 CIRS)", async () => {
    await saveIncomeEvents([
      {
        taxYear: 2026,
        category: "B",
        amountEuros: 80000,
        source: "DOMESTIC",
        catBActivityYear: 3,
      },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.cat_b_coefficient).toBe(0.75);
  });

  // Batch insert — verify multiple heterogeneous events are saved in a single call
  it("saves multiple events in one call with correct per-row mapping", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 50000, source: "DOMESTIC" },
      {
        taxYear: 2026,
        category: "B",
        amountEuros: 100000,
        source: "DOMESTIC",
        catBActivityYear: 1,
      },
      { taxYear: 2026, category: "G", amountEuros: 30000, source: "DOMESTIC" },
    ]);
    const rows = mockInsert.mock.calls[0]![0]!;
    expect(rows.length).toBe(3);
    expect(rows[0].category).toBe("A");
    expect(rows[1].category).toBe("B");
    expect(rows[1].cat_b_coefficient).toBe(0.375);
    expect(rows[2].category).toBe("G");
    expect(Object.keys(rows[2])).not.toContain("cat_b_coefficient");
  });

  // Decimal.js conversion: verifying correct euro→cents using project convention
  // (Decimal.js prevents IEEE 754 floating-point artifacts in monetary math)
  it("converts 19.99 euros to 1999 cents (Decimal.js precision)", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 19.99, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.gross_amount_cents).toBe(1999);
  });

  it("converts 99999.99 euros to 9999999 cents (large amount Decimal.js)", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 99999.99, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.gross_amount_cents).toBe(9999999);
  });

  it("converts 0.01 euros to 1 cent exactly", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 0.01, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0]![0]![0]!;
    expect(row.gross_amount_cents).toBe(1);
  });
});

describe("deleteIncomeEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-abc" } } });
  });

  it("returns error when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await deleteIncomeEvent("evt-1");
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("calls delete with both id and user_id conditions", async () => {
    const eqSpy = vi.fn().mockReturnThis();
    eqSpy.mockImplementation(() => ({ eq: eqSpy, error: null }));
    mockDelete.mockReturnValue({ eq: eqSpy });

    // Override the final .eq() to resolve
    const resolvedEq = vi.fn().mockResolvedValue({ error: null });
    eqSpy.mockReturnValueOnce({ eq: resolvedEq });

    await deleteIncomeEvent("evt-42");

    // First .eq should be called with "id"
    expect(eqSpy).toHaveBeenCalledWith("id", "evt-42");
    // Second .eq should be called with "user_id"
    expect(resolvedEq).toHaveBeenCalledWith("user_id", "user-abc");
  });
});
