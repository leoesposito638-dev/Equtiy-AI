# Prototype 1.2 — UX Reference

This is a **UX reference artifact**, not production code. It is a single,
self-contained React file (`equity-ai-prototype-1.2.jsx`) built entirely on
demo fixtures (NVIDIA, Microsoft, Spotify) to test the product's information
architecture and interaction model before committing it to the real,
API-connected frontend in `/frontend`.

## What it is

- A fast-iteration prototype: sectioned sidebar (Research / Portfolio /
  Monitoring / Settings), Dashboard, Search with recent searches, and a
  tabbed Company Page (Overview / Financials / Valuation / Analysis) with
  progressive disclosure — category deep-dives, Bull/Base/Bear thesis
  switching, a centralized financial-term glossary with tap/click tooltips.
- The result of two review passes: an initial build (Prototype 1 / V1)
  and a revision (V1.1) that removed duplicated information from the
  Overview tab (Key Financials and Valuation summaries now live only in
  their own tabs), hid the not-yet-defined Opportunity Score, and added
  the glossary/tooltip system.
- Entirely demo-fixture-driven. No FMP, Supabase, or AI API calls. Every
  screen carries a visible "PROTOTYPE · DEMO DATA" tag.

## What it is not

- **Not the production frontend.** The production frontend lives in
  `/frontend` — a Vite + React + TypeScript app with a real, typed API
  client (`src/lib/apiClient.ts`) built directly against the backend's
  actual endpoint contracts (`/companies/:id/scores`, `/analysis`,
  `/financials`, `/changes`, etc.), with honest loading/error/"data
  unavailable" states and a clearly-separated demo-fixture fallback.
- **Not wired to real data.** Nothing in this file should be run as, or
  mistaken for, a live product surface.

## How to view it

Open `equity-ai-prototype-1.2.jsx` in any environment that can render a
single-file React component with inline styles and `lucide-react` icons
(e.g. paste into a React sandbox, or render as a Claude artifact). It has
no build step of its own and is not part of `/frontend`'s build.

## Relationship to `/frontend`

This prototype's visual language and interaction patterns (progressive
disclosure, category deep-dive, tabbed company page, financial glossary)
are the reference for `/frontend`'s ongoing UI work — but `/frontend`'s
component architecture, data layer, and API contracts were built
independently and are the ones to extend for real functionality.
