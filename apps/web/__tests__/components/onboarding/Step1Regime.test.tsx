import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step1Regime } from "@/components/onboarding/Step1Regime";

// Step1Regime is a pure React form — no router or server action usage.

describe("Step1Regime", () => {
  it("renders all required fields", () => {
    render(<Step1Regime onNext={vi.fn()} />);
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    // Regime radios are present
    expect(screen.getByRole("radio", { name: /NHR/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /IFICI/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/regime entry date/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("shows Zod validation errors on empty submit", async () => {
    const user = userEvent.setup();
    render(<Step1Regime onNext={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /next/i }));
    // displayName is required — minimum 2 chars
    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
  });

  it("calls onNext with NHR data when form is valid", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Step1Regime onNext={onNext} />);

    await user.type(screen.getByLabelText(/your name/i), "Maria Silva");
    await user.click(screen.getByText(/NHR -- Non-Habitual Resident/i));
    // Use fireEvent.change for type="date" inputs — jsdom's date input needs
    // the value set directly rather than character-by-character typing.
    fireEvent.change(screen.getByLabelText(/regime entry date/i), {
      target: { value: "2022-01-15" },
    });
    await user.click(screen.getByRole("button", { name: /next/i }));

    // react-hook-form passes (data, event) to the submit handler
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Maria Silva",
        regime: "NHR",
        regimeEntryDate: "2022-01-15",
      }),
      expect.anything()
    );
  });

  it("calls onNext with IFICI data when IFICI is selected", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Step1Regime onNext={onNext} />);

    await user.type(screen.getByLabelText(/your name/i), "João Costa");
    await user.click(screen.getByText(/IFICI -- Innovation/i));
    fireEvent.change(screen.getByLabelText(/regime entry date/i), {
      target: { value: "2025-03-01" },
    });
    await user.click(screen.getByRole("button", { name: /next/i }));

    // react-hook-form passes (data, event) to the submit handler
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        regime: "IFICI",
        displayName: "João Costa",
      }),
      expect.anything()
    );
  });

  it("shows validation error for a date before 2009", async () => {
    const user = userEvent.setup();
    render(<Step1Regime onNext={vi.fn()} />);

    await user.type(screen.getByLabelText(/your name/i), "Test User");
    await user.click(screen.getByText(/NHR -- Non-Habitual Resident/i));
    fireEvent.change(screen.getByLabelText(/regime entry date/i), {
      target: { value: "2005-01-01" },
    });
    await user.click(screen.getByRole("button", { name: /next/i }));

    // FormMessage renders the Zod refinement message — no role="alert" in shadcn
    expect(await screen.findByText(/after 2009/i)).toBeInTheDocument();
  });
});
