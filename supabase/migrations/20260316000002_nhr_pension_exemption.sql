-- Add NHR pension exemption election column for pre-2020 NHR holders.
-- Lei n.º 2/2020 (OE 2020), Art. 12 transitional provision:
-- NHR holders registered before 2020-01-01 may ELECT to maintain the
-- original pension exemption (PENSION_EXEMPT) for their remaining 10-year
-- period. Without this election, the 10% rate (PENSION_10PCT) applies.
-- Irrelevant for post-2019 NHR registrations and IFICI holders.

ALTER TABLE tax_profiles
  ADD COLUMN nhr_pension_exemption_elected BOOLEAN NOT NULL DEFAULT FALSE;

-- RLS policy already covers tax_profiles via existing user_id = auth.uid() policies.
-- No new policy needed for this column.
