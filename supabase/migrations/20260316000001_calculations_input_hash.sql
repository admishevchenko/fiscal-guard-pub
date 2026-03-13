-- Add input_hash column to calculations table for idempotent recalculation.
-- The hash is a SHA-256 of (profile + events) payload; if the existing row
-- matches the computed hash, the dashboard skips the delete+insert cycle.
-- This prevents data bloat and race conditions from repeated page renders.

ALTER TABLE calculations
  ADD COLUMN input_hash TEXT;

-- Index for fast lookup by user + year (already has a non-unique index,
-- but adding the hash column allows the idempotency check to use it)
CREATE INDEX IF NOT EXISTS idx_calculations_user_year_hash
  ON calculations (user_id, tax_year, input_hash);

-- Policy: RLS is already enabled on calculations via the DB trigger.
-- No new policy needed — existing user_id = auth.uid() policies cover this column.
