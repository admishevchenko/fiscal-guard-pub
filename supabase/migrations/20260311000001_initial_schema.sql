-- =============================================================================
-- Migration: 20260311000001_initial_schema.sql
-- Fiscal Guard — Core schema
-- Legal basis: Portaria n.º 352/2024 (NHR/IFICI regimes)
--
-- NOTE: ENABLE ROW LEVEL SECURITY statements are emitted as a block at the
--       bottom of this file, after all tables and policies are defined.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Custom types
-- ---------------------------------------------------------------------------

-- Art. 16 CIRS (NHR) / Art. 58-A EBF (IFICI)
CREATE TYPE tax_regime AS ENUM ('NHR', 'IFICI');

-- CIRS income categories
CREATE TYPE income_category AS ENUM ('A', 'B', 'E', 'F', 'G', 'H');

-- Income source origin
CREATE TYPE income_source AS ENUM ('PT', 'FOREIGN');

-- ---------------------------------------------------------------------------
-- Table: profiles
-- Mirrors auth.users; created automatically on user signup via trigger.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  -- Portuguese NIF (Número de Identificação Fiscal), 9 digits
  nif           TEXT CHECK (nif ~ '^\d{9}$'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies: profiles
CREATE POLICY "profiles: owner select"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "profiles: owner insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles: owner update"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles: owner delete"
  ON public.profiles FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Table: tax_profiles
-- One row per user per regime application.
-- Art. 16(9) CIRS: 10-year lock-in; no re-application after exit.
-- Portaria n.º 352/2024, Art. 2: IFICI eligible profession requirement.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  regime                 tax_regime NOT NULL,
  -- ISO 8601 UTC date regime was granted
  regime_entry_date      DATE NOT NULL,
  -- NULL while active; set on exit (voluntary or 10-year expiry)
  -- Art. 16(9) CIRS: regime is valid for 10 consecutive years
  regime_exit_date       DATE,
  -- CNAEF profession code from Portaria n.º 352/2024 Annex
  profession_code        TEXT NOT NULL,
  -- IFICI: TRUE if user performs an innovation/R&D activity
  is_innovation_activity BOOLEAN NOT NULL DEFAULT FALSE,
  -- A user may not hold more than one ACTIVE regime concurrently.
  -- Art. 16(9) CIRS / Art. 58-A(7) EBF: 10-year regime; no concurrent NHR+IFICI.
  -- Enforced via partial unique index below (after CREATE TABLE) rather than
  -- a table constraint, so historical (exited) rows are permitted.
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: at most one row per user where regime_exit_date IS NULL (active).
-- Art. 16(9) CIRS / Art. 58-A(7) EBF — cannot hold NHR and IFICI simultaneously.
CREATE UNIQUE INDEX idx_tax_profiles_one_active_regime
  ON public.tax_profiles (user_id)
  WHERE regime_exit_date IS NULL;

CREATE POLICY "tax_profiles: owner select"
  ON public.tax_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "tax_profiles: owner insert"
  ON public.tax_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tax_profiles: owner update"
  ON public.tax_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tax_profiles: owner delete"
  ON public.tax_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Table: income_events
-- Each discrete income item for a tax year.
-- All monetary values in EUR **integer cents** (never float).
-- FX rate stored as TEXT to preserve Decimal.js 8dp precision.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.income_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_year             SMALLINT NOT NULL CHECK (tax_year >= 2024),
  -- ISO 3166-1 alpha-2 country code of income source
  source_country       CHAR(2) NOT NULL,
  source               income_source NOT NULL,
  category             income_category NOT NULL,
  -- Gross income in EUR cents (integer)
  gross_amount_cents   BIGINT NOT NULL CHECK (gross_amount_cents >= 0),
  -- ISO 4217 original currency before EUR conversion
  original_currency    CHAR(3) NOT NULL DEFAULT 'EUR',
  -- EUR FX rate as Decimal string (e.g. "1.08340000")
  fx_rate_to_eur       TEXT NOT NULL DEFAULT '1.00000000',
  description          TEXT,
  -- CNAEF / Annex profession code (required for Cat A/B eligibility)
  profession_code      TEXT,
  -- ISO 8601 UTC timestamp of receipt
  received_at          TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_income_events_user_year ON public.income_events (user_id, tax_year);
CREATE INDEX idx_income_events_source_country ON public.income_events (source_country);

CREATE POLICY "income_events: owner select"
  ON public.income_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "income_events: owner insert"
  ON public.income_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "income_events: owner update"
  ON public.income_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "income_events: owner delete"
  ON public.income_events FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Table: calculations
-- Stored results of a TaxEngine run for a given user + tax year.
-- All amounts in EUR integer cents.
-- Rates stored as TEXT (Decimal.js serialisation, 8dp).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calculations (
  id                                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_profile_id                        UUID NOT NULL REFERENCES public.tax_profiles(id) ON DELETE CASCADE,
  tax_year                              SMALLINT NOT NULL CHECK (tax_year >= 2024),
  -- PT income subject to 20% flat rate (Art. 72 CIRS / Portaria 352/2024 Art. 4)
  pt_taxable_income_cents               BIGINT NOT NULL DEFAULT 0,
  -- Foreign income exempt under DTA (exemption method)
  foreign_exempt_income_cents           BIGINT NOT NULL DEFAULT 0,
  -- Income from blacklisted jurisdictions (Portaria 150/2004, post-Ord.292/2025)
  blacklisted_jurisdiction_income_cents BIGINT NOT NULL DEFAULT 0,
  -- Tax at 20% flat rate
  flat_rate_tax_cents                   BIGINT NOT NULL DEFAULT 0,
  -- Tax on blacklisted jurisdiction income at progressive rates
  progressive_tax_cents                 BIGINT NOT NULL DEFAULT 0,
  -- Total tax liability
  total_tax_cents                       BIGINT NOT NULL DEFAULT 0,
  -- Effective rate as Decimal string
  effective_rate                        TEXT NOT NULL DEFAULT '0.00000000',
  -- JSON snapshot of rates, regime, and legal references used
  calculation_metadata                  JSONB NOT NULL DEFAULT '{}',
  created_at                            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calculations_user_year ON public.calculations (user_id, tax_year);

CREATE POLICY "calculations: owner select"
  ON public.calculations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "calculations: owner insert"
  ON public.calculations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Calculations are intentionally append-only but the policy is declared
-- explicitly to avoid silent default-deny surprises in application code.
CREATE POLICY "calculations: owner update"
  ON public.calculations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "calculations: owner delete"
  ON public.calculations FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Table: documents
-- References to files uploaded to Supabase Storage.
-- Actual binary stored in storage; this table holds metadata only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Supabase Storage object path (bucket/path)
  storage_path    TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  -- File size in bytes
  size_bytes      BIGINT NOT NULL CHECK (size_bytes > 0),
  -- Optional link to an income event
  income_event_id UUID REFERENCES public.income_events(id) ON DELETE SET NULL,
  -- Optional link to a calculation
  calculation_id  UUID REFERENCES public.calculations(id) ON DELETE SET NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_user ON public.documents (user_id);

CREATE POLICY "documents: owner select"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "documents: owner insert"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE policy: documents are append-only metadata.
-- To replace a file: delete the row and insert a new one.
-- This prevents silent metadata drift from the underlying storage object.

CREATE POLICY "documents: owner delete"
  ON public.documents FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Enable Row Level Security on all tables
-- NOTE: Policies are declared immediately after each CREATE TABLE above.
-- RLS must be explicitly enabled per table — PostgreSQL does not enable it
-- automatically. A DB-level trigger cannot substitute for this statement.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents              ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Trigger: updated_at auto-maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tax_profiles_updated_at
  BEFORE UPDATE ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_income_events_updated_at
  BEFORE UPDATE ON public.income_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger: auto-create profile on auth.users insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
