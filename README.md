# Equity AI

An AI-powered fundamental equity research platform. Equity AI helps an
investor understand what they're investing in — not just see more numbers
about it — by structuring verified financial data, scoring companies on a
transparent, explainable model, and continuously monitoring followed
companies for changes that actually matter.

The full product principles (Fundamental Score, the FACT → CALCULATION →
AI INTERPRETATION separation, progressive disclosure, "professional first,
beginner-friendly second") are documented in [`docs/product/`](docs/product/).

## ⚠️ Status: demo/development, not production-verified

Before anything else: this repository contains a **real, working backend
architecture** and a **real, typed frontend** — but almost nothing in it has
been run against live external services yet, because the environment this
was assembled in has no outbound network access. See
[`docs/product/README.md`](docs/product/README.md) and the sections below
for the precise, honest line between **what is verified** and **what is
ready to verify** once this repo is opened somewhere with real network
access (e.g. Claude Code on your machine).

## Repository structure

```
equity-ai/
├── backend/                  Real backend: schema, ingestion, scoring, API
│   ├── schema/                 SQL migrations (run in numeric order)
│   ├── src/
│   │   ├── types/               Shared domain types
│   │   ├── providers/            FinancialDataProvider interface + adapters
│   │   │   └── adapters/           fmpAdapter.ts (real), unavailableProvider.ts (honest stub)
│   │   ├── ingestion/             validate → normalize → store pipeline
│   │   ├── calculations/           Deterministic financial metric formulas
│   │   ├── scoring/                calculateFundamentalScore() engine
│   │   ├── changeDetection/         Importance scoring + change events
│   │   ├── ai/                      AI interpretation service (fact/interpretation boundary)
│   │   ├── api/                     Express routes
│   │   ├── db/                      Supabase client
│   │   └── localDev/                Zero-dependency local harness (see below)
│   ├── tests/                  Unit + mocked-integration tests (vitest)
│   ├── package.json, tsconfig.json, .env.example
│   └── README.md               Full backend documentation
│
├── frontend/                 Real frontend: Vite + React + TypeScript
│   ├── src/
│   │   ├── lib/                  Typed API client, fixtures, hooks
│   │   ├── components/            Reusable UI primitives
│   │   └── pages/                  Route-level pages
│   ├── package.json, tsconfig.json, .env.example
│   └── README.md               Full frontend documentation
│
├── docs/
│   ├── product/                The product/architecture specifications
│   │   └── README.md             (see this first — explains what "Product Bible" means here)
│   └── prototypes/
│       └── prototype-1.2/      Current UX reference prototype (demo-fixture only)
│
├── README.md                 This file
└── .gitignore
```

## How frontend and backend relate

The frontend is built directly against the backend's real, documented
endpoint contracts (`GET /companies/:id/scores`, `/analysis`, `/financials`,
`/changes`, etc. — see `backend/src/api/routes/*.ts`), not against any
assumption of what those endpoints might return. `frontend/src/lib/types.ts`
mirrors the backend's actual response shapes field-for-field.

The frontend runs in one of two modes, controlled by a single env var:

- **Demo mode** (`VITE_API_BASE_URL` unset): every page runs on fixtures in
  `frontend/src/lib/fixtures.ts`, shaped exactly like the real API responses,
  with a visible "Demo data" banner on every page that's using them.
- **Live mode** (`VITE_API_BASE_URL` set to a running backend): the exact
  same components fetch real data. No UI code changes required to switch.

## How Supabase is used

The backend's canonical data model (companies, financial facts, calculated
metrics, scores, change events, alerts, watchlists — 21 tables in total) is
Postgres/Supabase. The schema is in `backend/schema/001_core_tables.sql`
through `005_seed_companies.sql`, meant to be run in that numeric order. A
`buildSupabaseIngestionRepo()` implementation
(`backend/src/ingestion/supabaseIngestionRepo.ts`) writes real ingested data
into it, and the API layer (`backend/src/api/routes/*.ts`) reads from it via
`backend/src/db/client.ts`.

**Not yet verified against a real Supabase project** — see "What is
verified vs. ready to verify" below.

## How FMP is used

`backend/src/providers/adapters/fmpAdapter.ts` is a real
`FinancialDataProvider` implementation calling Financial Modeling Prep's
income-statement endpoint. It is deliberately scoped to **revenue only**,
**NVIDIA (NVDA) only**, **annual period only**, as the first proof that a
real data point can travel through the whole pipeline correctly (see
"First real-data milestone" below). It reads `FMP_API_KEY` from the
environment — see Environment Variables below — and is wired in
automatically by `backend/src/providers/registry.ts` whenever that variable
is set; otherwise the registry falls back to an adapter that honestly
returns "unavailable" rather than fabricating data.

## Environment variables

Copy each `.env.example` to `.env` in its own directory and fill in real
values. **Never commit `.env` files** — `.gitignore` already excludes them.

**`backend/.env.example`:**

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Real Supabase project connection |
| `ANTHROPIC_API_KEY` | Powers the AI Investment Thesis service |
| `INTERNAL_SERVICE_TOKEN` | Auth for `/internal/*` admin endpoints (separate from user auth) |
| `FMP_API_KEY` | Financial Modeling Prep — read only by `fmpAdapter.ts` |

**`frontend/.env.example`:**

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend URL. Unset = demo mode. |
| `VITE_DEMO_USER_ID` | Sent as `x-user-id` until the backend has real auth |

No API key is ever hardcoded anywhere in this repository — verified by an
explicit secret scan before packaging (see the accompanying delivery report).

## Install & run

```bash
# Backend
cd backend
npm install
cp .env.example .env   # fill in real values
npm test                # unit + mocked-adapter tests — no credentials needed
npm run dev              # full API (Express + Supabase) on :3000 — needs SUPABASE_* set
npm run dev:local         # zero-dependency local harness — no database needed at all, see below

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env   # leave VITE_API_BASE_URL empty for demo mode
npm run dev              # http://localhost:5173
```

### Applying the Supabase schema

Run the SQL files in `backend/schema/` **in numeric order** against your
Supabase project (via the SQL editor, or `psql $DATABASE_URL -f <file>` for
each), 001 through 005. `005_seed_companies.sql` seeds company identity rows
only (name/ticker/exchange/sector) for 10 companies — no financial facts are
seeded, since those must come from real ingestion.

### `npm run dev:local` — a zero-dependency way to see the real engine run

`backend/src/localDev/server.ts` runs the **actual, unmodified**
`calculateFundamentalScore()` engine, calculation functions, and ingestion
validators over an in-memory store instead of Postgres — no database, no
API keys, no `npm install` even required in an environment with Node 22+
(`npx ts-node --transpile-only src/localDev/server.ts`). This was run for
real while building this repository (see backend/README.md for the actual
captured output and a bug it caught). It's a sanity check and local dev
convenience, not a substitute for the real Supabase-backed API.

## First real-data milestone: NVIDIA revenue

```bash
cd backend
npm install
# .env must have FMP_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY set,
# and the schema (001-005) already applied
npm run test:fmp-nvda
```

This runs `backend/src/localDev/testFmpNvidiaRevenue.ts`, which calls the
real, unmodified `ingestIncomeStatement()` pipeline — FMP → validate →
normalize → `raw_financial_data` → `financial_metrics` — for NVIDIA revenue
specifically, and prints the 8-point proof (endpoint used, request success,
FMP's actual value, both database rows, the `source_id` link to
`data_sources`, period/currency/period_type, and confirmation nothing was
invented along the way). See `backend/README.md` for full detail.

## What is VERIFIED vs. READY TO VERIFY

**Verified** (actually executed, with real output captured):
- The scoring engine, calculation functions, and ingestion validators run
  correctly end-to-end (`backend/src/localDev/server.ts`, executed with
  Node's native TypeScript support — real output in `backend/README.md`).
- The FMP adapter's parsing/validation logic is correct against a mocked
  HTTP response (26/26 assertions passed — see `backend/README.md` and
  `backend/tests/fmpAdapter.test.ts`), including that the API key never
  leaks into a stored URL.
- No secrets exist anywhere in this repository (explicit scan — see the
  delivery report).

**Ready to verify, not yet verified** (needs real network access this
assembly environment didn't have):
- A real Supabase connection (schema application, real reads/writes).
- A real FMP API call (`npm run test:fmp-nvda` against a real key).
- The full backend test suite via `npm test` (needs `npm install` against
  the real npm registry).
- The frontend build/dev server via `npm install && npm run dev`.
- End-to-end: frontend fetching real backend data over HTTP.

None of these are expected to fail — the code was written and,
where executable at all in this environment, tested against that
constraint — but "written and locally logic-tested" is not the same claim
as "verified against live infrastructure," and this README does not
conflate the two.

## Testing

```bash
cd backend && npm test
```

Runs `backend/tests/*.test.ts` (vitest): calculation engine, ingestion
validators/normalizers, scoring engine (against an in-memory fake repo),
change detection, AI-output-schema validation, and the FMP adapter (against
a mocked `fetch`). **All of these are unit/mocked tests — none require real
credentials or network access, and none of them are integration tests
against live FMP or Supabase.** `backend/src/localDev/testFmpNvidiaRevenue.ts`
is the one real integration test in this repo, and it's clearly separated
from the mocked suite specifically because it requires real credentials —
see the "First real-data milestone" section above.

## Prototype 1.2

`docs/prototypes/prototype-1.2/` contains the current UX reference
prototype — a single-file, demo-fixture-only React artifact used to test
the product's information architecture before it's built into the real
frontend. It is **not** the production frontend and is **not** wired to any
API. See its own README for detail.
