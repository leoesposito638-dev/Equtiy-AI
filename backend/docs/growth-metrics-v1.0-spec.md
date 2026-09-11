# GROWTH Category — Calculated Metrics Specification (v1.0)

Approved specification for the five `GROWTH` category metrics defined in
`schema/004_seed_scoring_config.sql`. This document is the decision record;
`src/calculations/growthMetrics.ts` implements it exactly, with no
unapproved deviations. `CALCULATION_VERSION` stays `"v1.0"` (from
`src/calculations/metrics.ts`) — these functions compose existing, unmodified
primitives (`pctChange`, `cagr`, `trend`), they don't redefine them.

## 0. Two separate kinds of "history" — do not conflate

This is the single most important structural rule in this spec, because the
codebase already has a naming collision waiting to happen:

- **A. Raw-data requirements** (this document, this milestone): how many
  *raw `financial_metrics` periods* (revenue/eps observations) are needed to
  compute **one current value** of a calculated metric. Fully covered below,
  per metric.
- **B. Scoring history** (`MetricInput.history` in
  `src/scoring/categoryScorers/types.ts`, consumed by
  `src/scoring/categoryScorers/scoreCategory.ts`): a time series of **past
  values of the calculated metric itself** (e.g. multiple previously-computed
  `revenue_growth_yoy` values from earlier scoring runs), used for TREND-type
  rule scoring and as the `minimum_data_points` coverage gate.

**This milestone produces (A) only.** It writes single `calculated_metrics`
rows (one value per metric per period) from real `financial_metrics` data.
It does **not** touch `scoreCategory.ts`, `percentile.ts`, `confidence.ts`,
`scoringEngine.ts`, or populate anything resembling (B) — that remains a
future `ScoringRepo`/Supabase-scoring-repo milestone, explicitly out of
scope here. No code in this milestone changes what `MetricInput.history`
means or how `scoreCategory.ts` reads it.

## 1. revenue_growth_yoy

- **Formula:** `((current_revenue - previous_revenue) / abs(previous_revenue)) * 100`
  — exactly `pctChange(current, previous)` from `calculations/metrics.ts`, unmodified.
- **Raw-data requirement:** 2 consecutive ANNUAL `revenue` periods (t, t-1).
- **Missing period (either):** unavailable.
- **previous_revenue == 0:** unavailable.
- **Negative result:** valid and preserved as-is (revenue decline is real information).
- **Unit:** `PERCENT`.

## 2. revenue_cagr_3y

- **Formula:** `((current_revenue / revenue_3y_ago) ^ (1/3) - 1) * 100`
  — `cagr(current, start, 3)` from `calculations/metrics.ts`, unmodified.
- **Raw-data requirement:** **all 4** ANNUAL `revenue` periods specified by
  the scoring configuration (t, t-1, t-2, t-3) — not just the two endpoints
  the formula mathematically touches. This is a deliberately stricter gate
  than the bare formula requires.
- **Any of the 4 periods missing:** unavailable.
- **Either endpoint (t or t-3) <= 0:** unavailable (enforced by `cagr()`'s
  existing guard — not a new check).
- **Negative CAGR** (revenue declined over 3 years, both endpoints still
  positive): valid and preserved.
- **Unit:** `PERCENT`.

## 3. eps_growth_yoy

- **V1 rule:** compute the percentage **only when both current and previous
  EPS are strictly positive** (`> 0`).
- **Formula (positive case only):** `((current_eps - previous_eps) / abs(previous_eps)) * 100`
  — `pctChange(current, previous)`.
- **Either EPS <= 0 (including previous == 0):** unavailable. No
  dollar-change substitute, no fallback — an honest unavailable state.
- **Missing period (either):** unavailable.
- **Rationale (approved):** percentage EPS growth becomes difficult to
  interpret around zero/negative earnings; an honest unavailable beats a
  misleading percentage.
- **Unit:** `PERCENT`.

## 4. eps_cagr

- **Formula:** `((current_eps / eps_3y_ago) ^ (1/3) - 1) * 100`
  — `cagr(current, start, 3)`, unmodified, same function as `revenue_cagr_3y`.
- **Raw-data requirement:** **all 4** ANNUAL `eps` periods (t, t-1, t-2, t-3).
- **Any of the 4 periods missing:** unavailable.
- **Either endpoint (t or t-3) <= 0:** unavailable — enforced entirely by
  `cagr()`'s existing guard; no separate EPS-specific negative-value logic
  was written or is needed.
- **Unit:** `PERCENT`.

## 5. growth_acceleration

- **Candidate B (approved).** Underlying series: **revenue** (not eps).
- **Raw-data requirement:** all 4 ANNUAL `revenue` periods (t, t-1, t-2, t-3)
  — same 4 periods already ingested for the CAGR metrics.
- **Derivation:**
  1. Compute three consecutive YoY revenue growth rates via `pctChange`
     (unmodified): `g1 = growth(t-2 vs t-3)`, `g2 = growth(t-1 vs t-2)`,
     `g3 = growth(t vs t-1)`.
  2. Compute the slope across `[g1, g2, g3]` (oldest → newest) via `trend()`
     from `calculations/metrics.ts`, unmodified — the same linear
     best-fit-slope helper already used for every other TREND-type metric
     in this codebase (`margin_trend`, `debt_trend`, etc.).
- **Explicitly not used:** the existing `growthAcceleration()` helper (2-input
  signal) — using it here would produce exactly one stored value per run,
  which the `growth_acceleration` score_rule's `TREND` rule type could never
  satisfy (its scoring path runs `trendSlope()` over stored history, which
  needs ≥2 points). Candidate B is scorable from a single ingestion pass.
- **Any of the 4 revenue periods missing, or any of g1/g2/g3 undefined**
  (e.g. a zero-denominator year): unavailable.
- **Interpretation:** positive slope = revenue growth is accelerating;
  negative slope = decelerating; near-zero = broadly stable.
- **Unit: this is a trend/slope value, explicitly NOT a percentage growth
  rate.** It is the rate of change, per period-step, of the YoY growth
  percentage itself (percentage points per period) — one derivative removed
  from `revenue_growth_yoy`. Documented here as `TREND_SLOPE`, never
  `PERCENT` — note `calculated_metrics` (`schema/002_scoring_tables.sql`)
  has no `unit` column at all, so this distinction is enforced by this
  document and by never mixing the value into a percentile benchmark
  defined in `PERCENT` terms, not by a stored field.

## Storage

Each successfully-computed metric is written as one `calculated_metrics` row:
`company_id`, `metric_name`, `value`, `period_end` (= the current/most recent
period, t), `period_type = 'ANNUAL'`, `calculation_version = 'v1.0'`,
`input_data_hash` (deterministic hash of the exact `financial_metrics` row
ids consumed). There is no `unit` column on `calculated_metrics` — unit is a
documentation-level fact (this spec), not a stored field, same as it already
is for every other row in that table. An unavailable result writes **no
row** — same convention `ingest.ts`/`normalizeLineItem` already use for a
rejected/unnormalizable observation (nothing is ever written to represent
"we don't know"; absence of a row *is* the honest signal).
