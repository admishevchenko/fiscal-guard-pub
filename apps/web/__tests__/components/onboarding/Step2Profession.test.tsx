import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step2Profession } from "@/components/onboarding/Step2Profession";

// Step2Profession depends on ELIGIBLE_PROFESSION_CODES and SUSPECT_PROFESSION_CODES
// from @fiscal-guard/tax-engine (real data, no mock needed).

describe("Step2Profession", () => {
  const defaultProps = {
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  it("renders the profession code input and reference table summary", () => {
    render(<Step2Profession {...defaultProps} />);
    expect(screen.getByLabelText(/profession code/i)).toBeInTheDocument();
    expect(screen.getByText(/common eligible codes/i)).toBeInTheDocument();
  });

  it("shows eligible badge for code 2131 (IT / Information systems)", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    await user.type(screen.getByLabelText(/profession code/i), "2131");
    // The eligible badge shows unique text about qualifying for the 20% flat rate
    expect(
      await screen.findByText(/qualifies for the 20%/i)
    ).toBeInTheDocument();
  });

  it("shows amber suspect badge for a suspect code", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    // 2433 is in SUSPECT_PROFESSION_CODES (financial analyst — ambiguous eligibility)
    await user.type(screen.getByLabelText(/profession code/i), "2433");
    // The suspect badge contains this unique phrase
    expect(
      await screen.findByText(/conservative progressive rate/i)
    ).toBeInTheDocument();
  });

  it("shows red not-recognised badge for unknown code", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    await user.type(screen.getByLabelText(/profession code/i), "0000");
    // The unknown badge contains this unique phrase
    expect(
      await screen.findByText(/not in the Portaria/i)
    ).toBeInTheDocument();
  });

  it("renders at least 5 rows in the reference code table", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    // Open the details element
    const summary = screen.getByText(/common eligible codes/i);
    await user.click(summary);

    const rows = screen.getAllByRole("button", { name: /^\d{4}/ });
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it("clicking a reference row fills the code input", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    const summary = screen.getByText(/common eligible codes/i);
    await user.click(summary);

    const row2132 = screen.getByRole("button", { name: /2132/i });
    await user.click(row2132);

    expect(screen.getByLabelText(/profession code/i)).toHaveValue("2132");
  });

  it("calls onBack when the Back button is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<Step2Profession {...defaultProps} onBack={onBack} />);

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("calls onNext with the code when form is submitted with a valid code", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Step2Profession onNext={onNext} onBack={vi.fn()} />);

    const input = screen.getByLabelText(/profession code/i);
    await user.type(input, "2131");
    // Wait for state update — input must show the value before submitting
    await screen.findByDisplayValue("2131");

    await user.click(screen.getByRole("button", { name: /next/i }));

    // react-hook-form passes (data, event) to the submit handler
    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ professionCode: "2131" }),
      expect.anything()
    );
  });
});
