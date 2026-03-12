-- Art. 31 CIRS: regime simplificado coefficient for Category B income.
-- NULL means not applicable (Cat A/E/F/G/H) or full coefficient assumed.
ALTER TABLE public.income_events
  ADD COLUMN IF NOT EXISTS cat_b_coefficient NUMERIC(12,8);
