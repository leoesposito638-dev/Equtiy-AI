# Equity AI — Database & Scoring Engine (v1.0)

This is the real backend foundation behind the Equity AI prototype: schema,
provider abstraction, ingestion pipeline, calculation engine, scoring
engine, AI interpretation service, change detection, and API layer — built
per the blueprint, in the order specified (Phases 1–3 + the engine code for
6–11; see **What's real vs. stubbed** below for exactly where it stops).

## What's real vs. stubbed here

This sandbox has **no network access and no live Postgres/Supabase
instance** (confirmed — `npm install` returns a 403 from the registry, and
there are no database credentials available). Given that hard constraint,
here's exactly what was built and what wasn't, so nothing is overstated:

| Layer | Status |
|---|---|
| SQL schema (`schema/*.sql`) | **Real, complete.** Every table from the blueprint, with constraints, FKs, indexes, and check constraints matching the spec. Ready to run against a real Postgres/Supabase instance. |
| `companies` seed data | **Real identity data** for the 10 companies named in the blueprint (name/ticker/exchange/sector) — static reference data, not financial facts, so it's fine to seed directly. |
| Financial facts (revenue, margins, scores, etc.) | **Intentionally not seeded.** No fabricated numbers exist anywhere in this codebase — see `NO HARDCODED SCORES` below. |
| Provider interfaces (`src/providers/interfaces.ts`) | **Real, complete** — `MarketDataProvider`, `FinancialDataProvider`, `EarningsProvider`, `NewsProvider`, `FilingProvider`, exactly as specified. |
| Provider adapter | Only `unavailableProvider.ts` is implemented — it honestly returns `status: "unavailable"` for everything, because there are no vendor credentials or network access in this environment. This is also the reference implementation every real adapter should degrade to on failure. |
| Ingestion pipeline (`src/ingestion/`) | **Real, complete logic** — raw → validate → normalize → canonical. Fully unit tested (`tests/ingestion.test.ts`). Not runnable end-to-end here because it needs a real provider + a real database. |
| Calculation engine (`src/calculations/metrics.ts`) | **Real, complete, unit tested.** Every formula is null-safe and handles the brief's critical test cases (negative earnings, negative FCF, division by zero). |
| Scoring engine (`src/scoring/`) | **Real, complete, unit tested end-to-end against an in-memory fake repository** (`tests/scoring.test.ts`) — proving the 12-step pipeline, confidence/coverage math, and reproducibility without needing a live database. |
| AI service (`src/ai/`) | **Real service logic + real Anthropic API client**, with strict input (only verified structured data) and output (schema-validated JSON) boundaries. Not exercised end-to-end here (no network), but `tests/ai.test.ts` proves the validation boundary works. |
| Change detection (`src/changeDetection/`) | **Real, complete, unit tested.** |
| API layer (`src/api/`) | **Real Express app and routes** matching every endpoint in the blueprint. Handlers that need a live database (`GET /companies`, etc.) will throw a clear configuration error until `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are set. The four `/internal/*` trigger endpoints return `501` with an explicit explanation rather than pretending to run a pipeline that has nothing to connect to. |
| Tests | **Real, and they should pass** — but `npm install` fails in this sandbox (no registry access), so they have not actually been executed here. Run `npm install && npm test` in an environment with network access to verify. |

Nothing in this codebase invents a financial number, hardcodes a score, or
lets AI write to a facts table — those are structural guarantees (see
below), not just a promise in this README.

## How the "no fabrication" rule is enforced structurally, not just by convention

1. **Schema-level separation.** `financial_metrics`, `market_data`,
   `estimates`, `earnings` (FACTS) are physically separate tables from
   `calculated_metrics` (deterministic derivations) and
   `analysis_snapshots` / `investment_theses` (AI interpretation). The AI
   service (`src/ai/aiService.ts`) has no database write access at all in
   this codebase — it's a pure function from structured input to validated
   structured output; wiring its output to a table is a separate,
   explicit step.
2. **Every fact has a `source_id`.** `financial_metrics.source_id` and
   `raw_financial_data.data_source_id` are `NOT NULL` foreign keys into
   `data_sources`. There's no code path that writes a fact without one.
3. **Missing data stays missing.** Every calculation function in
   `src/calculations/metrics.ts` returns `null` — never `0`, never a
   guess — when a required input is absent. The scoring engine
   (`src/scoring/scoringEngine.ts`) propagates that into `dataCoverage`
   and `confidence`, which are always reported separately from `score`
   (see `tests/scoring.test.ts`, "confidence reflects data completeness").
4. **AI output is schema-validated before it can touch anything.**
   `src/ai/schema.ts` + `parseAiOutput` reject anything that isn't
   well-formed JSON matching the exact contract from the blueprint. A
   failed validation is a dropped response, never a partial save.
5. **Scoring config lives in the database, not in code.**
   `score_categories` and `score_rules` (seeded in
   `schema/004_seed_scoring_config.sql`) drive `scoreCategory()`
   (`src/scoring/categoryScorers/scoreCategory.ts`) — there is exactly one
   generic, config-driven scorer, not eight hardcoded category functions
   with weights baked into `if` statements.
6. **Everything that can change later is versioned.**
   `calculation_version` (`CALCULATION_VERSION = "v1.0"` in
   `src/calculations/metrics.ts`), `scoring_version`
   (`SCORING_VERSION` in `src/scoring/scoringEngine.ts`), and
   `ai_prompt_version` / model (`AI_PROMPT_VERSION`, `AI_MODEL` in
   `src/ai/aiService.ts`) are all explicit constants threaded through to
   the stored rows, so a past score is always reproducible under the
   version it was calculated with.

## Project layout

```
schema/                        SQL migrations, run in numeric order
  001_core_tables.sql           companies, data_sources, raw_financial_data,
                                 financial_metrics, market_data, estimates,
                                 earnings, company_events
  002_scoring_tables.sql        calculated_metrics, peer_groups, company_peers,
                                 metric_benchmarks, score_categories,
                                 score_rules, category_scores, fundamental_scores
  003_analysis_tables.sql       analysis_snapshots, investment_theses,
                                 change_events, alerts, watchlists,
                                 watchlist_companies
  004_seed_scoring_config.sql   score_categories + score_rules, version v1.0
  005_seed_companies.sql        10 companies, identity fields only

src/
  types/domain.ts               shared TS types mirroring the schema
  providers/
    interfaces.ts                MarketDataProvider, FinancialDataProvider,
                                  EarningsProvider, NewsProvider, FilingProvider
    adapters/unavailableProvider.ts   honest "no data" reference adapter
    registry.ts                  single place to swap in real adapters
  ingestion/
    validators.ts                 units/currency/period/duplicate/impossible-value checks
    normalizers.ts                 currency conversion, explicit FX only
    ingest.ts                      raw -> validate -> normalize -> canonical orchestration
  calculations/metrics.ts        growth, margins, ROIC/ROE, leverage, valuation — all null-safe
  scoring/
    percentile.ts                 percentile-against-benchmark scoring (no hard thresholds)
    confidence.ts                  score vs. confidence, kept separate
    categoryScorers/
      types.ts, scoreCategory.ts   ONE generic, config-driven category scorer
    scoringEngine.ts               calculateFundamentalScore(companyId) — the 12-step pipeline
    opportunityScore.ts            kept structurally separate from fundamental score
  ai/
    schema.ts                      zod schema + strict output validation
    aiService.ts                   structured-in / structured-out interpretation layer
    anthropicClient.ts             real /v1/messages client (needs ANTHROPIC_API_KEY)
  changeDetection/
    importance.ts                  importance_score = f(magnitude, history, peers, relevance, score impact)
    changeDetector.ts               diff two snapshots -> change_events -> alert drafts
  api/
    server.ts, auth.ts
    routes/companies.ts, search.ts, watchlists.ts, alerts.ts, internal.ts
  db/client.ts                    Supabase client factory (throws clearly if unconfigured)

tests/                           vitest — calculations, ingestion, scoring, change detection, AI validation
```

## Running this for real

```bash
npm install
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                        # ANTHROPIC_API_KEY, INTERNAL_SERVICE_TOKEN,
                        # and a FinancialDataProvider API key once you have one
npm run migrate         # then run schema/*.sql in order against that database
npm test                 # calculations / ingestion / scoring / change-detection / AI-validation suites
npm run dev               # starts the full API (Express + Supabase) on :3000
```

## Verified: the engine runs end to end, right now, with zero setup

`src/localDev/` is a small, additive local-dev harness — **not** a second
production path — that runs the real `calculateFundamentalScore` engine
(`src/scoring/scoringEngine.ts`, completely unmodified), the real
calculation functions, and the real ingestion `validateRawLineItem` /
`normalizeLineItem` pipeline, over Node's built-in `http` module, against an
in-memory store instead of Postgres. It needs no database, no vendor API
key, and — because Node 22 can run this project's TypeScript directly —
no `npm install` even. This was actually run (not just written) while
building it:

```bash
npm run dev:local
# Running the real scoring engine against local seed data (no database, no npm installs)...
#
# NVDA: baseline 56.4 (confidence 25%) -> current 63.8 (confidence 30%, coverage 30%), score_change 7.4
# MSFT: baseline 48.9 (confidence 25%) -> current 52.4 (confidence 30%, coverage 30%), score_change 3.5
#
# Ready. Serving on http://localhost:4000

curl http://localhost:4000/companies/NVDA/scores
curl http://localhost:4000/companies/NVDA/changes
curl http://localhost:4000/alerts
```

Every number above is genuinely computed from
`src/localDev/seedData.ts` — a handful of clearly-labeled illustrative
financial figures (**not** real filings) — through the real engine. Four of
the eight categories (Capital Allocation, Competitive Advantage,
Management, Earnings Momentum) intentionally have no seed data, so you'll
see their `score`/`confidence`/`coverage` come back as `0` — that's the
"missing data never fabricates a score" guarantee, observed live rather
than just asserted in a docstring.

**A real bug was found and fixed this way.** The first run showed NVDA's
overall fundamental score computed as `49.8` even though every category
that *did* have data was scoring 88–100. The cause: `scoringEngine.ts`'s
aggregation gave every category a 0.4× weight *floor* regardless of
confidence, so the four fully-unscored categories were still dragging the
total down as if "unknown" meant "bad." Fixed by making a category's
effective weight scale to true zero as its confidence approaches zero
(see the comment at the fix site in `src/scoring/scoringEngine.ts`); the
same inputs now correctly produce `63.8`. This is the kind of bug that
only shows up by actually running the code, not by reading it.

**What this does and doesn't prove:** it proves the scoring engine,
calculation functions, and ingestion validation are correct and free of
integration bugs, and it gives you a genuine backend to point the frontend
at (`VITE_API_BASE_URL=http://localhost:4000`) for local testing today. It
does **not** mean a production database or real financial data feed is
connected — `src/localDev/inMemoryRepo.ts` is explicitly separate from
`src/db/client.ts`, and going live still requires the Supabase + vendor
credentials described above. See the top of `src/localDev/server.ts` and
`src/localDev/seedData.ts` for the exact boundary.

## First real data source: Financial Modeling Prep (revenue, NVDA only)

`src/providers/adapters/fmpAdapter.ts` is the first REAL (non-"unavailable")
`FinancialDataProvider` adapter — it calls FMP's live REST API. Scope is
deliberately narrow, as a first proof of the full pipeline:

- `getIncomeStatement`: implemented for real, ANNUAL period, mapping only
  the `revenue` field into a `RawLineItem`. Adding `gross_profit`,
  `operating_income`, `net_income`, `eps`, etc. is additive — one more
  object in the array this function returns — and needs no change to
  `ingest.ts`, `validators.ts`, or `normalizers.ts`.
- `getBalanceSheet` / `getCashFlow`: intentionally return an honest
  `unavailable` result, not empty/fabricated data — not implemented yet.

`FMP_API_KEY` is read once, in `src/providers/adapters/fmpAdapter.ts`, from
`process.env` — never hardcoded, never logged, and stripped from any URL
before it's stored in `data_sources.source_url` or returned to a caller
(verified by a test — see below). It's also never imported by
the frontend project, so it can't reach the browser.

**New files:**
- `src/providers/adapters/fmpAdapter.ts` — the adapter itself
- `src/ingestion/supabaseIngestionRepo.ts` — real `IngestionRepo`
  implementation against Supabase (this didn't exist before; only an
  in-memory test double did)
- `src/localDev/testFmpNvidiaRevenue.ts` — the runnable integration test
- `tests/fmpAdapter.test.ts` — mocked-fetch unit tests

**Small edit:** `src/providers/registry.ts` now constructs
`FmpFinancialDataAdapter` when `FMP_API_KEY` is set, falling back to
`unavailableFinancialDataProvider` otherwise — exactly the pattern that
file's own TODO comment already sketched.

**Verified in this sandbox** (no real FMP/Supabase reachable here, but the
adapter's own logic was actually executed against a mocked HTTP response —
26/26 assertions passed): well-formed FMP responses parse correctly; an
empty FMP array, a missing `revenue` field, a missing `reportedCurrency`,
an HTTP error status, and a period mismatch (asked ANNUAL, FMP row says Q1)
all correctly return `status: "unavailable"` with a clear reason — never a
fabricated or zero-filled value; the API key never appears in the stored
`source_url`.

**To run the real, live version** (requires your own `FMP_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the schema already applied
with NVDA seeded):

```bash
npm install
npm run test:fmp-nvda
```

It resolves NVDA's `company_id`, calls the real, unmodified
`ingestIncomeStatement()` pipeline against FMP, and reads back the inserted
`raw_financial_data`, `financial_metrics`, and `data_sources` rows to print
all 8 proof points (endpoint used, request success, FMP's value, both DB
rows, the `source_id` linkage, period/currency/period_type, and confirmation
that `raw_financial_data.raw_value === financial_metrics.value` — nothing
was invented in between).

**Known limitation carried forward:** `getFxRate` in
`supabaseIngestionRepo.ts` always returns `undefined` — there's no
`fx_rates` table in the schema yet. Not a problem for NVDA (reports in
USD, matches `companies.currency`), but ingesting a company that reports in
a different currency will correctly fail normalization rather than guess a
conversion rate, until that table exists.

## Development phases — where this leaves off

Per the blueprint's phase ordering:

- ✅ **Phase 1** — Database schema (complete, all 21 tables)
- ✅ **Phase 2** — Seed 10 companies (identity only, as above)
- ✅ **Phase 3** — Provider abstraction (interfaces + registry + honest stub adapter)
- ⛔ **Phase 4** — Import real financial data — blocked on vendor API credentials + network access, neither available in this environment
- ➡️ **Phases 5–7** (normalize, derive, score) — the *code* is complete and unit tested against fakes; running it against real companies is Phase 4's dependency
- ➡️ **Phase 8** — Connect scores to the existing Company Page — the frontend prototype currently uses local mock state (`equity-ai-prototype.jsx`); swapping that for `GET /companies/:id/scores` etc. is a frontend data-fetching change, intentionally not made yet since there's no live API to point it at
- ➡️ **Phases 9–12** (AI analysis, change detection, alerts, discovery) — engine code complete and tested; wiring depends on Phases 4 and 8

Nothing jumps ahead of where its dependencies actually are.
