-- Add input_hash column to calculations table for idempotent recalculation.
-- The hash is a SHA-256 of (profile + events) payload; if the existing row
-- matches the computed hash, the dashboard skips the recalculation entirely.
-- This prevents data bloat and race conditions from repeated page renders.

ALTER TABLE calculations
  ADD COLUMN input_hash TEXT;

-- Unique constraint: only one calculation row per user per tax year.
-- Prevents duplicate rows from concurrent requests (TOCTOU race).
-- The upsert in calculateTaxAction uses this constraint via ON CONFLICT.
ALTER TABLE calculations
  ADD CONSTRAINT uq_calculations_user_year UNIQUE (user_id, tax_year);

-- Index for fast idempotency lookups by hash
CREATE INDEX IF NOT EXISTS idx_calculations_user_year_hash
  ON calculations (user_id, tax_year, input_hash);

-- Policy: RLS is already enabled on calculations via the DB trigger.
-- No new policy needed — existing user_id = auth.uid() policies cover this column.
