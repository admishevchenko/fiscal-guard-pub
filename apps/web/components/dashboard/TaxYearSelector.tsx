"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface TaxYearSelectorProps {
  currentYear: number;
  /** Range of years to show, from earliest to latest */
  minYear?: number;
  maxYear?: number;
}

export function TaxYearSelector({
  currentYear,
  minYear = 2024,
  // Match the income form's TAX_YEARS range (currentYear + 1) so events added
  // for the upcoming year are always selectable. Previously capped at
  // currentYear which hid events entered for year+1 via the income form.
  maxYear = new Date().getFullYear() + 1,
}: TaxYearSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    years.push(y);
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const year = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", year);
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <select
      value={currentYear}
      onChange={handleChange}
      className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="Select tax year"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
