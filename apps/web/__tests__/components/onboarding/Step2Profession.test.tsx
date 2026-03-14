import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step2Profession } from "@/components/onboarding/Step2Profession";

// Step2Profession depends on ELIGIBLE_PROFESSION_CODES and SUSPECT_PROFESSION_CODES
// from @fiscal-guard/tax-engine (real data, no mock needed).

/** Helper: get the profession code <input> (excludes the "no code" checkbox). */
function getProfessionInput() {
  return screen.getByPlaceholderText("e.g. 2131");
}

describe("Step2Profession", () => {
  const defaultProps = {
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  it("renders the profession code input and reference table summary", () => {
    render(<Step2Profession {...defaultProps} />);
    expect(getProfessionInput()).toBeInTheDocument();
    expect(screen.getByText(/common eligible codes/i)).toBeInTheDocument();
  });

  it("shows eligible badge for code 2131 (IT / Information systems)", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    await user.type(getProfessionInput(), "2131");
    expect(
      await screen.findByText(/qualifies for the 20%/i)
    ).toBeInTheDocument();
  });

  it("shows amber suspect badge for a suspect code", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    await user.type(getProfessionInput(), "2433");
    expect(
      await screen.findByText(/conservative progressive rate/i)
    ).toBeInTheDocument();
  });

  it("shows red not-recognised badge for unknown code", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    await user.type(getProfessionInput(), "9999");
    expect(
      await screen.findByText(/not in the Portaria/i)
    ).toBeInTheDocument();
  });

  it("renders at least 5 rows in the reference code table", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

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

    expect(getProfessionInput()).toHaveValue("2132");
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

    const input = getProfessionInput();
    await user.type(input, "2131");
    await screen.findByDisplayValue("2131");

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ professionCode: "2131" }),
      expect.anything()
    );
  });

  it("sets profession code to 0000 when 'no profession code' checkbox is checked", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<Step2Profession onNext={onNext} onBack={vi.fn()} />);

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);

    // Input should be hidden; info banner should appear
    expect(screen.queryByPlaceholderText("e.g. 2131")).not.toBeInTheDocument();
    expect(screen.getByText(/progressive rates/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({ professionCode: "0000" }),
      expect.anything()
    );
  });

  it("restores profession code input when 'no profession code' checkbox is unchecked", async () => {
    const user = userEvent.setup();
    render(<Step2Profession {...defaultProps} />);

    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox); // check
    expect(screen.queryByPlaceholderText("e.g. 2131")).not.toBeInTheDocument();

    await user.click(checkbox); // uncheck
    expect(screen.getByPlaceholderText("e.g. 2131")).toBeInTheDocument();
  });

  it("pre-selects checkbox when defaultValues has profession code 0000", () => {
    render(
      <Step2Profession
        {...defaultProps}
        defaultValues={{ professionCode: "0000" }}
      />
    );

    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.queryByPlaceholderText("e.g. 2131")).not.toBeInTheDocument();
  });
});
