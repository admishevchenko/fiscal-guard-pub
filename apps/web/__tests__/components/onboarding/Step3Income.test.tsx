import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step3Income } from "@/components/onboarding/Step3Income";

// Mock sonner to capture toasts
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("Step3Income", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders one income event row by default", () => {
    render(<Step3Income {...defaultProps} />);
    expect(screen.getByText("Event 1")).toBeInTheDocument();
    expect(screen.queryByText("Event 2")).not.toBeInTheDocument();
  });

  it("appends a second row when '+ Add income event' is clicked", async () => {
    const user = userEvent.setup();
    render(<Step3Income {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /\+ add income event/i }));

    expect(screen.getByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("Event 2")).toBeInTheDocument();
  });

  it("hides the Remove button when only one row exists", () => {
    render(<Step3Income {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("shows Remove buttons when two rows exist", async () => {
    const user = userEvent.setup();
    render(<Step3Income {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /\+ add income event/i }));

    const removeButtons = screen.getAllByRole("button", { name: /remove/i });
    expect(removeButtons.length).toBe(2);
  });

  it("shows coefficient field when Cat B is selected", async () => {
    const user = userEvent.setup();
    render(<Step3Income {...defaultProps} />);

    // Click the Category B option in the dropdown for the first event row
    // Radix Select: click the trigger then the option
    const categoryTriggers = screen.getAllByRole("combobox");
    // taxYear is index 0, category is index 1
    await user.click(categoryTriggers[1]!);
    const optionB = await screen.findByRole("option", { name: /B — Self-employment/i });
    await user.click(optionB);

    expect(
      await screen.findByText(/regime simplificado year/i)
    ).toBeInTheDocument();
  });

  it("does not show coefficient field when Cat A is selected (default)", () => {
    render(<Step3Income {...defaultProps} />);
    // Default is Cat A
    expect(screen.queryByText(/regime simplificado year/i)).not.toBeInTheDocument();
  });

  it("shows source country input when FOREIGN is selected", async () => {
    const user = userEvent.setup();
    render(<Step3Income {...defaultProps} />);

    const foreignRadio = screen.getByRole("radio", { name: /foreign/i });
    await user.click(foreignRadio);

    expect(
      await screen.findByLabelText(/source country/i)
    ).toBeInTheDocument();
  });

  it("hides source country input when DOMESTIC is selected", () => {
    render(<Step3Income {...defaultProps} />);
    // Default is DOMESTIC
    expect(screen.queryByLabelText(/source country/i)).not.toBeInTheDocument();
  });

  it("shows remote-work warning when Cat B + FOREIGN selected", async () => {
    const user = userEvent.setup();
    render(<Step3Income {...defaultProps} />);

    const categoryTrigger = screen.getAllByRole("combobox")[1]!;
    await user.click(categoryTrigger);
    await user.click(screen.getByRole("option", { name: /B — Self-employment/i }));

    const foreignRadio = screen.getByRole("radio", { name: /foreign/i });
    await user.click(foreignRadio);

    expect(await screen.findByText(/Art. 81 CIRS/i)).toBeInTheDocument();
  });

  it("calls onSubmit with valid Cat A domestic event", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Step3Income onSubmit={onSubmit} onBack={vi.fn()} />);

    // Clear the default amount and enter a valid value
    const amountInput = screen.getByLabelText(/amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "50000");

    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          category: "A",
          source: "DOMESTIC",
          amountEuros: 50000,
        }),
      ])
    );
  });

  it("does not pass NaN as amountEuros when field is cleared", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Step3Income onSubmit={onSubmit} onBack={vi.fn()} />);

    const amountInput = screen.getByLabelText(/amount/i);
    await user.clear(amountInput);

    // Check the input value shows empty string, not "NaN"
    expect(amountInput).toHaveValue(null);
  });

  it("shows error toast when submitting with no source country on FOREIGN event", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    render(<Step3Income {...defaultProps} />);

    const foreignRadio = screen.getByRole("radio", { name: /foreign/i });
    await user.click(foreignRadio);

    // Do NOT fill sourceCountry, then submit
    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/fix the highlighted errors/i)
    );
  });

  it("calls onBack when Back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<Step3Income onSubmit={vi.fn()} onBack={onBack} />);

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("disables Finish setup button while isSubmitting is true", () => {
    render(<Step3Income {...defaultProps} isSubmitting={true} />);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
  });

  it.each([
    ["E", /E — Capital income/i],
    ["F", /F — Property rental/i],
    ["G", /G — Capital gains/i],
    ["H", /H — Pensions/i],
  ] as const)("submits successfully with category %s selected", async (catCode, catLabel) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Step3Income onSubmit={onSubmit} onBack={vi.fn()} />);

    // Select category
    const categoryTriggers = screen.getAllByRole("combobox");
    await user.click(categoryTriggers[1]!); // index 1 = category
    const option = await screen.findByRole("option", { name: catLabel });
    await user.click(option);

    // Fill amount
    const amountInput = screen.getByLabelText(/amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, "25000");

    await user.click(screen.getByRole("button", { name: /finish setup/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ category: catCode, amountEuros: 25000 }),
      ])
    );
  });

  it.each(["E", "F", "G", "H"])("does not show coefficient field for category %s", async (cat) => {
    const user = userEvent.setup();
    render(<Step3Income {...defaultProps} />);

    const labels: Record<string, RegExp> = {
      E: /E — Capital income/i,
      F: /F — Property rental/i,
      G: /G — Capital gains/i,
      H: /H — Pensions/i,
    };

    const categoryTriggers = screen.getAllByRole("combobox");
    await user.click(categoryTriggers[1]!);
    const option = await screen.findByRole("option", { name: labels[cat]! });
    await user.click(option);

    expect(screen.queryByText(/regime simplificado year/i)).not.toBeInTheDocument();
  });

  it("rejects amount with more than 2 decimal places on submit", async () => {
    const { toast } = await import("sonner");
    const onSubmit = vi.fn();
    render(<Step3Income onSubmit={onSubmit} onBack={vi.fn()} />);

    // Use fireEvent.change to set the value — userEvent.type + step="0.01"
    // triggers jsdom's HTML5 constraint validation which blocks the submit
    // event before React Hook Form's resolver runs.
    const amountInput = screen.getByLabelText(/amount/i);
    fireEvent.change(amountInput, { target: { value: "100.123" } });

    // Submit via fireEvent.submit to bypass HTML5 step constraint validation
    fireEvent.submit(amountInput.closest("form")!);

    // Zod resolver is async — wait for the validation error callback
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
