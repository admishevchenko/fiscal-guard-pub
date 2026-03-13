# Fiscal Guard — Copilot Instructions

## Project Overview
**Fiscal Guard** is a tax-tech SaaS for Portugal **NHR/IFICI** regime residents.
It automates tax calculations, income classification, and compliance reporting.
Legal foundation: **Portaria n.º 352/2024** (in force for 2026 tax year).

---

## Stack

| Layer        | Technology                                             |
|--------------|--------------------------------------------------------|
| Web          | Next.js 16 (App Router, using proxy.ts for request interception), TypeScript, Tailwind, shadcn/ui |
| Mobile       | Expo SDK 52+, Expo Router, React Native                |
| Backend / DB | Supabase (PostgreSQL 16) — **eu-central-1 Frankfurt**  |
| Monorepo     | Turborepo + pnpm workspaces                            |
| Auth         | Supabase Auth (JWT); RLS enforced on every table       |
| Business Logic | Shared `packages/tax-engine`                         |

---

## Infrastructure Rules
- **All** Supabase/cloud infrastructure must reside in **eu-central-1 (Frankfurt)**.
- No data must be stored or processed outside the EU (GDPR compliance).
- Supabase project URL must contain `eu-central-1` in the host string.

---

## Legal & Tax Rules (Portaria n.º 352/2024)
- NHR regime: **20% flat rate** on Portuguese-sourced income.
- Foreign income from DTA countries: **exempt** under the exemption method.
- IFICI regime: successor to NHR for post-2024 applicants; same 20% rate with innovation activity bonus.
- Eligible high-value activities defined in the **Annex to Portaria n.º 352/2024** (profession codes).
- **10-year lock-in**: track `regime_entry_date`; no re-application after exit.
- Capital income from **blacklisted jurisdictions** (Portaria n.º 150/2004 list): taxed at general progressive rates, not 20%.
- Always cite the specific law article in code comments when implementing a tax rule .
-Per Ordinance 292/2025, Hong Kong, Liechtenstein, and Uruguay are NO LONGER blacklisted as of Jan 2026. Do not apply the 35% aggravated rate to these jurisdictions.
---

## Workflow & Conventions

### Code
- TypeScript strict mode (`strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`).
- All monetary values stored and computed as **integer cents** (never floats).However, tax rate calculations and intermediate coefficients must use Decimal.js with 8-decimal precision to prevent rounding errors before final cent conversion
- All dates stored as **ISO 8601 strings** in UTC.
- Tax logic lives exclusively in `packages/tax-engine` — never inline in UI components.
- All code changes are reviewed by anvil/anvil agent for tax logic, schema design, and security-sensitive code. Models used by anvil are gpt-5.4 and gemini-3-pro-preview, with a temperature of 0.2 for deterministic feedback.
### Database
- Every table **must** have RLS enabled (`ALTER TABLE … ENABLE ROW LEVEL SECURITY`).
- RLS policy pattern: `auth.uid() = user_id` for all CRUD operations.
- Migration files named: `YYYYMMDDHHMMSS_description.sql`.
- Never use `SERIAL`; use `gen_random_uuid()` for primary keys.
Note: Automatic RLS is enabled via DB trigger. Copilot does not need to emit 'ENABLE ROW LEVEL SECURITY' but MUST generate the 'CREATE POLICY' for every new table immediately.
### Reviews
- Use the **`anvil/anvil`** agent for any evidence-based review of tax logic, schema design, or security-sensitive code.
- All tax calculation functions must have unit tests that cite the applicable law article in the test description.

### Region Check
- CI must reject any Supabase URL that does not contain `eu-central-1`.

---

## Monorepo Structure
```
fiscal-guard-2026/
├── apps/
│   ├── web/          # Next.js 16 App Router
│   └── mobile/       # Expo SDK 52+
├── packages/
│   ├── db/           # Supabase migrations + generated types
│   ├── tax-engine/   # NHR/IFICI calculators + income classifier
│   └── types/        # Shared TypeScript types
├── supabase/
│   ├── migrations/   # SQL migration files
│   └── seed.sql      # Static 2026 tax rates & profession codes
└── .github/
    ├── copilot-instructions.md
    └── workflows/    # CI/CD
```

---

## Starting Workflow
1. Scaffold **database schema** (`supabase/migrations/`) with automatic RLS.
2. Implement **`packages/tax-engine`** — `TaxEngine`, `NHRCalculator`, `IFICICalculator`, `IncomeClassifier`.
3. Scaffold **Next.js 16** web app with Supabase SSR auth.
4. Scaffold **Expo** mobile app.
5. Configure **CI/CD** with migration runner and eu-central-1 enforcement.
