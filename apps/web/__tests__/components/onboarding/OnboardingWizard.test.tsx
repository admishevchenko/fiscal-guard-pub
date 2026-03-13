import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => mockSearchParams,
}));

// Mock server actions
vi.mock("@/actions/profile", () => ({
  saveTaxProfile: vi.fn().mockResolvedValue({}),
  saveIncomeEvents: vi.fn().mockResolvedValue({}),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

async function completeStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/your name/i), "Test User");
  await user.click(screen.getByText(/NHR -- Non-Habitual Resident/i));
  // Use fireEvent.change for type="date" inputs in jsdom
  fireEvent.change(screen.getByLabelText(/regime entry date/i), {
    target: { value: "2022-01-01" },
  });
  await user.click(screen.getByRole("button", { name: /next/i }));
}

async function completeStep2(user: ReturnType<typeof userEvent.setup>) {
  const input = screen.getByLabelText(/profession code/i);
  await user.type(input, "2131");
  await screen.findByDisplayValue("2131");
  await user.click(screen.getByRole("button", { name: /next/i }));
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("renders Step 1 by default (Regime & dates label visible)", () => {
    render(<OnboardingWizard />);
    expect(screen.getByText(/regime & dates/i)).toBeInTheDocument();
  });

  it("advances to Step 2 (Profession code) after completing Step 1", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    await completeStep1(user);

    // The step progress label is "Profession code" in a <span>; the form label
    // reads "Profession code (CPP 2010)" — use the form label to be specific
    expect(await screen.findByText(/profession code \(CPP 2010\)/i)).toBeInTheDocument();
  });

  it("advances to Step 3 (Income events) after completing Step 2", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    await completeStep1(user);
    await completeStep2(user);

    expect(await screen.findByText(/income events/i)).toBeInTheDocument();
  });

  it("starts at Step 3 when ?step=income is in searchParams", () => {
    mockSearchParams = new URLSearchParams("step=income");
    render(<OnboardingWizard />);

    // Income events label shown and step 1 label not the current step
    expect(screen.getByText(/income events/i)).toBeInTheDocument();
    // The regime & dates step label should NOT appear as the active header
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
  });

  it("goes back to Step 1 from Step 2 when Back is clicked", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    await completeStep1(user);
    await user.click(await screen.findByRole("button", { name: /back/i }));

    expect(await screen.findByLabelText(/your name/i)).toBeInTheDocument();
  });

  it("shows 33% progress on Step 1", () => {
    render(<OnboardingWizard />);
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("shows 67% progress on Step 2", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    await completeStep1(user);

    expect(await screen.findByText("67%")).toBeInTheDocument();
  });

  it("shows 100% progress on Step 3", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    await completeStep1(user);
    await completeStep2(user);

    expect(await screen.findByText("100%")).toBeInTheDocument();
  });

  it("does NOT call saveTaxProfile when entering via ?step=income", async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams("step=income");
    const { saveTaxProfile, saveIncomeEvents } = await import("@/actions/profile");

    render(<OnboardingWizard />);

    // Fill amount and submit
    const amountInput = screen.getByLabelText(/amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "60000");
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(saveTaxProfile).not.toHaveBeenCalled();
    expect(saveIncomeEvents).toHaveBeenCalled();
  });

  it("calls both saveTaxProfile and saveIncomeEvents on full flow submit", async () => {
    const user = userEvent.setup();
    const { saveTaxProfile, saveIncomeEvents } = await import("@/actions/profile");

    render(<OnboardingWizard />);

    await completeStep1(user);
    await completeStep2(user);

    const amountInput = await screen.findByLabelText(/amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "50000");
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(saveTaxProfile).toHaveBeenCalled();
    expect(saveIncomeEvents).toHaveBeenCalled();
  });
});
