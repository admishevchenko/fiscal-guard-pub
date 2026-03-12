-- Migration: 20260312110822_tax_reasoning_log.sql
--
-- Creates an audit log that records the machine-readable classification
-- reasoning produced by TaxEngine for every income event.
--
-- Purpose: "Evidence-first" compliance trail — auditors and AT inspectors
-- can replay any tax classification by querying this table and comparing
-- the reasoning JSON against the law articles cited.
--
-- Persisted by the web layer (apps/web) after every TaxEngine.calculate()
-- call, one row per ClassifiedEvent with a non-null reasoningJson.
-- Priority: rows where treatment = 'FLAT_20' or 'PENDING_MANUAL_REVIEW'
-- are especially important for audit defence.
--
-- GDPR: table is user-scoped via RLS (auth.uid() = user_id).
-- Region: eu-central-1 Frankfurt (enforced at Supabase project level).

CREATE TABLE IF NOT EXISTS tax_reasoning_log (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        NOT NULL,               -- auth.uid()
  tax_year        INTEGER     NOT NULL CHECK (tax_year BETWEEN 2020 AND 2099),
  event_id        TEXT        NOT NULL,               -- EngineIncomeEvent.id
  regime          TEXT        NOT NULL CHECK (regime IN ('NHR', 'IFICI')),
  treatment       TEXT        NOT NULL,               -- TaxTreatment value
  profession_code TEXT,                               -- CPP 2010 code, if applicable
  -- Machine-readable reasoning JSON produced by IncomeClassifier.
  -- Shape: { rule: string; code?: string; status: string; note?: string }
  reasoning       JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the most common query pattern: user + tax year audit retrieval
CREATE INDEX IF NOT EXISTS tax_reasoning_log_user_year_idx
  ON tax_reasoning_log (user_id, tax_year);

-- Index for compliance queries: "show me all FLAT_20 events with a given code"
CREATE INDEX IF NOT EXISTS tax_reasoning_log_treatment_code_idx
  ON tax_reasoning_log (treatment, profession_code)
  WHERE profession_code IS NOT NULL;

-- Index for pending manual review dashboard
CREATE INDEX IF NOT EXISTS tax_reasoning_log_pending_idx
  ON tax_reasoning_log (user_id, tax_year)
  WHERE treatment = 'PENDING_MANUAL_REVIEW';

-- RLS: Automatic RLS is enabled via DB trigger (per project convention).
-- Policy: users may only read/write their own reasoning log rows.

CREATE POLICY "Users can select own reasoning log"
  ON tax_reasoning_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reasoning log"
  ON tax_reasoning_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Reasoning log is append-only: no UPDATE or DELETE policies.
-- If a classification must be corrected, insert a new row with the correction
-- and mark the old row's reasoning JSON with { "superseded": true }.
-- This preserves a full audit trail per AT best practice.
