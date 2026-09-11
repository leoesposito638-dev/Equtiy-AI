# Equity AI — Database & Scoring Engine Blueprint V1

> Archived verbatim as originally provided. See `docs/product/README.md` for context.
> This is the specification `/backend` was built against.

EQUITY AI — DATABASE & SCORING ENGINE BLUEPRINT V1

ROLE

You are the lead backend engineer, financial-data architect and quantitative systems engineer for Equity AI.

You are extending an existing Equity AI prototype.

The existing product concept is:

Equity AI continuously follows the companies I care about, simplifies the information, explains what matters, and tells me when something important changes.

The existing frontend already contains:

* Dashboard
* Company search
* Company pages
* Fundamental Score
* Score breakdown
* Financial overview
* AI Investment Thesis
* Watchlist
* Alerts
* Discovery

The current prototype uses demo data.

Your task is now to build the real data architecture and scoring foundation behind the application.

Do NOT redesign the frontend unless necessary to connect the backend.

Do NOT use hardcoded example scores.

Do NOT allow the AI to invent financial data.

⸻

1. CORE ARCHITECTURE

Build the system around this pipeline:

EXTERNAL DATA SOURCES
        ↓
DATA INGESTION
        ↓
RAW DATA
        ↓
NORMALIZATION
        ↓
VALIDATION
        ↓
CANONICAL FINANCIAL DATA
        ↓
CALCULATED METRICS
        ↓
HISTORICAL ANALYSIS
        ↓
PEER ANALYSIS
        ↓
SCORING ENGINE
        ↓
FUNDAMENTAL SCORE
        ↓
AI INTERPRETATION
        ↓
INVESTMENT THESIS
        ↓
CHANGE DETECTION
        ↓
ALERTS

The architecture must be modular.

Never couple the application directly to one financial-data provider.

⸻

2. FUNDAMENTAL PRINCIPLE

There are three fundamentally different types of information:

FACT

Information directly obtained from a verified external source.

Example:

Revenue = 18,420,000,000
Source = SEC filing
Period = Q2 2026

CALCULATION

A value calculated by Equity AI.

Example:

Revenue Growth = 31.4%

AI INTERPRETATION

A language-model interpretation of verified facts and calculations.

Example:

Revenue growth accelerated significantly compared with the previous quarter.

The system must maintain this separation at database level.

AI-generated information must NEVER overwrite factual financial data.

If data is missing:

data_status = "unavailable"

Never fabricate a value.

⸻

3. DATABASE

Use:

PostgreSQL / Supabase

Design the schema for thousands of companies and millions of financial observations.

Use UUID primary keys where appropriate.

Use timestamps.

Use foreign keys.

Use indexes on all frequently queried identifiers.

⸻

4. TABLE: companies

Stores company identity.

companies

Fields:

id UUID PRIMARY KEY
name TEXT NOT NULL
legal_name TEXT
ticker TEXT NOT NULL
exchange TEXT
country TEXT
currency TEXT
isin TEXT
cusip TEXT
cik TEXT
sector TEXT
industry TEXT
sub_industry TEXT
description TEXT
website TEXT
logo_url TEXT
market_cap NUMERIC
employee_count INTEGER
founded_year INTEGER
fiscal_year_end TEXT
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP
updated_at TIMESTAMP

Constraints:

ticker + exchange must be unique

⸻

5. TABLE: data_sources

Every factual datapoint must be traceable.

data_sources

Fields:

id UUID PRIMARY KEY
provider_name TEXT
provider_type TEXT
source_url TEXT
source_document_id TEXT
source_document_type TEXT
published_at TIMESTAMP
retrieved_at TIMESTAMP
reporting_period_start DATE
reporting_period_end DATE
filing_date DATE
currency TEXT
data_quality_score NUMERIC
created_at TIMESTAMP

Examples of provider types:

SEC
COMPANY_FILING
FINANCIAL_API
COMPANY_PRESS_RELEASE
EARNINGS_TRANSCRIPT
NEWS
MARKET_DATA

⸻

6. TABLE: raw_financial_data

Never throw away raw source information.

raw_financial_data

Fields:

id UUID PRIMARY KEY
company_id UUID
data_source_id UUID
metric_name TEXT
metric_identifier TEXT
raw_value NUMERIC
raw_text TEXT
unit TEXT
currency TEXT
period_start DATE
period_end DATE
period_type TEXT
filing_date DATE
source_confidence NUMERIC
created_at TIMESTAMP

period_type can be:

QUARTER
ANNUAL
TTM
INSTANT

⸻

7. TABLE: financial_metrics

This is the normalized financial layer.

financial_metrics

Fields:

id UUID PRIMARY KEY
company_id UUID
metric_name TEXT
metric_category TEXT
value NUMERIC
unit TEXT
currency TEXT
period_start DATE
period_end DATE
period_type TEXT
source_id UUID
calculation_type TEXT
confidence_score NUMERIC
created_at TIMESTAMP

Examples:

revenue
gross_profit
operating_income
ebitda
net_income
eps
operating_cash_flow
capex
free_cash_flow
cash
total_debt
net_debt
total_assets
total_liabilities
equity

⸻

8. TABLE: market_data

market_data

Fields:

id UUID PRIMARY KEY
company_id UUID
timestamp TIMESTAMP
price NUMERIC
market_cap NUMERIC
volume BIGINT
shares_outstanding NUMERIC
high_52w NUMERIC
low_52w NUMERIC
return_1m NUMERIC
return_3m NUMERIC
return_6m NUMERIC
return_12m NUMERIC
volatility_1y NUMERIC
created_at TIMESTAMP

Market data must remain separate from fundamental financial statements.

⸻

9. TABLE: estimates

Store analyst expectations separately.

estimates

Fields:

id UUID PRIMARY KEY
company_id UUID
metric_name TEXT
estimate_value NUMERIC
estimate_period_start DATE
estimate_period_end DATE
estimate_period_type TEXT
consensus_value NUMERIC
analyst_count INTEGER
source_id UUID
retrieved_at TIMESTAMP
created_at TIMESTAMP

Examples:

revenue
eps
ebitda
operating_income

⸻

10. TABLE: earnings

earnings

Fields:

id UUID PRIMARY KEY
company_id UUID
period_start DATE
period_end DATE
report_date TIMESTAMP
eps_actual NUMERIC
eps_estimate NUMERIC
eps_surprise_percent NUMERIC
revenue_actual NUMERIC
revenue_estimate NUMERIC
revenue_surprise_percent NUMERIC
guidance_text TEXT
guidance_direction TEXT
source_id UUID
created_at TIMESTAMP

guidance_direction:

RAISED
MAINTAINED
LOWERED
WITHDRAWN
UNKNOWN

⸻

11. TABLE: company_events

This is required for future monitoring.

company_events

Fields:

id UUID PRIMARY KEY
company_id UUID
event_type TEXT
title TEXT
description TEXT
importance_score NUMERIC
published_at TIMESTAMP
source_id UUID
ai_summary TEXT
created_at TIMESTAMP

Event types:

EARNINGS
GUIDANCE
CEO_CHANGE
CFO_CHANGE
ACQUISITION
DIVESTITURE
PRODUCT_LAUNCH
PARTNERSHIP
BUYBACK
DIVIDEND
FILING
LEGAL
REGULATORY
OTHER

⸻

12. TABLE: calculated_metrics

This table stores metrics calculated by Equity AI.

calculated_metrics

Fields:

id UUID PRIMARY KEY
company_id UUID
metric_name TEXT
value NUMERIC
period_end DATE
period_type TEXT
calculation_version TEXT
input_data_hash TEXT
created_at TIMESTAMP

Examples:

revenue_growth_yoy
revenue_cagr_3y
revenue_cagr_5y
eps_growth_yoy
eps_cagr
gross_margin
operating_margin
ebitda_margin
net_margin
fcf_margin
roic
roe
roa
debt_to_equity
net_debt_to_ebitda
current_ratio
interest_coverage
pe
forward_pe
ev_ebitda
ev_sales
price_to_fcf
fcf_yield

This is extremely important:

Every calculated metric must contain a calculation_version.

Example:

v1.0

If we change the formula later:

v1.1

We must be able to reproduce historical scores.

⸻

13. TABLE: peer_groups

peer_groups

Fields:

id UUID PRIMARY KEY
name TEXT
sector TEXT
industry TEXT
method TEXT
created_at TIMESTAMP

⸻

14. TABLE: company_peers

company_peers

Fields:

company_id UUID
peer_company_id UUID
peer_type TEXT
similarity_score NUMERIC
created_at TIMESTAMP

peer_type:

PRIMARY
SECONDARY
SECTOR
INDUSTRY

The peer engine must eventually support dynamic peer selection.

⸻

15. TABLE: metric_benchmarks

This table is extremely important.

metric_benchmarks

Fields:

id UUID PRIMARY KEY
metric_name TEXT
sector TEXT
industry TEXT
period_end DATE
p25 NUMERIC
median NUMERIC
p75 NUMERIC
p90 NUMERIC
sample_size INTEGER
created_at TIMESTAMP

This allows Equity AI to answer:

Is 25% operating margin actually good?

Instead of using a universal threshold.

It can compare the company against relevant companies.

⸻

16. TABLE: score_categories

score_categories

Fields:

id UUID PRIMARY KEY
category_key TEXT UNIQUE
name TEXT
description TEXT
default_weight NUMERIC
is_active BOOLEAN
created_at TIMESTAMP

Initial categories:

GROWTH
PROFITABILITY
FINANCIAL_HEALTH
VALUATION
CAPITAL_ALLOCATION
COMPETITIVE_ADVANTAGE
MANAGEMENT
EARNINGS_MOMENTUM

The eight categories are configuration-driven.

Weights MUST NOT be hardcoded into application logic.

⸻

17. TABLE: score_rules

This contains the actual scoring methodology.

score_rules

Fields:

id UUID PRIMARY KEY
category_id UUID
metric_name TEXT
rule_type TEXT
weight NUMERIC
direction TEXT
minimum_data_points INTEGER
sector_specific BOOLEAN
version TEXT
active BOOLEAN
created_at TIMESTAMP

Possible rule types:

PERCENTILE
LINEAR
LOG
RATIO
TREND
COMPOSITE

Possible direction:

HIGHER_IS_BETTER
LOWER_IS_BETTER
OPTIMAL_RANGE

⸻

18. TABLE: category_scores

category_scores

Fields:

id UUID PRIMARY KEY
company_id UUID
category_id UUID
score NUMERIC
confidence NUMERIC
coverage NUMERIC
calculation_version TEXT
calculated_at TIMESTAMP

Example:

NVIDIA
Growth
96
Profitability
97
Financial Health
92
Valuation
68

⸻

19. TABLE: fundamental_scores

fundamental_scores

Fields:

id UUID PRIMARY KEY
company_id UUID
score NUMERIC
confidence NUMERIC
data_coverage NUMERIC
calculation_version TEXT
previous_score NUMERIC
score_change NUMERIC
calculated_at TIMESTAMP

This is the canonical company score.

⸻

20. SCORE CONFIDENCE

This is a major requirement.

A company with incomplete data should NOT receive the same confidence as a company with complete data.

Example:

Fundamental Score: 87
Confidence: 94%
Data Coverage: 98%

versus:

Fundamental Score: 87
Confidence: 57%
Data Coverage: 61%

The score and confidence must remain separate.

Never artificially inflate a score because data is missing.

⸻

21. SCORE CALCULATION

Implement the scoring engine as a standalone module.

Example:

calculateFundamentalScore(companyId)

Pipeline:

1. Fetch normalized financial data
2. Calculate missing derived metrics
3. Validate data
4. Determine peer group
5. Calculate historical benchmarks
6. Calculate metric percentiles
7. Calculate metric scores
8. Aggregate category scores
9. Apply industry configuration
10. Calculate confidence
11. Calculate total score
12. Store score snapshot

⸻

22. IMPORTANT — NO SIMPLE HARD THRESHOLDS

Do NOT implement simplistic rules such as:

Revenue Growth > 30% = 100
Revenue Growth < 10% = 50

as the primary methodology.

Instead, prefer:

Company value
        ↓
Historical percentile
        +
Peer percentile
        +
Trend
        +
Data quality
        ↓
Metric score

This makes the system adaptable across industries.

⸻

23. GROWTH SCORE V1

Growth should initially consider:

Revenue Growth YoY
Revenue CAGR 3Y
Revenue CAGR 5Y
EPS Growth YoY
EPS CAGR
Growth acceleration

Suggested conceptual structure:

Revenue Growth       30%
Revenue CAGR         20%
EPS Growth           20%
EPS CAGR             15%
Acceleration         15%

These are initial model weights, not permanent truths.

Store them in score_rules.

⸻

24. PROFITABILITY SCORE V1

Use:

Gross Margin
Operating Margin
EBITDA Margin
Net Margin
ROIC
ROE
Margin Trend

The system should emphasize:

* Absolute profitability
* Peer-relative profitability
* Historical trend

Do not evaluate margins using universal thresholds alone.

⸻

25. FINANCIAL HEALTH SCORE V1

Use:

Net Debt / EBITDA
Debt / Equity
Current Ratio
Interest Coverage
Cash Position
Free Cash Flow
Debt Trend

Higher financial risk should reduce the score.

⸻

26. VALUATION SCORE V1

Use:

P/E
Forward P/E
EV/EBITDA
EV/Sales
Price/FCF
FCF Yield

But valuation must be contextualized using:

Growth
Profitability
Historical valuation
Sector
Peer valuation
Business quality

Low P/E must not automatically mean "good".

⸻

27. CAPITAL ALLOCATION SCORE

Evaluate:

Share buybacks
Dividend policy
Acquisitions
Debt reduction
Reinvestment
ROIC
Share dilution

Important:

A company generating cash but allocating it poorly should not receive the same quality score as a company allocating capital efficiently.

⸻

28. COMPETITIVE ADVANTAGE SCORE

This category should NOT be based purely on arbitrary AI opinion.

Use observable evidence where possible:

Gross margin stability
ROIC persistence
Market share trends
Revenue retention
Pricing power indicators
Recurring revenue
Customer concentration
Switching costs
Network effects
R&D intensity

AI may interpret evidence.

AI must not invent evidence.

⸻

29. MANAGEMENT SCORE

Use available measurable indicators:

Capital allocation history
Insider ownership
Share dilution
Guidance credibility
Execution against previous guidance
Management turnover

AI may summarize management commentary but must distinguish:

FACT
AI INTERPRETATION

⸻

30. EARNINGS MOMENTUM SCORE

Use:

EPS surprise
Revenue surprise
Estimate revisions
Guidance changes
Margin changes
Revenue acceleration

This category is specifically useful for the monitoring system.

⸻

31. FUNDAMENTAL SCORE VS OPPORTUNITY SCORE

Keep these separate.

Fundamental Score

How strong is the company fundamentally?

Opportunity Score

How interesting is the stock right now?

Example:

Fundamental Score: 96
Opportunity Score: 74

Interpretation:

Excellent company, but valuation may be demanding.

Do NOT combine these into one score.

⸻

32. TABLE: analysis_snapshots

Store every generated analysis.

analysis_snapshots

Fields:

id UUID PRIMARY KEY
company_id UUID
fundamental_score NUMERIC
opportunity_score NUMERIC
score_change NUMERIC
analysis_version TEXT
generated_at TIMESTAMP
summary TEXT
data_snapshot_id UUID

⸻

33. TABLE: investment_theses

investment_theses

Fields:

id UUID PRIMARY KEY
company_id UUID
analysis_snapshot_id UUID
headline TEXT
thesis TEXT
bull_case TEXT
base_case TEXT
bear_case TEXT
catalysts JSONB
risks JSONB
thesis_change_conditions JSONB
generated_at TIMESTAMP
model_version TEXT

The system should support:

* Investment Thesis
* Bull Case
* Base Case
* Bear Case
* Catalysts
* Risks
* What Would Change The Thesis?

⸻

34. TABLE: change_events

This detects meaningful changes.

change_events

Fields:

id UUID PRIMARY KEY
company_id UUID
event_type TEXT
metric_name TEXT
old_value NUMERIC
new_value NUMERIC
absolute_change NUMERIC
percentage_change NUMERIC
importance_score NUMERIC
direction TEXT
detected_at TIMESTAMP
analysis_snapshot_id UUID
created_at TIMESTAMP

⸻

35. CHANGE DETECTION

Do not alert users whenever a number moves by a tiny amount.

The system should evaluate:

Magnitude
+
Historical significance
+
Peer significance
+
Business relevance
+
Score impact

Then produce:

importance_score = 0–100

Only significant events should become alerts.

⸻

36. TABLE: alerts

alerts

Fields:

id UUID PRIMARY KEY
user_id UUID
company_id UUID
change_event_id UUID
alert_type TEXT
severity TEXT
title TEXT
summary TEXT
score_before NUMERIC
score_after NUMERIC
is_read BOOLEAN
created_at TIMESTAMP

Severity:

INFO
LOW
MEDIUM
HIGH
CRITICAL

⸻

37. TABLE: watchlists

watchlists

Fields:

id UUID PRIMARY KEY
user_id UUID
name TEXT
created_at TIMESTAMP

⸻

38. TABLE: watchlist_companies

watchlist_companies

Fields:

watchlist_id UUID
company_id UUID
created_at TIMESTAMP

⸻

39. DATA INGESTION LAYER

Create provider interfaces.

Example:

interface MarketDataProvider {
    getQuote(companyId)
    getHistoricalPrices(companyId)
}
interface FinancialDataProvider {
    getIncomeStatement(companyId)
    getBalanceSheet(companyId)
    getCashFlow(companyId)
}
interface EarningsProvider {
    getEarnings(companyId)
    getEstimates(companyId)
}
interface NewsProvider {
    getCompanyNews(companyId)
}
interface FilingProvider {
    getFilings(companyId)
}

The application must not directly depend on a provider implementation.

Use adapters:

FinancialDataProvider
        ↓
Provider Adapter
        ↓
External API

This allows us to replace providers later.

⸻

40. DATA VALIDATION

Before financial data enters the canonical database, validate:

* Units
* Currency
* Period
* Duplicate observations
* Impossible values
* Missing values
* Source
* Filing date
* Reporting period

Examples:

Revenue cannot be silently interpreted as USD if source reports EUR.
Quarterly data must not be confused with annual data.
TTM must not be treated as a fiscal-year figure.

⸻

41. SOURCE TRACEABILITY

Every visible financial number in the UI must eventually be traceable to:

Metric
↓
Canonical value
↓
Source
↓
Source document
↓
Reporting period
↓
Retrieved date

The frontend should be able to show:

Source: Company filing
Period: Q2 2026
Retrieved: August 24, 2026

This is essential for trust.

⸻

42. AI SERVICE

The AI service receives structured information.

Example input:

{
  "company": "Example Corp",
  "fundamental_score": 87,
  "score_change": 4,
  "growth": {
    "score": 94,
    "revenue_growth": 31.2,
    "revenue_growth_peer_percentile": 92
  },
  "profitability": {
    "score": 89,
    "operating_margin": 24.1,
    "margin_change": 2.3
  }
}

The AI's job is to:

* Explain
* Summarize
* Compare
* Identify meaningful changes
* Generate thesis
* Explain risks
* Explain catalysts

The AI must NOT:

* Invent numbers
* Modify raw data
* Decide financial facts
* Pretend missing data exists

⸻

43. AI OUTPUT FORMAT

Require structured JSON.

Example:

{
  "headline": "...",
  "summary": "...",
  "key_strengths": [],
  "key_weaknesses": [],
  "bull_case": "...",
  "base_case": "...",
  "bear_case": "...",
  "risks": [],
  "catalysts": [],
  "what_changed": [],
  "confidence": 0.91
}

Validate the JSON before storing it.

⸻

44. VERSION EVERYTHING

The following must be versioned:

Data normalization
Calculation formulas
Scoring rules
Scoring weights
AI prompts
AI model
Analysis

Example:

data_version = 1.0
calculation_version = 1.0
scoring_version = 1.0
ai_prompt_version = 1.0

This is essential because we will continuously improve the algorithm.

⸻

45. NO HARDCODED SCORES

Remove all code such as:

score: 96

unless it is explicitly marked as demo data.

Production scores must always be generated from:

database data
+
calculation engine
+
scoring configuration

⸻

46. NO HARDCODED COMPANY ANALYSIS

Remove example text such as:

NVIDIA has exceptional growth…

from production logic.

The AI should generate company-specific analysis from structured data.

⸻

47. API ENDPOINTS

Create a clean service/API layer.

Minimum endpoints:

GET /companies
GET /companies/:id
GET /companies/:id/metrics
GET /companies/:id/financials
GET /companies/:id/valuation
GET /companies/:id/scores
GET /companies/:id/analysis
GET /companies/:id/changes
GET /search?q=
POST /watchlists
POST /watchlists/:id/companies
DELETE /watchlists/:id/companies/:companyId
GET /alerts
PATCH /alerts/:id/read

Admin/internal:

POST /internal/ingestion/company/:id
POST /internal/scoring/company/:id
POST /internal/analysis/company/:id
POST /internal/monitoring/company/:id

Protect internal endpoints.

⸻

48. FIRST IMPLEMENTATION

Do NOT attempt to connect thousands of companies immediately.

Start with:

NVIDIA
Microsoft
Apple
Amazon
Meta
Tesla
Spotify
ASML
Novo Nordisk
Alphabet

The database architecture must nevertheless support thousands of companies.

⸻

49. DEVELOPMENT PHASES

Implement in this order.

PHASE 1

Database schema.

PHASE 2

Seed 10 companies.

PHASE 3

Provider abstraction.

PHASE 4

Import real financial data where API credentials are available.

PHASE 5

Normalize financial data.

PHASE 6

Calculate derived metrics.

PHASE 7

Implement scoring engine.

PHASE 8

Connect scores to existing Company Page.

PHASE 9

Implement AI analysis.

PHASE 10

Implement change detection.

PHASE 11

Implement alerts.

PHASE 12

Implement Discovery.

Do not jump directly to Phase 12.

⸻

50. CRITICAL TEST CASES

Create automated tests for:

Missing data

A missing metric must not produce a fabricated score.

Currency

USD and EUR data must be normalized correctly.

Periods

Quarterly, annual and TTM values must remain distinct.

Negative earnings

P/E must not become meaningless negative valuation data.

Negative FCF

FCF yield calculations must handle negative FCF correctly.

Financial companies

Do not blindly apply industrial-company ratios to banks.

Different industries

Scoring must be configurable by industry.

Data revisions

If a source revises historical data, preserve the previous snapshot.

Score reproducibility

The same dataset + same scoring version must produce the same score.

⸻

51. MOST IMPORTANT RULE

The system must be explainable.

If Equity AI says:

Fundamental Score: 87

the system must be able to answer:

Why 87?
Growth: 92
Profitability: 88
Financial Health: 91
Valuation: 71
Capital Allocation: 84
Competitive Advantage: 90
Management: 82
Earnings Momentum: 86

Then:

Why is Growth 92?

The system must be able to show the underlying metrics.

Then:

Why is Revenue Growth considered strong?

The system must be able to show:

Company: 31.2%
3Y CAGR: 27.4%
Industry median: 11.8%
Peer percentile: 94
Trend: Accelerating

This is the transparency that makes Equity AI different.

⸻

52. FINAL ARCHITECTURE

The finished backend should conceptually look like:

                    EQUITY AI
                        │
                        ▼
                 DATA PROVIDERS
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
        RAW FINANCIAL          MARKET DATA
             │                     │
             └──────────┬──────────┘
                        ▼
                 NORMALIZATION
                        │
                        ▼
                   VALIDATION
                        │
                        ▼
              CANONICAL DATA LAYER
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
        HISTORICAL    PEERS      ESTIMATES
            │           │           │
            └───────────┼───────────┘
                        ▼
                CALCULATED METRICS
                        │
                        ▼
                 SCORING ENGINE
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
   FUNDAMENTAL SCORE       OPPORTUNITY SCORE
            │
            ▼
                AI ANALYSIS ENGINE
                        │
                        ▼
                 INVESTMENT THESIS
                        │
                        ▼
                CHANGE DETECTION
                        │
                        ▼
                     ALERTS
                        │
                        ▼
                  EQUITY AI UI

⸻

FINAL DEVELOPMENT INSTRUCTION

Do not treat this as a simple CRUD application.

Equity AI is fundamentally a financial data + quantitative scoring + AI interpretation platform.

The database must therefore be designed around:

Accuracy → Traceability → Historical data → Benchmarking → Reproducibility → Explainability → Scalability

The existing frontend should remain intact wherever possible.

Replace the current hardcoded/demo scoring with the new modular architecture.

Do not invent financial data.

Do not hardcode scores.

Do not hardcode analysis.

Do not let AI generate factual financial values.

Build the database schema, data models, scoring engine architecture, provider interfaces, calculation engine and API layer first.

Then connect the existing Equity AI interface to the real system.

The end goal is:

A user searches for a company → Equity AI retrieves verified data → normalizes it → calculates metrics → benchmarks it → scores it → explains the score → generates a thesis → continuously monitors the company → detects meaningful changes → updates the score → alerts the user.

Build this foundation so that the system can eventually scale from 10 companies to thousands of publicly listed companies without redesigning the core architecture.
