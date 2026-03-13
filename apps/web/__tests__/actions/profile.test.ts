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
    const row = mockInsert.mock.calls[0][0][0];
    expect(row.source).toBe("PT");
  });

  it("converts euro amount to integer cents", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 140000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0][0][0];
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
    const row = mockInsert.mock.calls[0][0][0];
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
    const row = mockInsert.mock.calls[0][0][0];
    expect(row.cat_b_coefficient).toBe(0.5625);
  });

  it("does NOT include cat_b_coefficient key for Cat A events", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "A", amountEuros: 50000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0][0][0];
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
    const row = mockInsert.mock.calls[0][0][0];
    expect(row.source).toBe("FOREIGN");
    expect(row.source_country).toBe("GB");
  });

  /**
   * Regression test for Cat G (capital gains / incrementos patrimoniais) domestic income.
   * Per Art. 10 CIRS, Cat G domestic → source='PT', no cat_b_coefficient.
   * IncomeClassifier will classify this as PROGRESSIVE (Art. 68 CIRS).
   */
  it("saves Cat G (capital gains) DOMESTIC income with correct DB mapping", async () => {
    await saveIncomeEvents([
      { taxYear: 2026, category: "G", amountEuros: 50000, source: "DOMESTIC" },
    ]);
    const row = mockInsert.mock.calls[0][0][0];
    expect(row.category).toBe("G");
    expect(row.source).toBe("PT");
    expect(row.gross_amount_cents).toBe(5_000_000);
    expect(Object.keys(row)).not.toContain("cat_b_coefficient");
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
