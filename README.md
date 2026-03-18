# Fiscal Guard 2026

Tax-tech SaaS for Portugal **NHR / IFICI** regime residents. Automates tax calculations, income classification, and compliance reporting for the 2026 tax year.

Legal foundation: **Portaria n.º 352/2024**, Lei n.º 2/2020, Art. 31 CIRS.

---

## Stack

| Layer        | Technology                                       |
| ------------ | ------------------------------------------------ |
| Web          | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui |
| Backend / DB | Supabase (PostgreSQL 16) — **eu-central-1 Frankfurt** |
| Monorepo     | Turborepo + pnpm workspaces                      |
| Auth         | Supabase Auth (magic link); RLS on every table   |
| Tax Logic    | Shared `packages/tax-engine`                     |
| Testing      | Vitest (unit/component) + Playwright (E2E)       |

---

## Monorepo Structure

```
fiscal-guard-2026/
├── apps/
│   └── web/                # Next.js 16 App Router
├── packages/
│   ├── tax-engine/         # NHR/IFICI calculators, income classifier, blacklist
│   └── types/              # Shared TypeScript types
├── supabase/
│   └── migrations/         # PostgreSQL migration files
├── turbo.json              # Turborepo pipeline config
├── pnpm-workspace.yaml
└── tsconfig.json           # Root TS config (strict mode)
```

### Key Packages

| Package | Purpose |
| ------- | ------- |
| `@fiscal-guard/web` | Next.js app — dashboard, onboarding wizard, auth |
| `@fiscal-guard/tax-engine` | `TaxEngine`, `NHRCalculator`, `IFICICalculator`, `IncomeClassifier`, `BlacklistValidator`, `ProgressiveTaxCalculator` |
| `@fiscal-guard/types` | Shared TypeScript type definitions |

---

## Prerequisites

- **Node.js** ≥ 20.0.0
- **pnpm** ≥ 9.0.0 (exact: `pnpm@9.15.4`)
- **Supabase CLI** (optional — for migration management)

```bash
# Install pnpm if you don't have it
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/admishevchenko/fiscal-guard-pub.git
cd fiscal-guard-pub
pnpm install
```

### 2. Environment Variables

Create `apps/web/.env.local` with the following variables:

```env
# Supabase project (eu-central-1 Frankfurt — GDPR required)
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Region guard — must be eu-central-1 (enforced at build time)
NEXT_PUBLIC_SUPABASE_REGION=eu-central-1
```

> ⚠️ The app **will not start** if `NEXT_PUBLIC_SUPABASE_REGION` is not `eu-central-1`. This enforces EU data residency (GDPR).

### 3. Database Setup

If you have the Supabase CLI linked to your project:

```bash
# Link to your Supabase project
npx supabase link --project-ref <your-project-ref>

# Push all migrations
npx supabase db push --linked
```

Migrations are in `supabase/migrations/` and include:
- `20260311000001_initial_schema.sql` — Core tables (tax_profiles, income_events, calculations)
- `20260311000002_static_tax_data.sql` — 2026 tax brackets and rates
- `20260312110822_tax_reasoning_log.sql` — Audit trail for classification reasoning
- `20260312211516_cat_b_coefficient.sql` — Regime simplificado (Art. 31 CIRS)
- `20260315000001_enable_rls_reasoning_log.sql` — RLS for reasoning log
- `20260316000001_calculations_input_hash.sql` — Idempotency (SHA-256 dedup)
- `20260316000002_nhr_pension_exemption.sql` — Lei 2/2020 Art. 12 pension election
- `20260316000003_reasoning_log_delete_policy.sql` — DELETE policy for log cleanup

### 4. Build Packages

The tax-engine and types packages must be compiled before the web app can use them:

```bash
pnpm build
```

This runs `turbo build` which builds in dependency order: `types` → `tax-engine` → `web`.

---

## Running Locally

### Development Server

```bash
# Start all workspaces in dev mode (recommended)
pnpm dev

# Or start only the web app
cd apps/web
pnpm dev
```

The app will be available at **http://localhost:3000**.

### What to Expect

1. **Login page** (`/login`) — Magic link auth via Supabase
2. **Onboarding wizard** (`/onboarding`) — 3-step setup: regime → profession code → income events
3. **Dashboard** (`/dashboard`) — Tax summary card, income events panel, breakdown chart, regime comparison

### Debugging Tips

- **Hot reload** is enabled via Next.js Turbopack (default in Next.js 16)
- **React Compiler** is active — no manual `useMemo`/`useCallback` needed
- **TypeScript errors** won't block the dev server but will show in the terminal and browser overlay
- To type-check manually:
  ```bash
  pnpm type-check
  ```
- If you modify types in `packages/tax-engine/src/types.ts`, rebuild the package:
  ```bash
  cd packages/tax-engine && pnpm build
  ```

### Environment Troubleshooting

| Problem | Solution |
| ------- | ------- |
| `NEXT_PUBLIC_SUPABASE_REGION must be "eu-central-1"` | Set `NEXT_PUBLIC_SUPABASE_REGION=eu-central-1` in `.env.local` |
| `Could not find column 'X' in the schema cache` | Run `npx supabase db push --linked` to apply migrations |
| Tax-engine import errors | Run `pnpm build` from root to compile workspace packages |
| Turbopack root detection issues | Already handled in `next.config.ts` — ensure you run from monorepo root |

---

## Testing

### Unit & Component Tests (Vitest)

```bash
# Run all tests (root — includes tax-engine + web)
pnpm test

# Run web tests only
cd apps/web
pnpm test

# Watch mode (re-runs on file change)
pnpm test:watch

# Interactive UI
pnpm test:ui
```

**134 tests** across 8 test files covering:
- Server actions (`actions/tax.ts`, `actions/profile.ts`)
- Onboarding wizard components (Step1Regime, Step2Profession, Step3Income, OnboardingWizard)
- Dashboard components (TaxSummaryCard, IncomeEventsPanel)
- Tax engine calculators (NHR, IFICI, Progressive, IncomeClassifier, BlacklistValidator)

### E2E Tests (Playwright)

```bash
cd apps/web

# Run all E2E tests (auto-starts dev server)
pnpm test:e2e

# Run with UI mode
npx playwright test --ui

# Run specific spec
npx playwright test e2e/dashboard.spec.ts
```

E2E specs: `auth.spec.ts`, `dashboard.spec.ts`, `onboarding.spec.ts`, `tax-calculation.spec.ts`

Browsers: Chromium, Firefox, Mobile Chrome (Pixel 5).

### First-Time Playwright Setup

```bash
npx playwright install
```

---

## Available Scripts

### Root (Turborepo)

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | Start all packages in dev mode |
| `pnpm build` | Build all packages (dependency order) |
| `pnpm test` | Run all Vitest test suites |
| `pnpm type-check` | TypeScript check across all packages |
| `pnpm lint` | Lint all packages |
| `pnpm db:push` | Push Supabase migrations |
| `pnpm db:reset` | Reset linked Supabase DB |

### Web App (`apps/web`)

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | Next.js dev server (port 3000) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm test` | Run Vitest unit/component tests |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm test:ui` | Vitest interactive UI |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm type-check` | TypeScript strict check |

### Tax Engine (`packages/tax-engine`)

| Command | Description |
| ------- | ----------- |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm test` | Run tax calculation tests |
| `pnpm test:watch` | Watch mode |

---

## TypeScript Configuration

The project enforces strict TypeScript:

- `strict: true`
- `exactOptionalPropertyTypes: true` — cannot assign `undefined` to optional props
- `noUncheckedIndexedAccess: true` — array/object index access may be `undefined`

**Tip:** With `exactOptionalPropertyTypes`, use the spread pattern instead of ternary for optional props:
```ts
// ✅ Correct
{ ...(value !== undefined ? { prop: value } : {}) }

// ❌ Will error
{ prop: condition ? value : undefined }
```

---

## Tax Rules Reference

| Rule | Article | Description |
| ---- | ------- | ----------- |
| NHR flat rate | Art. 72(10) CIRS | 20% on PT-source income for eligible professions |
| IFICI flat rate | Art. 58-A(1) EBF | 20% + innovation bonus for post-2024 applicants |
| DTA exemption | Art. 81 CIRS | Foreign income from DTA countries exempt |
| Blacklist surcharge | Portaria n.º 150/2004 | 35% on income from blacklisted jurisdictions |
| Regime simplificado | Art. 31 CIRS | Cat B coefficient: Yr1=37.5%, Yr2=56.25%, Yr3+=75% |
| Pension (NHR legacy) | Lei 2/2020, Art. 12 | Pre-2020 NHR: 0% if elected; post-2020: 10% |
| Profession eligibility | Portaria n.º 352/2024 Annex | CPP 2010 codes qualifying for flat rate |
| De-listed jurisdictions | Ordinance 292/2025 | HK, LI, UY no longer blacklisted as of Jan 2026 |

---

## Infrastructure Rules

- **All** Supabase infrastructure must reside in **eu-central-1 (Frankfurt)**
- No data stored or processed outside the EU (GDPR)
- Region check enforced at build time in `next.config.ts`
- Every database table has **RLS enabled** with `auth.uid() = user_id` policies
- All monetary values stored as **integer cents** (never floats)
- Tax rate calculations use **Decimal.js** with 8-decimal precision
- All dates stored as **ISO 8601 strings** in UTC

---

## License

Private — all rights reserved.
