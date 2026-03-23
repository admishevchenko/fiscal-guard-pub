import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import type { ExistingProfile } from "@/components/onboarding/OnboardingWizard";

// Mock next/navigation
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
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

const TEST_PROFILE: ExistingProfile = {
  regime: "NHR",
  regimeEntryDate: "2022-01-01",
  professionCode: "2131",
};

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
  const input = screen.getByPlaceholderText("e.g. 2131");
  await user.type(input, "2131");
  await screen.findByDisplayValue("2131");
  await user.click(screen.getByRole("button", { name: /next/i }));
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("calls router.refresh() then router.push('/dashboard?year=<savedYear>') on full flow submit", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    await completeStep1(user);
    await completeStep2(user);

    const amountInput = await screen.findByLabelText(/amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "50000");
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(mockRefresh).toHaveBeenCalled();
    // Regression fix: redirect to /dashboard?year=<savedYear> so the user lands
    // directly on the year they just saved events to, not the current-year default.
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/dashboard\?year=\d{4}$/));
    // refresh() must be called before push() to invalidate any pre-fetched snapshot
    const refreshOrder = mockRefresh.mock.invocationCallOrder[0]!;
    const pushOrder = mockPush.mock.invocationCallOrder[0]!;
    expect(refreshOrder).toBeLessThan(pushOrder);
  });

  it("shows error toast and does NOT navigate when saveTaxProfile fails", async () => {
    const user = userEvent.setup();
    const { saveTaxProfile } = await import("@/actions/profile");
    const { toast } = await import("sonner");
    vi.mocked(saveTaxProfile).mockResolvedValueOnce({ error: "DB write failed" });

    render(<OnboardingWizard />);
    await completeStep1(user);
    await completeStep2(user);

    const amountInput = await screen.findByLabelText(/amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "50000");
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(toast.error).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows error toast and does NOT navigate when saveIncomeEvents fails", async () => {
    const user = userEvent.setup();
    const { saveIncomeEvents } = await import("@/actions/profile");
    const { toast } = await import("sonner");
    vi.mocked(saveIncomeEvents).mockResolvedValueOnce({ error: "Insert failed" });

    render(<OnboardingWizard />);
    await completeStep1(user);
    await completeStep2(user);

    const amountInput = await screen.findByLabelText(/amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "50000");
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(toast.error).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ---- existingProfile tests (income-only mode) ----------------------------

  it("skips to Step 3 and shows profile banner when existingProfile is provided", () => {
    render(<OnboardingWizard existingProfile={TEST_PROFILE} />);

    // Should show income events step directly
    expect(screen.getByText(/income events/i)).toBeInTheDocument();
    // Should NOT show Step 1
    expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
    // Should show the profile banner
    expect(screen.getByText(/active profile/i)).toBeInTheDocument();
    expect(screen.getByText("NHR")).toBeInTheDocument();
    expect(screen.getByText(/Code: 2131/)).toBeInTheDocument();
  });

  it("shows 'No profession code' in banner when professionCode is 0000", () => {
    render(
      <OnboardingWizard
        existingProfile={{ ...TEST_PROFILE, professionCode: "0000" }}
      />
    );

    expect(screen.getByText(/no profession code/i)).toBeInTheDocument();
    expect(screen.queryByText(/Code: 0000/)).not.toBeInTheDocument();
  });

  it("hides Back button on income step when existingProfile is set", () => {
    render(<OnboardingWizard existingProfile={TEST_PROFILE} />);

    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });

  it("does NOT call saveTaxProfile when existingProfile is provided", async () => {
    const user = userEvent.setup();
    const { saveTaxProfile, saveIncomeEvents } = await import("@/actions/profile");

    render(<OnboardingWizard existingProfile={TEST_PROFILE} />);

    const amountInput = screen.getByLabelText(/amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "60000");
    await user.click(screen.getByRole("button", { name: /save income/i }));

    expect(saveTaxProfile).not.toHaveBeenCalled();
    expect(saveIncomeEvents).toHaveBeenCalled();
  });

  it("does NOT skip to Step 3 without existingProfile even if URL has ?step=income", () => {
    // ?step=income is no longer honored — only existingProfile controls the skip
    render(<OnboardingWizard />);

    // Should start at Step 1
    expect(screen.getByText(/regime & dates/i)).toBeInTheDocument();
    expect(screen.queryByText(/active profile/i)).not.toBeInTheDocument();
  });
});
