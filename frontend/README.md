# Equity AI — Frontend (v1.0)

The real Equity AI frontend, built directly against the endpoints and table
shapes defined in `../backend` (not re-imagined — `src/lib/types.ts`
mirrors `../backend/src/api/routes/*.ts` response shapes field for
field). Every page in the original product brief is here, plus the sections
the backend blueprint added: confidence/coverage, 8 scoring categories, a
structurally separate Opportunity Score, the AI Investment Thesis, and
source/period/retrieval attribution on every financial figure.

## Demo mode vs. live mode — how this actually works

There is no live backend reachable from the environment this was built in
(no network, no deployed API). Rather than hardcode fixture data into the
page components the way the throwaway UI prototype did, this app is built
the way it would be built for production:

- `src/lib/apiClient.ts` is the **only** place that calls `fetch`, and it
  calls the real, documented endpoints (`GET /companies/:id/scores`,
  `/analysis`, `/financials`, `/changes`, etc.) — see
  `../backend/src/api/routes/*.ts` for the exact contract each of
  these hits.
- `src/lib/useApi.ts` wraps every request in a hook that returns
  `{ data, loading, error, isDemo }`. `isDemo` is **only** true when no
  `VITE_API_BASE_URL` is configured at all — a real request that fails
  against a configured backend surfaces as `error`, visibly, never as
  quietly-swapped-in fixture data.
- `src/lib/fixtures.ts` holds the demo fallback data, typed against the
  exact same interfaces (`ScoresResponse`, `AnalysisResponse`,
  `FinancialMetricRow`, etc.) as the real API responses — so switching to a
  live backend is a one-line env var change, not a rewrite.
- Every page that's currently running on fixtures shows a visible amber
  "Demo data" banner (`src/components/States.tsx` → `DemoBanner`). This is
  not cosmetic — it's the same honesty principle the backend used for its
  own "unavailable" data status, applied to the frontend.

**To go live:** set `VITE_API_BASE_URL` in `.env` to a deployed
deployed backend instance and run `npm run dev` — no other code changes.
`DEMO_MODE` (`src/lib/config.ts`) flips to `false` automatically and every
hook switches from fixtures to real fetch calls.

## Pages (per the backend's declared frontend surface)

| Page | Route | What it shows |
|---|---|---|
| Overview | `/` | Search, followed companies, "What changed," Discovery preview |
| My Companies | `/companies` | Full watchlist with unfollow |
| Discover | `/discover` | Category filters + candidate companies |
| Alerts | `/alerts` | Only alerts at/above the backend's importance threshold, with severity |
| Company | `/company/:id` | Fundamental Score (with confidence + data coverage, kept visibly separate from the score itself), Opportunity Score, all 8 category dimensions, Key Fundamentals with source/period/retrieval attribution, AI Investment Thesis (headline, bull/base/bear, catalysts, risks, thesis-change conditions), Recent Changes |

## What "complete" means here, precisely

- Every field the backend can return as `null` / absent is rendered as an
  explicit "Data unavailable" state (`src/components/States.tsx` →
  `DataUnavailable`), never a fabricated placeholder — a company with no
  score yet shows "hasn't completed a scoring run," not a `0`.
- Confidence and data coverage are **always shown separately from the
  score**, everywhere the score appears — list rows, the gauge, category
  bars (a category below 60% confidence gets a visible low-confidence
  flag rather than presenting equally trustworthy-looking as a
  fully-covered one).
- The Fundamental Score and Opportunity Score are two separate numbers in
  two separate UI elements everywhere — never combined, per the backend's
  own design principle.
- Source attribution on every Key Fundamentals figure shows period, period
  type, and (once wired to real data) the originating filing — not just a
  number floating with no provenance.

## Known gaps (honest, not hidden)

- **No bulk "companies + scores" endpoint.** List views
  (`CompanyListRow`, `DiscoveryCard`) each independently call
  `GET /companies/:id/scores` per row. Fine at the scale of a personal
  watchlist; before scaling to hundreds of companies per list, add a
  batched endpoint or a materialized view on the backend and swap these
  components to consume it — no other frontend change needed since the
  data shape can stay identical.
- **Discover's category filters aren't backed by real categorization
  yet.** The backend doesn't currently expose which companies match
  "Strong Growth" / "High Quality" / etc. as a queryable dimension — that
  UI is present and wired to click, but currently just shows all
  not-yet-followed companies with a note explaining why, rather than
  faking a filter that doesn't do anything.
- **Watchlist membership is local-only for now.** Follow/unfollow updates
  local React state (`src/lib/followedContext.tsx`) instead of calling
  `POST /watchlists/:id/companies` — because there's no bootstrap flow yet
  for "create the user's first watchlist the first time they follow
  something." The API client function (`api.addToWatchlist`) exists and is
  ready; wiring it is a small, explicit TODO left in
  `src/lib/useApi.ts` (`useFollowedSet`).
- **Source attribution shows a source id, not a resolved provider name.**
  `GET /companies/:id/financials` returns `source_id`, not a joined
  `data_sources` row — the backend blueprint doesn't expose a
  `GET /data-sources/:id` endpoint. Recommend adding one (or embedding the
  source fields directly in the financials response via a join) before
  this needs to look fully polished in production; the frontend already
  has the UI slot ready (`SourceLine`-equivalent in `CompanyPage.tsx`).
- **No real auth.** `x-user-id` is sent as a static demo value
  (`VITE_DEMO_USER_ID`) matching the backend's own auth stub
  (`../backend/src/api/auth.ts`). Both sides need real auth wired
  together before this is user-facing.

None of these are silent — each is either visible in the UI (demo banner,
"data unavailable", the Discover note) or flagged here and in the relevant
source file as a TODO.

## Project layout

```
src/
  lib/
    types.ts            response shapes mirroring the backend's tables/routes
    config.ts             API_BASE_URL / DEMO_MODE
    apiClient.ts            the only module that calls fetch()
    fixtures.ts              demo fallback data, typed like real responses
    useApi.ts                 data hooks: {data, loading, error, isDemo}
    followedContext.tsx        shared watchlist-membership state
  components/
    Primitives.tsx          ScoreGauge, CategoryBar, ConfidenceBadge, Card, ...
    States.tsx                 Loading / Error / Empty / DataUnavailable / DemoBanner
    Nav.tsx, SearchBar.tsx        sidebar/mobile nav, company search
    CompanyListRow.tsx, DiscoveryCard.tsx
    Layout.tsx                    app shell (sidebar + content + mobile nav)
  pages/
    OverviewPage.tsx, MyCompaniesPage.tsx, DiscoverPage.tsx,
    AlertsPage.tsx, CompanyPage.tsx
  styles/tokens.ts            design tokens (colors, category labels, status logic)
  App.tsx                        router
  main.tsx                        entry point
```

## Running this

```bash
npm install
cp .env.example .env    # leave VITE_API_BASE_URL empty for demo mode,
                         # or point it at a deployed backend
npm run dev              # http://localhost:5173
```
