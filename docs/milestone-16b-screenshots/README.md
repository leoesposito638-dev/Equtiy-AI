# Milestone 16B — honesty fixes, before/after

"Before" is the Milestone 16A set at `docs/milestone-16a-screenshots/` (live backend, same NVDA/LLY/Discover data). These are "after," captured the same way (Playwright + the pre-installed Chromium) against the frontend with the 16B changes applied.

| File | Shows |
|---|---|
| `after-01-company-nvda-full-live.png` | NVDA page, live backend. Gray gauge + "Insufficient data" (confidence 37% < 50% threshold) instead of the old "Improving" label next to a ↓0.5 delta. Italic note: "scored under a new model (v1.2 → v1.3) — not compared to the prior score" instead of a false change indicator. Valuation numbers formatted (27.5x, 23.6x, 22.7x, 17.5x, 41.6x, FCF Yield 2.4%) and the stale "requires market-price data" paragraph removed. Compare to `../milestone-16a-screenshots/04-company-nvda-full.png`. |
| `after-02-dashboard-lly-row-live.png` | Dashboard. LLY's row shows a neutral "—" instead of a `0` change pill (not comparable across versions) and "Insufficient data" instead of "Excellent" (confidence 14%). Discovery cards show "Insufficient data" too. Compare to `../milestone-16a-screenshots/01-dashboard.png`. |
| `after-03-discover-live.png` | Discover, all 30 companies. Every card now reads "Insufficient data" — an accurate reflection of live confidence today (every company in the demo universe is currently below the 50% threshold), not a bug. Compare to `../milestone-16a-screenshots/06-discover.png`. |
| `after-04-demo-banner.png` | The default dev config (`VITE_API_BASE_URL` unset). Banner now reads "Not live. Showing a snapshot captured Sep 7, 2026, scoring v1.1 — real data, but frozen at that moment and not updated since." — capture date and scoring version pulled live from the snapshot file, not hand-typed. The scores shown here (ADBE 70.8, GOOGL 72.8, AMZN 66.9) visibly differ from the live ones in `after-02`/`after-03`, demonstrating exactly the staleness the banner now names. |

See the full Milestone 16B report (published separately) for the reasoning behind the 50% confidence threshold, the version-comparability fix, and the full valuation formatting audit.
