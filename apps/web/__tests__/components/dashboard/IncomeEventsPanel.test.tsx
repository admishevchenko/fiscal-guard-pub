import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncomeEventsPanel, type IncomeEventRow } from "@/components/dashboard/IncomeEventsPanel";

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock("@/actions/profile", () => ({
  deleteIncomeEvent: vi.fn().mockResolvedValue({}),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function makeEvent(overrides: Partial<IncomeEventRow> = {}): IncomeEventRow {
  return {
    id: "evt-1",
    taxYear: 2026,
    category: "A",
    grossAmountCents: 5_000_000,
    taxableAmountCents: 5_000_000,
    source: "PT",
    sourceCountry: "PT",
    description: null,
    treatment: "FLAT_20",
    taxCents: 1_000_000,
    ...overrides,
  };
}

describe("IncomeEventsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when events array is empty", () => {
    render(<IncomeEventsPanel events={[]} taxYear={2026} />);
    expect(screen.getByText(/no income events for 2026/i)).toBeInTheDocument();
  });

  it("renders '20% Flat rate' badge for FLAT_20 treatment", () => {
    render(<IncomeEventsPanel events={[makeEvent()]} taxYear={2026} />);
    expect(screen.getByText(/20% flat rate/i)).toBeInTheDocument();
  });

  it("renders 'Progressive' destructive badge for PROGRESSIVE treatment", () => {
    render(
      <IncomeEventsPanel
        events={[makeEvent({ treatment: "PROGRESSIVE" })]}
        taxYear={2026}
      />
    );
    expect(screen.getByText(/progressive/i)).toBeInTheDocument();
  });

  it("renders 'DTA Exempt (0%)' secondary badge for DTA_EXEMPT treatment", () => {
    render(
      <IncomeEventsPanel
        events={[makeEvent({ treatment: "DTA_EXEMPT", source: "FOREIGN", sourceCountry: "GB" })]}
        taxYear={2026}
      />
    );
    expect(screen.getByText(/DTA Exempt/i)).toBeInTheDocument();
  });

  it("shows Art. 31 CIRS reduction note when taxableAmount differs from grossAmount", () => {
    // Cat B Year 1: €140,000 gross → €52,500 taxable
    render(
      <IncomeEventsPanel
        events={[
          makeEvent({
            category: "B",
            grossAmountCents: 14_000_000,
            taxableAmountCents: 5_250_000,
            treatment: "FLAT_20",
          }),
        ]}
        taxYear={2026}
      />
    );
    expect(screen.getByText(/Art. 31 CIRS/i)).toBeInTheDocument();
  });

  it("does NOT show reduction note when taxable equals gross", () => {
    render(
      <IncomeEventsPanel
        events={[makeEvent({ grossAmountCents: 5_000_000, taxableAmountCents: 5_000_000 })]}
        taxYear={2026}
      />
    );
    expect(screen.queryByText(/Art. 31 CIRS/i)).not.toBeInTheDocument();
  });

  it("calls deleteIncomeEvent with correct id on delete click", async () => {
    const user = userEvent.setup();
    const { deleteIncomeEvent } = await import("@/actions/profile");

    render(<IncomeEventsPanel events={[makeEvent({ id: "evt-42" })]} taxYear={2026} />);

    await user.click(screen.getByTitle(/delete income event/i));

    expect(deleteIncomeEvent).toHaveBeenCalledWith("evt-42");
  });

  it("shows success toast after successful delete", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");

    render(<IncomeEventsPanel events={[makeEvent()]} taxYear={2026} />);
    await user.click(screen.getByTitle(/delete income event/i));

    expect(toast.success).toHaveBeenCalledWith(
      expect.stringMatching(/income event deleted/i)
    );
  });

  it("shows error toast when delete action returns an error", async () => {
    const user = userEvent.setup();
    const { deleteIncomeEvent } = await import("@/actions/profile");
    const { toast } = await import("sonner");

    vi.mocked(deleteIncomeEvent).mockResolvedValueOnce({ error: "Forbidden" });

    render(<IncomeEventsPanel events={[makeEvent()]} taxYear={2026} />);
    await user.click(screen.getByTitle(/delete income event/i));

    expect(toast.error).toHaveBeenCalledWith("Forbidden");
  });

  it("'+ Add income' link points to /onboarding?step=income", () => {
    render(<IncomeEventsPanel events={[]} taxYear={2026} />);
    const link = screen.getByRole("link", { name: /\+ add income/i });
    expect(link).toHaveAttribute("href", "/onboarding?step=income");
  });

  it("shows 🇵🇹 Domestic for PT source", () => {
    render(<IncomeEventsPanel events={[makeEvent({ source: "PT" })]} taxYear={2026} />);
    expect(screen.getByText(/🇵🇹 Domestic/)).toBeInTheDocument();
  });

  it("shows 🌍 + country code for FOREIGN source", () => {
    render(
      <IncomeEventsPanel
        events={[makeEvent({ source: "FOREIGN", sourceCountry: "GB" })]}
        taxYear={2026}
      />
    );
    expect(screen.getByText(/🌍 GB/)).toBeInTheDocument();
  });
});
