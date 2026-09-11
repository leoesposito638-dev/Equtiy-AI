# Equity AI — Prototype V1 UX Specification

> Archived verbatim as originally provided. See `docs/product/README.md` for context.
> This is the specification `docs/prototypes/prototype-1.2` implements the UX direction of.

You are building Prototype V1 of Equity AI.

IMPORTANT:
This is a PRODUCT PROTOTYPE, not the production system. Do not redesign the product, invent new functionality, or change the product philosophy. Follow the specification below exactly.

The purpose of this prototype is to test whether the product we have designed actually feels intuitive, clean, useful and premium when we can interact with it.

==================================================
1. PRODUCT
==================================================

Product name: Equity AI

Equity AI is an AI-powered fundamental equity research platform.

The core idea is:

SEARCH → UNDERSTAND → WATCH → MONITOR

The product should help an investor understand what they are investing in instead of simply giving them more financial information.

The three fundamental pillars are:

1. CLARITY
Make complex financial information understandable.

2. INTELLIGENCE
AI should analyse information and explain what matters. AI is not the product itself; it works on top of structured financial data and calculations.

3. CONTINUOUS MONITORING
The product should continue to follow companies and surface meaningful changes over time.

The central product principle is:

SIMPLE BY DEFAULT.
DEEP BY CHOICE.

Do not remove depth. Hide unnecessary complexity until the user wants it.

==================================================
2. PROTOTYPE SCOPE
==================================================

Build a functioning interactive frontend prototype.

Do NOT attempt to connect FMP, Supabase, external APIs or a live AI model in this prototype.

Use realistic demo fixtures.

However, structure the application so that the demo data can later be replaced by real API responses without rebuilding the frontend architecture.

IMPORTANT:
Never pretend demo data is live data.

If the UI displays demo data, clearly indicate that this is a prototype/demo environment where appropriate.

The prototype must allow the user to navigate and interact with the product naturally.

==================================================
3. DESIGN LANGUAGE
==================================================

The design must be extremely clean.

Think:

Premium financial research product
+
Modern SaaS
+
Apple-like simplicity
+
Professional investment platform

Do NOT make it look like TradingView.

Do NOT make it look like a cryptocurrency dashboard.

Do NOT create a screen full of cards, icons, gradients or graphs.

Visual principles:

- White primary background
- Very light gray secondary backgrounds
- Dark navy/black typography
- Restrained use of color
- Green = good
- Yellow = neutral/okay
- Red = weak/bad
- Minimal icons
- Generous whitespace
- Clear typography hierarchy
- Subtle borders
- Subtle shadows only where necessary
- No excessive rounded cards
- No visual clutter
- No unnecessary animations

The interface should feel calm and trustworthy.

The user should immediately understand where they are and what they are looking at.

==================================================
4. SIDEBAR
==================================================

Create a clean persistent sidebar on desktop.

EQUITY AI

RESEARCH
- Dashboard
- Discover

PORTFOLIO
- Watchlist
- Companies

MONITORING
- Alerts

SETTINGS
- Settings

The sidebar should be simple and text-focused.

Do not use an icon for every single item unless an icon materially improves usability.

On smaller screens, transform this into an appropriate responsive navigation.

==================================================
5. DASHBOARD
==================================================

Create a clean Dashboard.

The Dashboard should contain:

1. Main Search
2. Your Companies
3. Recent Changes
4. Upcoming Earnings
5. Interesting Companies

The Dashboard is not intended to contain every possible metric.

It should function as the user's starting point.

Example structure:

----------------------------------------

Good morning, [Name]

What are you researching today?

[ Search a company or ticker ]

----------------------------------------

YOUR COMPANIES

NVIDIA
Fundamental Score 91
+2.4

Microsoft
Fundamental Score 87
-0.8

...

----------------------------------------

RECENT CHANGES

NVIDIA
Revenue growth improved...

Microsoft
Valuation increased...

----------------------------------------

UPCOMING EARNINGS

...

----------------------------------------

INTERESTING COMPANIES

...

Keep the layout clean.

==================================================
6. SEARCH
==================================================

Search is one of the most important flows.

When the user opens Search, immediately show:

SEARCH A COMPANY OR TICKER

Below the search field:

RECENT SEARCHES

Show MAXIMUM 3 recent searches.

Example:

NVIDIA
Microsoft
Spotify

Recent Searches exist to remind users about companies they previously researched but may have forgotten to add to their Watchlist.

Do NOT create a large search history.

Maximum 3.

When the user searches:

"NVIDIA"

show a clean result:

NVIDIA
NVDA · NASDAQ
Technology

Search results should primarily identify the company.

Do NOT overload search results with:

- charts
- large scores
- financial metrics
- AI text

The analysis starts when the user opens the Company Page.

==================================================
7. COMPANY PAGE — MOST IMPORTANT
==================================================

Create a highly polished NVIDIA Company Page.

This is the most important page in the prototype.

The first five seconds matter.

The user should immediately understand:

1. What company am I looking at?
2. What does the company do?
3. How does Equity AI rate it?

The first frame should contain:

NVIDIA logo
NVIDIA
NVDA · NASDAQ
Technology

A short one-line factual description.

Example:

"American technology company focused on GPUs, artificial intelligence and accelerated computing."

Then:

FUNDAMENTAL SCORE

91

STRONG

And:

+ Add to Watchlist

The logo + company identity + short definition + score must be visible within the same initial frame.

IMPORTANT:
The score should be prominent, but it must NOT dominate the entire page.

We are not building a scoring app.

We are building an equity research platform where the score is one powerful tool.

==================================================
8. COMPANY IDENTITY
==================================================

Use the company's actual logo.

Do not replace it with a generic icon.

Company header should contain:

- Logo
- Company name
- Ticker
- Exchange
- Sector
- Short factual company description
- Fundamental Score
- Add to Watchlist

The company description should be approximately one sentence.

It should explain what the company does, not why the company is a good investment.

==================================================
9. FUNDAMENTAL SCORE
==================================================

Display:

FUNDAMENTAL SCORE

91

STRONG

Use:

Green = strong
Yellow = moderate
Red = weak

The score represents fundamental strength according to Equity AI's scoring model.

It is NOT a stock-price prediction.

Do not phrase it as:

"NVIDIA will go up."

Instead:

"NVIDIA's fundamentals score strongly according to the Equity AI model."

Keep Fundamental Score separate from Opportunity Score.

Do not merge the two.

==================================================
10. WHY THIS SCORE
==================================================

Immediately after the Company Header, introduce:

WHY THIS SCORE

Show the eight fundamental categories:

Growth
Profitability
Financial Health
Valuation
Capital Allocation
Competitive Advantage
Management
Earnings Momentum

Example:

Growth                 94   GREEN
Profitability          97   GREEN
Financial Health       88   GREEN
Valuation              72   YELLOW
Capital Allocation     91   GREEN
Competitive Advantage  96   GREEN
Management              84   GREEN
Earnings Momentum       89   GREEN

This should be compact.

Do NOT create eight enormous cards.

A clean list, compact bars or similarly restrained visualization is preferred.

The user should understand that the overall score is built from underlying categories.

==================================================
11. CATEGORY DEEP DIVE
==================================================

The user should be able to click a category.

Example:

Growth → 94

Opening it should reveal:

Revenue Growth
EPS Growth
Revenue CAGR
Growth Acceleration

Then a short explanation:

WHY IT MATTERS

Then:

View detailed growth analysis →

The interaction should follow:

CATEGORY SCORE
↓
KPI
↓
EVIDENCE
↓
DEEP DIVE

Do not dump every KPI onto the first screen.

==================================================
12. PROGRESSIVE DISCLOSURE
==================================================

This is one of the most important design principles.

Do not try to display all information simultaneously.

Use:

LEVEL 1 — WHAT MATTERS
Company identity + Fundamental Score

LEVEL 2 — WHY
Category scores + key financials + central valuation information

LEVEL 3 — DEEP DIVE
Historical data + peers + detailed calculations + methodology + sources

The user should be able to understand the company without ever entering Level 3.

But advanced users should be able to go extremely deep.

The goal is:

Simple for beginners.
Powerful for experienced investors.

==================================================
13. KEY FINANCIALS
==================================================

Create a compact:

KEY FINANCIALS

Show only the most important metrics in the Overview.

Example:

Revenue
$130.5B

Revenue Growth
+38%

Operating Margin
62%

Free Cash Flow
$...

ROIC
41%

Then:

View financials →

Do NOT show 20+ KPI cards.

The deeper Financials page can contain:

- Revenue history
- Earnings
- Margins
- Free cash flow
- ROIC
- Balance sheet metrics
- Growth metrics
- Quarterly and annual data

But keep those out of the initial Overview.

==================================================
14. VALUATION
==================================================

Create a compact Valuation section.

Example:

VALUATION

Forward P/E
31.2

Peer Median
27.4

FCF Yield
2.8%

Valuation Score
72
YELLOW

Then:

View valuation →

IMPORTANT:

Never communicate valuation with simplistic rules such as:

"Low P/E = good."

Valuation must be contextualized against:

- peers
- historical valuation
- growth
- profitability
- cash flow

The deeper Valuation page can contain all relevant multiples and historical context.

==================================================
15. AI INVESTMENT THESIS
==================================================

Create:

AI INVESTMENT THESIS

The first level should be a short, readable summary.

Example:

"NVIDIA combines exceptional growth, profitability and competitive positioning, while its valuation leaves less room for execution disappointments."

Then create compact tabs:

BULL
BASE
BEAR

Only one case should be visible at a time.

Also provide:

RISKS
CATALYSTS

Do not create a huge wall of AI-generated text.

The AI should explain the evidence rather than replace the evidence.

==================================================
16. WHAT CHANGED
==================================================

Create:

WHAT CHANGED

Show the three most important recent changes.

Example:

GREEN
Revenue Growth
38% → 42%

GREEN
Operating Margin
59% → 62%

RED
Forward P/E
27 → 31

Then:

View all changes →

The purpose is to communicate what has materially changed since the previous analysis.

This is a core part of Continuous Monitoring.

==================================================
17. COMPANY PAGE NAVIGATION
==================================================

Use a small number of clean tabs:

Overview
Financials
Valuation
Analysis

Overview is the primary Company Page.

Financials contains detailed financial information.

Valuation contains detailed valuation information.

Analysis contains:

- AI Investment Thesis
- Bull Case
- Base Case
- Bear Case
- Risks
- Catalysts
- What Changed

Do not create 15 different tabs.

==================================================
18. DEEP DIVE
==================================================

Advanced users should be able to access:

Financials
Growth
Profitability
Financial Health
Valuation
Competitive Advantage
Capital Allocation
Management
Earnings Momentum
Peers
Methodology
Sources

This information should exist, but should not dominate the Overview.

==================================================
19. SOURCES & TRANSPARENCY
==================================================

Where relevant, show source attribution.

Example:

Revenue Growth
Source: Company Filing
Period: Q2 2026

Operating Margin
Source: Company Filing
Period: Q2 2026

The architecture must preserve the distinction:

FACT
↓
CALCULATION
↓
AI INTERPRETATION

Do not present AI-generated interpretation as if it were a factual source.

==================================================
20. DEMO DATA
==================================================

Use realistic fixture data for:

NVIDIA
Microsoft
Spotify

The prototype should contain enough demo data to make the interface feel real.

The numbers are ONLY for demonstrating the interface.

Do not imply that these values are live.

Keep the data in a clearly separated fixture/data layer so it can later be replaced with real API responses.

Do NOT hardwire the UI around NVIDIA-specific values.

The component architecture should work for any company object following the same data structure.

==================================================
21. INTERACTIONS
==================================================

The prototype must actually be clickable.

At minimum:

Dashboard → Search

Search → Recent Search

Search → Company

Company → Add to Watchlist

Company → Category Deep Dive

Company → Financials

Company → Valuation

Company → Analysis

Company → Bull/Base/Bear

Company → What Changed

Sidebar → Dashboard

Sidebar → Discover

Sidebar → Watchlist

Sidebar → Alerts

Buttons such as "View financials", "View valuation", "View all changes" must actually navigate or expand something.

Do not build static screenshots disguised as an application.

==================================================
22. RESPONSIVE DESIGN
==================================================

Build desktop-first because this prototype will primarily be evaluated on desktop.

However, make the entire application responsive.

On mobile:

- sidebar becomes mobile navigation
- cards stack
- score remains clearly visible
- company identity remains visible
- tables become horizontally scrollable or transform appropriately
- no horizontal page overflow

Do not create a completely separate mobile design.

==================================================
23. TECHNICAL ARCHITECTURE
==================================================

Use a clean modern frontend architecture.

React + TypeScript is preferred.

Components should be reusable.

Separate:

- UI components
- page components
- data fixtures
- data models/types
- navigation
- state

Do not create one enormous CompanyPage component.

For example:

CompanyHeader
FundamentalScore
ScoreBreakdown
CategoryScore
KeyFinancials
ValuationSummary
InvestmentThesis
ChangeSummary
SourceAttribution

These should be reusable components.

==================================================
24. VERY IMPORTANT — DO NOT OVERBUILD
==================================================

Do NOT add:

- cryptocurrency features
- trading functionality
- portfolio performance calculations
- social feeds
- chatbots
- unnecessary AI assistants
- complicated animations
- excessive icons
- excessive charts
- extra dashboards
- features not specified above

If you think a new feature would be useful, DO NOT silently add it.

Flag it separately after completing the requested prototype.

==================================================
25. SUCCESS CRITERIA
==================================================

When the prototype is finished, I should be able to do this:

1. Open Equity AI.
2. Understand the product immediately.
3. Search NVIDIA.
4. See NVIDIA's logo and identity.
5. Understand what NVIDIA does.
6. See Fundamental Score 91.
7. Immediately understand that the score is based on multiple fundamental categories.
8. Explore Why This Score.
9. Open individual categories.
10. See key financial metrics.
11. Explore valuation.
12. Read a concise AI Investment Thesis.
13. Switch between Bull/Base/Bear.
14. See What Changed.
15. Add NVIDIA to Watchlist.
16. Navigate around the rest of the application.

The experience should feel:

CLEAN
FAST
PREMIUM
TRUSTWORTHY
INTELLIGENT
SIMPLE

==================================================
26. MOST IMPORTANT PRODUCT TEST
==================================================

Do not optimize this prototype for how impressive the code looks.

Optimize it for this question:

"If I were an investor who has previously bought stocks without fully understanding what I was buying, would Equity AI make me feel that I finally understand what I am investing in?"

If the answer is yes, the prototype is doing its job.

==================================================
27. FINAL INSTRUCTION
==================================================

Build Prototype V1 now.

Before coding, inspect the existing project and reuse any existing components or infrastructure that fit.

Do not destroy existing working functionality unnecessarily.

Implement the prototype as a coherent application, not a collection of disconnected screens.

Do not stop after creating a plan.

Actually build the interactive prototype.

After implementation, verify that the main navigation and Company Research flow work.

At the end, give a concise summary of:

1. What you built.
2. What is interactive.
3. What uses demo fixtures.
4. What is intentionally NOT connected to live APIs yet.
5. Any issues you encountered.

Do not claim anything is live if it is not.
