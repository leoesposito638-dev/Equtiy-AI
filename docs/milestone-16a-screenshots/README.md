# Milestone 16A — Frontend status audit screenshots

Captured 2026-09-24 with Playwright + the pre-installed Chromium, against the
frontend (`npm run dev`, `VITE_API_BASE_URL=http://localhost:3000`) talking to
the real backend API (`npm run dev` in `backend/`), which itself reads the
live Supabase database. `DEMO_MODE` was off for every screenshot below — none
of this is `frontend/src/data/realDemoSnapshot.json` fixture data.

| File | Page | Route |
|---|---|---|
| `01-dashboard.png` | Dashboard (Overview) | `/` |
| `02-search-empty.png` | Dashboard, search box focused, no query | `/` |
| `03-search-nvidia.png` | Dashboard, search box with "NVIDIA" typed | `/` |
| `04-company-nvda-full.png` | NVDA company page — full scroll, single page (no tabs in this build) | `/company/e97055a5-1c3e-49a0-936b-a0248bb21ac4` |
| `05-watchlist-my-companies.png` | Watchlist ("My Companies") | `/companies` |
| `06-discover.png` | Discover (ranked list of all 30 companies) | `/discover` |
| `07-alerts.png` | Alerts | `/alerts` |

See the full Milestone 16A audit report (published separately) for the
REAL/DEMO/placeholder determination per section, the endpoint-usage
inventory, the NVDA score comparison, and the Prototype 1.2 deviation list.
