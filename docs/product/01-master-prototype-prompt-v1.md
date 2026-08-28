# Equity AI — Master Prototype Prompt V1

> Archived verbatim as originally provided. See `docs/product/README.md` for context.

EQUITY AI — MASTER PROTOTYPE PROMPT V1

You are a senior product designer, UX designer and full-stack developer.

Build a premium web application prototype called Equity AI.

This is not yet the final production application.

The purpose of this version is to validate:

* Product concept
* UX
* Navigation
* Visual identity
* Information hierarchy
* Fundamental scoring presentation
* Company monitoring concept
* Discovery concept
* Overall premium feeling

Do NOT over-engineer the backend yet.

Use realistic mock data where necessary.

The application should feel like a serious financial intelligence platform, not an AI chatbot and not a beginner stock-picking website.

⸻

1. CORE PRODUCT IDEA

Equity AI helps investors understand and continuously monitor publicly listed companies.

The fundamental problem:

Many investors have access to enormous amounts of financial information, but the information is fragmented and difficult to interpret.

Users should not need to:

* Read dozens of pages of reports
* Search through multiple websites
* Calculate financial ratios themselves
* Constantly check company announcements
* Ask an AI the same question repeatedly

Instead, Equity AI should collect and structure the relevant information into one place.

The product should answer:

"What is happening with this company, how strong are its fundamentals, and what has changed?"

The second major concept is continuous monitoring.

When a user follows a company, Equity AI should conceptually monitor:

* Earnings reports
* Financial statements
* Press releases
* Guidance changes
* Important company events
* Changes in fundamental metrics
* Relevant external developments

When something important changes, the system should:

1. Detect the change
2. Determine whether it matters
3. Explain what happened
4. Explain why it matters
5. Update the company's fundamental score
6. Notify the user

The user should therefore feel:

"I don't have to constantly look for information. Equity AI watches the companies for me."

⸻

2. THREE CORE PILLARS

Everything in the product should be built around these three pillars.

PILLAR 1 — CLARITY

Make complex financial information understandable.

Not by making the product childish.

The interface should be professional enough for experienced investors while remaining accessible to less experienced investors.

The product should provide:

Data → Interpretation → Explanation

Example:

Instead of only showing:

Revenue Growth: 32%

Show:

Revenue Growth — 32%

Strong

Revenue is growing significantly faster than the company's historical average and remains strong relative to its peer group.

Advanced users can expand further to see:

* Calculation
* Historical development
* Peer comparison
* Source

⸻

PILLAR 2 — CONTINUOUS INTELLIGENCE

Equity AI should continuously follow companies selected by the user.

The user should not need to repeatedly ask:

"What happened to NVIDIA?"

Instead the platform should proactively identify meaningful changes.

Example:

NVIDIA

Fundamental Score
91 → 87

Why did it change?

Gross margin declined more than expected and management lowered forward guidance.

This is one of the most important differentiators of the product.

⸻

PILLAR 3 — DISCOVERY

Equity AI should proactively discover interesting companies.

The system should scan the market and identify companies based on combinations of:

* Strong growth
* Improving profitability
* Strong balance sheet
* High-quality cash generation
* Attractive valuation
* Improving fundamentals
* Positive changes in company performance

The purpose is NOT to tell users:

"BUY THIS STOCK."

Instead:

"This company has become interesting. Here's why."

The user can then investigate further.

⸻

3. DESIGN PHILOSOPHY

The design is extremely important.

The first impression should be:

Clean. Premium. Intelligent. Professional. Calm.

Avoid:

* Overly colorful dashboards
* Excessive charts
* Crypto-style aesthetics
* Gamification
* Huge amounts of information
* Generic AI chatbot aesthetics
* Beginner-finance clichés

Think:

Bloomberg intelligence + modern SaaS + Apple-level simplicity

But do NOT copy any existing company's design.

⸻

4. NAVIGATION

Use a simple left sidebar on desktop.

Logo:

equityAI

Navigation:

Overview

The user's home dashboard.

My Companies

The user's followed companies.

This should feel like the user's personal investment watchlist.

Discover

Companies Equity AI thinks are interesting.

Alerts

Important changes detected in followed companies.

Keep navigation extremely simple.

⸻

5. OVERVIEW PAGE

The Overview page should immediately communicate:

"Here is what matters right now."

Top:

Good morning.

Subtitle:

Your companies, continuously analyzed.

Then a search bar:

Search company or ticker…

Example:

NVIDIA
Microsoft
Spotify
Apple
Tesla

YOUR COMPANIES

Display followed companies in a clean table/card.

Example:

Company	Score	Change	Status
NVIDIA	91	+2	Strong
Microsoft	88	0	Strong
Spotify	82	+4	Improving

The score should be visually prominent but not overwhelming.

⸻

6. WHAT CHANGED

This is an extremely important section.

Show meaningful recent changes.

Example:

NVIDIA

Fundamental Score: 91 → 93

Profitability improved following the latest earnings report.

Spotify

Fundamental Score: 78 → 82

Operating margin improved materially.

The user should immediately understand:

What happened → Why it matters → What changed in the score

⸻

7. DISCOVERY

On the Overview page, include a small Discovery section.

Example:

Companies worth looking into

Company X — 89

Strong revenue acceleration combined with improving free cash flow.

Company Y — 86

High-quality balance sheet with improving return on invested capital.

Company Z — 84

Attractive valuation relative to historical profitability.

Button:

Analyze

Do not make these recommendations look like guaranteed investment advice.

⸻

8. MY COMPANIES

This is one of the most important pages.

The user should be able to see every company they follow.

Example:

My Companies

Company	Score	Change	Last Updated
NVIDIA	91	+2	Today
Microsoft	88	0	1 day ago
Spotify	82	+4	2 days ago

Clicking a company opens its company page.

⸻

9. COMPANY PAGE

This is the core product experience.

Example:

NVIDIA

NVDA · NASDAQ · Technology

Large:

91

Fundamental Score

Status:

Excellent

Then show the underlying dimensions.

Growth

96

Profitability

97

Financial Health

92

Valuation

68

Quality

94

Momentum

95

The score dimensions should be visually clean and easy to understand.

⸻

10. WHY THIS SCORE?

This section is extremely important.

The AI should explain the score in natural language.

Example:

Why this score?

Growth and profitability are the company's strongest areas. Revenue growth remains well above relevant peers and operating margins are exceptionally strong.

Valuation is currently the main constraint. The current multiple requires continued strong execution to justify the premium.

The explanation should feel like an analyst explaining the company, not a chatbot talking.

⸻

11. KEY FUNDAMENTALS

Show the most important underlying metrics.

Initial prototype metrics:

Revenue Growth

42.1%

YoY

Operating Margin

54.1%

TTM

Free Cash Flow Margin

28.4%

TTM

Each metric should eventually have:

* Current value
* Historical trend
* Peer comparison
* Interpretation
* Source
* Calculation methodology

For the prototype, mock these elements where necessary.

⸻

12. SCORING SYSTEM

The score should range from:

0–100

Initial high-level dimensions:

1. Growth
2. Profitability
3. Financial Health
4. Valuation
5. Quality
6. Momentum

The prototype does NOT need to implement the final production scoring algorithm yet.

However, structure the UI so that the scoring engine can later be connected.

Important:

Do NOT make the scoring system feel arbitrary.

The future system will be based on:

* Historical performance
* Peer comparisons
* Industry-specific benchmarks
* Financial ratios
* Trends
* Quality of earnings
* Balance sheet strength
* Valuation
* Market context

The score should eventually be explainable.

⸻

13. DISCOVER PAGE

Create a dedicated Discovery page.

The user should be able to discover companies based on different characteristics.

Initial categories:

Strong Growth

Improving Fundamentals

High Quality

Attractive Valuation

Strong Financial Health

Then:

Interesting right now

with example companies.

Each company should show:

* Score
* Main reason it was discovered
* Relevant strength
* Analyze button

⸻

14. ALERTS

Create a dedicated Alerts page.

The purpose is NOT to send notifications for every tiny movement.

Only meaningful events.

Examples:

NVIDIA

Fundamental score changed

91 → 87

Reason:

Management reduced forward guidance.

⸻

Spotify

Profitability improved

Score: 78 → 82

Reason:

Operating margin improved materially.

Future alerts should eventually include:

* Earnings releases
* Guidance changes
* Major score changes
* Fundamental deterioration
* Fundamental improvement
* Major valuation changes
* Important company announcements
* Significant external events

⸻

15. SEARCH

Search should be prominent.

The user should be able to search:

* Company name
* Ticker

Examples:

"NVIDIA"

"NVDA"

"Microsoft"

"MSFT"

"Spotify"

"SPOT"

For the prototype, use a limited dataset.

At least include:

* NVIDIA
* Microsoft
* Spotify
* Apple
* Tesla
* Amazon
* Google

⸻

16. RESPONSIVE DESIGN

The product must work beautifully on:

* Desktop
* Laptop
* Tablet
* Mobile

On mobile, convert the sidebar into a clean mobile navigation.

Do NOT simply shrink the desktop UI.

Reorganize information appropriately.

⸻

17. IMPORTANT PRODUCT PRINCIPLE

Do NOT make the product feel like a financial textbook.

We want:

Professional first. Simple second.

An experienced investor should look at Equity AI and think:

"This is a serious financial intelligence product."

A beginner should look at the same page and think:

"I actually understand what I'm looking at."

Both users should use the same interface.

Advanced explanations can be expandable.

⸻

18. DATA ARCHITECTURE — PROTOTYPE

For this version:

Use mock/static data.

Structure the code so that real APIs can later replace the mock data.

Create a clear abstraction between:

UI

↓

Company data

↓

Financial metrics

↓

Scoring engine

↓

AI explanation

↓

Alerts

Do not hardcode the architecture in a way that makes future API integration difficult.

⸻

19. FUTURE PRODUCTION ARCHITECTURE

Do not fully implement this yet, but design the prototype so it can evolve toward:

Data Layer

Financial market API
Company filings
Press releases
News
Macro data

↓

Data Processing

Normalize financial data.

↓

Fundamental Engine

Calculate metrics.

↓

Scoring Engine

Calculate 0–100 scores.

↓

AI Analysis Layer

Explain changes.

↓

Monitoring Engine

Continuously monitor followed companies.

↓

Alert Engine

Determine whether a change is significant.

↓

User

Dashboard + notifications.

⸻

20. MOST IMPORTANT UX RULE

Every page should answer:

What should the user understand within 5 seconds?

Do not overwhelm the user.

Information hierarchy should be:

Level 1

What happened?

Level 2

How important is it?

Level 3

Why?

Level 4

Show me the data.

Level 5

Show me the methodology.

This is extremely important.

⸻

21. VISUAL DIRECTION

Use:

* White cards
* Light gray background
* Dark typography
* Subtle borders
* Generous whitespace
* Rounded but not excessive corners
* Very restrained accent colors
* Green/red only where meaningful
* Clean charts
* Premium typography

Avoid excessive gradients.

Avoid neon colors.

Avoid giant decorative graphics.

Avoid unnecessary animations.

The application should feel expensive and trustworthy.

⸻

22. PROTOTYPE DATA

Use realistic-looking mock data.

Clearly structure the code so mock data is isolated.

Do NOT claim that the prototype data is live.

Add subtle wording where appropriate:

Prototype data

or

Data integration coming in production version.

⸻

23. IMPORTANT: DO NOT BUILD THESE YET

Do NOT spend time implementing:

* Payments
* Authentication
* Real-time financial APIs
* Complex backend infrastructure
* Push notifications
* Subscription system
* Production database
* Advanced AI agents

Those belong to the next development phase.

The goal of V1 is:

Prove that the product experience is compelling.

⸻

24. SUCCESS CRITERIA

When finished, I should be able to:

1. Open Equity AI
2. Immediately understand what it does
3. Search for a company
4. Open the company
5. See its Fundamental Score
6. Understand why the score is what it is
7. See the most important fundamentals
8. Follow the company
9. See changes to followed companies
10. Explore newly discovered companies
11. Understand alerts

The entire experience should feel like a real premium financial intelligence platform, even though this is only a prototype.

⸻

FINAL INSTRUCTION

Do not build a generic stock dashboard.

Build the first visual/product prototype of Equity AI.

The central idea must remain:

"Equity AI continuously follows the companies I care about, simplifies the information, explains what matters, and tells me when something important changes."

Prioritize:

Clarity → Premium UX → Simplicity → Intelligence → Explainability

Do not sacrifice the professional feeling in an attempt to make everything beginner-friendly.

Build the prototype now.
