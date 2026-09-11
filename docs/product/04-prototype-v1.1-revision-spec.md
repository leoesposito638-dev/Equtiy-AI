# Equity AI — Prototype 1 → V1.1 Revision Specification

> Archived verbatim as originally provided. See `docs/product/README.md` for context.
> This is the product-review-driven revision that produced the current
> `docs/prototypes/prototype-1.2` file.

You are now updating Equity AI Prototype 1 into Prototype 1 — V1.1.

IMPORTANT:
Do NOT rebuild the application from scratch.
Do NOT change the overall visual identity.
Do NOT replace the existing architecture unnecessarily.
Do NOT invent new product features.

Prototype 1 is the foundation.

Your job is to implement the changes below based on the product feedback from our first real prototype review.

The goal is to make the product cleaner, easier to understand and more trustworthy without removing useful depth.

==================================================
1. CORE PRODUCT PRINCIPLE
==================================================

The central principle for this iteration is:

SIMPLE BY DEFAULT.
DEEP BY CHOICE.

We do NOT want to remove functionality.

Instead, information should only be shown when it is useful in the current context.

Do not show information twice when it already has its own dedicated destination.

The Company Page should feel calm and simple even though Equity AI contains a very deep research system underneath.

==================================================
2. KEEP WHAT ALREADY WORKS
==================================================

Preserve the following aspects of Prototype 1:

- Clean white/light-gray visual language
- Dark navy/black typography
- Green / yellow / red semantic colors
- Minimal icons
- Clean sidebar
- Search flow
- Maximum 3 Recent Searches
- Company logo + company name + ticker + exchange
- Short company description
- Add to Watchlist
- Fundamental Score
- Why This Score
- All 8 scoring categories
- Financials tab
- Valuation tab
- Analysis tab
- Bull / Base / Bear interaction
- What Changed
- Progressive Disclosure
- Responsive structure
- Reusable component architecture
- Demo fixture architecture

Do not redesign these unnecessarily.

==================================================
3. DASHBOARD CHANGES
==================================================

REMOVE:

Upcoming Earnings from the main Dashboard.

Reason:

If a user follows many companies, a large Upcoming Earnings section creates unnecessary information density and makes the Dashboard feel long.

Upcoming earnings information should instead belong to the relevant company context, such as:

Company Page / Watchlist / company-specific information.

Do NOT simply delete the underlying concept from the application architecture if it may be useful later.

For this prototype, remove it from the Dashboard.

The Dashboard should remain focused on:

- Search
- Your Companies
- Recent Changes
- Interesting Companies

Keep the Dashboard concise.

==================================================
4. COMPANY PAGE — IMPORTANT CHANGE
==================================================

The Company Page currently exposes too much information in Overview.

We want to make Overview significantly cleaner.

The first frame should remain:

COMPANY IDENTITY

Logo
Company name
Ticker
Exchange
Sector / Industry where appropriate
Short factual company description
Add to Watchlist

Then:

FUNDAMENTAL SCORE

Example:

91
STRONG

Then:

WHY THIS SCORE

with all 8 categories.

This structure is GOOD and should remain.

==================================================
5. REMOVE KEY FINANCIALS FROM OVERVIEW
==================================================

REMOVE the separate "Key Financials" section from the Company Overview.

Do NOT display a second set of financial metrics below Why This Score.

Financial information already has its own dedicated:

FINANCIALS

tab.

The user should decide to enter Financials if they want more numbers.

Reason:

Showing financial numbers both on Overview and inside Financials creates duplication and unnecessary cognitive load.

The philosophy is:

If the user wants financial detail → they click Financials.

Do not punish users who are less familiar with financial terminology by showing them unnecessary numbers before they ask for them.

==================================================
6. REMOVE VALUATION SUMMARY FROM OVERVIEW
==================================================

REMOVE the separate Valuation section from Overview.

Valuation already has its own:

VALUATION

tab.

Do not show the same valuation metrics in two places.

The Overview should not contain:

Forward P/E
Peer Median
FCF Yield
Valuation Score
etc.

Those belong inside the Valuation tab.

The user who wants valuation information can click Valuation.

==================================================
7. COMPANY OVERVIEW — FINAL INFORMATION HIERARCHY
==================================================

The Company Overview should now feel approximately like:

--------------------------------------------------

[NVIDIA LOGO]

NVIDIA
NVDA · NASDAQ
Technology

American technology company focused on
AI computing and accelerated computing.

+ Add to Watchlist


FUNDAMENTAL SCORE

91
STRONG


WHY THIS SCORE

Growth                    94
Profitability             97
Financial Health          88
Valuation                 72
Capital Allocation        91
Competitive Advantage     96
Management                84
Earnings Momentum         89

--------------------------------------------------

Then provide the main navigation:

Overview
Financials
Valuation
Analysis

Do NOT add large financial summary blocks underneath.

The Overview should feel intentionally sparse.

==================================================
8. OPPORTUNITY SCORE — REMOVE FOR NOW
==================================================

Remove Opportunity Score from the visible Prototype 1 interface.

Do not delete the concept from the architecture if it is already represented in the code.

We are NOT abandoning the idea.

We are pausing its user-facing presentation because its meaning has not yet been defined precisely enough.

Do not show:

Opportunity Score
84

or similar values anywhere in the primary Company UI.

Do not replace it with a made-up explanation.

We will define the Opportunity Score methodology separately before reintroducing it.

IMPORTANT:

Fundamental Score remains.

Opportunity Score is simply not part of this visible V1.1 prototype.

==================================================
9. FINANCIAL TERMINOLOGY — INFORMATION TOOLTIPS
==================================================

Introduce a consistent information/help component for financial terminology.

Use a small:

ⓘ

next to financial terms where a user may reasonably ask:

"What does this mean?"

Examples:

Forward P/E ⓘ
P/E ⓘ
FCF Yield ⓘ
ROIC ⓘ
Revenue Growth ⓘ
EPS Growth ⓘ
Revenue CAGR ⓘ
Operating Margin ⓘ
Net Debt / EBITDA ⓘ
Debt / Equity ⓘ
Current Ratio ⓘ
Interest Coverage ⓘ
Free Cash Flow ⓘ
EV / EBITDA ⓘ
EV / Sales ⓘ
Price / FCF ⓘ
ROE ⓘ

Also include tooltips for other financial terminology that actually appears in the prototype.

IMPORTANT:

Do not add tooltips to every ordinary word.

Only use them where they genuinely improve understanding.

==================================================
10. TOOLTIP CONTENT STRUCTURE
==================================================

Every financial tooltip should follow the same structure:

TERM

WHAT IS IT?

A short, accurate and easy-to-understand definition.

WHY IT MATTERS

A short explanation of why the metric is relevant to an investor.

Keep it concise.

Do NOT write textbook-length explanations.

Do NOT use unnecessary jargon.

Do NOT oversimplify to the point where the definition becomes technically misleading.

Example:

Forward P/E

WHAT IS IT?

Forward P/E shows how much investors are paying for each unit of a company's expected future earnings.

WHY IT MATTERS

It helps indicate how highly the market values a company relative to the earnings investors currently expect it to generate. A high Forward P/E may be reasonable when strong growth is expected, but the metric should be considered together with growth, profitability and risk.

--------------------------------------------------

Example:

FCF Yield

WHAT IS IT?

FCF Yield shows a company's free cash flow relative to its market value.

WHY IT MATTERS

It helps indicate how much free cash flow a company generates relative to what investors are paying for the company.

--------------------------------------------------

Example:

ROIC

WHAT IS IT?

ROIC (Return on Invested Capital) measures how efficiently a company generates operating returns from the capital invested in its business.

WHY IT MATTERS

A high and sustainable ROIC can indicate that a company is effective at turning invested capital into operating returns. It is particularly useful when comparing companies or looking at the trend over time.

==================================================
11. REQUIRED FINANCIAL DEFINITIONS
==================================================

Create a centralized glossary/data structure containing definitions for every financial term exposed by the prototype.

At minimum include:

Revenue

Revenue Growth

Revenue CAGR

EPS

EPS Growth

Gross Margin

Operating Margin

Net Margin

ROIC

ROE

Free Cash Flow

FCF Margin

FCF Yield

P/E

Forward P/E

EV / EBITDA

EV / Sales

Price / FCF

Net Debt / EBITDA

Debt / Equity

Current Ratio

Interest Coverage

Share Count

Share Count Trend

Net Debt

Net Debt Trend

Margin Trend

Growth Acceleration

Guidance

EPS Surprise

Revenue Surprise

Estimate Revision Trend

Enterprise Value

Market Capitalization

Any other financial term actually displayed by the prototype.

Do not invent terms that are not used.

==================================================
12. CENTRALIZED GLOSSARY
==================================================

Do NOT hardcode each tooltip independently inside individual UI components.

Create a reusable centralized glossary structure.

For example conceptually:

financialGlossary = {
  forward_pe: {
    term: "...",
    definition: "...",
    whyItMatters: "..."
  }
}

The exact implementation is up to you.

The important requirement is:

ONE SOURCE OF TRUTH.

The same definition should be reusable throughout:

Financials
Valuation
Why This Score
Category Deep Dives
Analysis

This will make the terminology consistent throughout the product.

==================================================
13. TOOLTIP UX
==================================================

The information icon should be subtle.

It should not look like a major button.

Clicking or hovering over ⓘ should open a small information panel/popover.

The popover should contain:

TERM

What is it?

Why it matters

Keep the interaction clean.

On mobile, the interaction must work with tap.

Do not rely only on hover.

==================================================
14. WHY THIS SCORE
==================================================

Keep all 8 categories visible.

The user explicitly prefers seeing all eight.

Do NOT reduce this to four.

Keep:

Growth
Profitability
Financial Health
Valuation
Capital Allocation
Competitive Advantage
Management
Earnings Momentum

Keep the compact presentation.

Users should be able to expand a category.

Example:

Growth — 94

When expanded:

Revenue Growth
EPS Growth
Revenue CAGR
Growth Acceleration

Each financial term should have its ⓘ explanation where appropriate.

Then:

WHY IT MATTERS

Then:

View detailed analysis →

==================================================
15. PROGRESSIVE DISCLOSURE
==================================================

Strengthen the progressive disclosure model.

The user should experience:

LEVEL 1
What is this company?
How strong are its fundamentals?

LEVEL 2
Why did it receive this score?

LEVEL 3
What financial evidence supports that score?

LEVEL 4
What does the analysis mean?

LEVEL 5
What changed?

Do not expose every level simultaneously.

The user chooses how deep to go.

==================================================
16. FINANCIALS TAB
==================================================

Financials should now become the clear destination for financial data.

It can contain:

Revenue
Revenue Growth
EPS
EPS Growth
Margins
Free Cash Flow
FCF Margin
ROIC
ROE
Balance Sheet
Debt
Liquidity
Historical data
Quarterly data
Annual data

Use appropriate ⓘ tooltips.

Do not duplicate these metrics back onto Overview.

==================================================
17. VALUATION TAB
==================================================

Valuation should become the clear destination for valuation information.

Include:

P/E
Forward P/E
EV / EBITDA
EV / Sales
Price / FCF
FCF Yield
Historical valuation
Peer comparison
Relevant context

Use ⓘ tooltips.

Do not duplicate these metrics onto Overview.

==================================================
18. ANALYSIS TAB
==================================================

Keep:

AI Investment Thesis

Bull
Base
Bear

Risks

Catalysts

What Changed

Keep the presentation compact.

Do not turn Analysis into a huge wall of AI text.

==================================================
19. COMPANY DESCRIPTION
==================================================

Keep the short company description in the Company Header.

It should:

- be approximately one sentence
- explain what the company does
- be easy to understand
- be factual
- NOT be investment advice

Do not make it longer simply to fill space.

==================================================
20. WATCHLIST
==================================================

Keep:

+ Add to Watchlist

and the resulting:

✓ In Watchlist

state.

Do not add unnecessary watchlist functionality in this iteration.

==================================================
21. DEMO DATA
==================================================

Keep NVIDIA, Microsoft and Spotify as the prototype companies.

Keep the existing fixture architecture.

Do not connect live FMP, Supabase or AI APIs in this iteration.

Do not present fixture data as live data.

Keep:

PROTOTYPE · DEMO DATA

visible where appropriate.

==================================================
22. LOGOS
==================================================

Prototype 1 currently uses placeholder letter-mark logos.

Keep the architecture prepared for real company logo assets.

If real logo assets are already available in the project, use them.

If they are not available, do NOT waste time inventing an external logo system.

Keep the placeholder for now but make the component ready for real logo URLs/assets later.

==================================================
23. VISUAL DENSITY
==================================================

The goal of V1.1 is NOT to make the interface emptier for the sake of being empty.

The goal is:

REMOVE DUPLICATION.
REMOVE UNNECESSARY EXPOSURE.
KEEP DEPTH AVAILABLE.

The Company Overview should therefore feel substantially cleaner than Prototype 1.

Whitespace is intentional.

Do not fill empty space simply because it exists.

==================================================
24. DO NOT CHANGE THE PRODUCT PHILOSOPHY
==================================================

Do not turn Equity AI into:

- TradingView
- a stock screener
- a trading terminal
- a crypto dashboard
- an AI chatbot
- a giant financial spreadsheet

Equity AI is:

A clean research platform that helps investors understand what they are investing in.

==================================================
25. TECHNICAL REQUIREMENTS
==================================================

Before editing:

Inspect the existing Prototype 1 codebase.

Reuse existing components wherever sensible.

Do not unnecessarily rewrite working components.

Create reusable components for:

FinancialTooltip
FinancialTerm
Glossary / financial glossary data

Keep financial definitions separate from presentation.

Do not duplicate tooltip text across components.

Ensure existing navigation continues to work.

==================================================
26. VERIFY THE CHANGES
==================================================

After implementation, verify:

1. Dashboard no longer shows Upcoming Earnings.
2. Search still works.
3. Recent Searches still shows max 3.
4. NVIDIA Company Page still opens.
5. Logo/company identity still appears correctly.
6. Fundamental Score still appears.
7. All 8 Why This Score categories still appear.
8. Key Financials no longer appears on Overview.
9. Valuation summary no longer appears on Overview.
10. Financials tab still works.
11. Valuation tab still works.
12. Analysis tab still works.
13. Bull/Base/Bear still works.
14. Watchlist still works.
15. Opportunity Score is not displayed.
16. Financial tooltips work.
17. Tooltips work on mobile/touch.
18. Definitions are centralized rather than duplicated.
19. No existing required interaction has been accidentally broken.
20. The interface remains responsive.

==================================================
27. FINAL PRODUCT TEST
==================================================

After making the changes, evaluate the Company Page using this question:

"If I know little about finance, can I understand the company and its Fundamental Score without being overwhelmed by financial numbers?"

Then ask:

"If I want to go deeper, can I easily find the financial evidence, valuation and analysis?"

The correct answer to BOTH questions should be YES.

==================================================
28. IMPORTANT — DO NOT OVER-INTERPRET
==================================================

Do not make additional product decisions that are not specified here.

If you identify something that you believe should change but is outside this scope:

DO NOT silently implement it.

Instead, report it separately under:

"Potential future improvements"

This keeps Prototype 1 → V1.1 controlled and allows the product team to decide deliberately.

==================================================
29. FINAL OUTPUT
==================================================

After completing the implementation, provide:

1. A concise list of what changed.
2. A list of what was intentionally preserved.
3. A list of what is now hidden behind deeper navigation.
4. A list of all financial terms for which you added definitions.
5. Confirmation that the financial glossary is centralized.
6. Confirmation that Opportunity Score is hidden for now.
7. Confirmation that Upcoming Earnings was removed from Dashboard.
8. Confirmation that Key Financials and Valuation were removed from Overview.
9. Confirmation that the main navigation and interaction flows still work.
10. Any issues or limitations.

Do not claim that anything is live or connected to real financial APIs.

This is Prototype 1 → V1.1.
