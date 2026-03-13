-- Migration: 20260316000003_reasoning_log_delete_policy.sql
--
-- Adds a DELETE policy to tax_reasoning_log so the idempotent
-- calculateTaxAction can clear stale reasoning rows before inserting
-- fresh ones on recalculation.
--
-- Without this policy, the DELETE in tax.ts is silently rejected by RLS
-- and stale rows accumulate indefinitely.

CREATE POLICY "Users can delete own reasoning log"
  ON tax_reasoning_log
  FOR DELETE
  USING (auth.uid() = user_id);
