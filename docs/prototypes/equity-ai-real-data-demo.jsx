import React, { useState, useMemo, useRef, useEffect } from "react";

/* ============================================================================
   EQUITY AI — REAL-DATA DEMO

   A standalone, self-contained React component rendering the Equity AI
   product against real data — a point-in-time capture (2026-09-07) of the
   actual Supabase-backed scoring/financials database for the full
   30-company demo universe (see frontend/src/data/realDemoSnapshot.json
   in the main repo, and backend/src/localDev/exportRealDemoSnapshot.ts,
   which produced it).

   Visual language, navigation and interaction patterns are ported from
   docs/prototypes/prototype-1.2 (the original UX reference prototype) —
   same sidebar structure, same tabbed company page, same search/watchlist
   flow. The difference is the data: COMPANIES_DATA below is not a fixture.
   Every score, growth metric, and financial figure is a real value read
   straight from the database at export time — nothing estimated,
   nothing defaulted to zero. Valuation, AI Thesis and What Changed are
   shown as honestly unavailable because that's their real current state
   for all 30 companies (0% coverage), not because they were omitted here.

   This file has no build step of its own and is not part of /frontend's
   build — same as prototype-1.2. It's written as plain ES-module JSX
   (real `import` statements, `export default`) for readability and to
   match prototype-1.2's own conventions; to actually render it standalone
   (e.g. as a Claude artifact, or in a React sandbox), the `import`
   statements need to become CDN/global references instead — React and
   ReactDOM are widely available as UMD builds, and no other library is
   required (icons here are hand-drawn inline SVG, not a package).

   PROTOTYPE · REAL-DATA SNAPSHOT — not the production frontend
   (that's /frontend, wired to the live API). Not live data — nothing on
   this page updates in real time.
   ========================================================================== */

const COMPANIES_DATA = [{"id":"c9ea59c8-3e78-48a9-a6cb-0496e0ffbcc4","ticker":"ADBE","name":"Adobe Inc.","exchange":"NASDAQ","sector":"Technology","industry":"Software","fundamental":{"score":70.8,"confidence":0.274,"coverage":0.429,"previousScore":70.8,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":69.6,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":76.7,"confidence":0.625},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":49.2,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.35},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":10.527784236224134,"periodEnd":"2025-11-28"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":10.522339932516122,"periodEnd":"2025-11-28"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":34.59372485921159,"periodEnd":"2025-11-28"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":18.203090567988724,"periodEnd":"2025-11-28"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":0.1434786227127726,"periodEnd":"2025-11-28"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":23769000000,"periodEnd":"2025-11-28","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":10.527784236224134,"periodEnd":"2025-11-28","format":"percent"},{"key":"eps","label":"EPS","value":16.73,"periodEnd":"2025-11-28","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":34.59372485921159,"periodEnd":"2025-11-28","format":"percent"},{"key":"net_margin","label":"Net Margin","value":29.99705498758888,"periodEnd":"2025-11-28","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":36.62754007320459,"periodEnd":"2025-11-28","format":"percent"},{"key":"roe","label":"ROE","value":61.34388712036479,"periodEnd":"2025-11-28","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":9852000000,"periodEnd":"2025-11-28","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":41.44894610627288,"periodEnd":"2025-11-28","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":1000000000,"periodEnd":"2009-11-27","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"7fbe761a-27a8-4536-af59-6d62e1df5527","ticker":"GOOGL","name":"Alphabet","exchange":"NASDAQ","sector":"Technology","industry":"Internet Content & Info","fundamental":{"score":72.8,"confidence":0.256,"coverage":0.391,"previousScore":72.8,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":79.1,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":76.8,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":45,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.325},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":15.090081081544376,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":12.511745609215975,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":34.194341943419424,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":33.45576988820247,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":3.2036554271374293,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":402836000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":15.090081081544376,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":10.91,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":34.194341943419424,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":32.80987796522654,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":32.032638592380025,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":31.82786895115167,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":73266000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":18.187550268595658,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":46547000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"26bb7942-30f3-4e6d-bf9e-6cc828dd9448","ticker":"AMZN","name":"Amazon","exchange":"NASDAQ","sector":"Consumer Discretionary","industry":"Internet Retail","fundamental":{"score":66.9,"confidence":0.283,"coverage":0.445,"previousScore":66.9,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":72.1,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":61.4,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":62.1,"confidence":0.5},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.275},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.175},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":12.377754683294695,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":11.731283601806375,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":28.79858657243816,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":null,"periodEnd":null},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":0.2740902767055123,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":716924000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":12.377754683294695,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":7.29,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":28.79858657243816,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":10.83378433418326,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":11.155296795755199,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":18.89482198679041,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":7695000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":1.07333552789417,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":65648000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"31b2ab43-0dfd-45e7-b62e-2e9c8c3e2185","ticker":"BAC","name":"Bank of America Corporation","exchange":"NYSE","sector":"Financial Services","industry":"Banks - Diversified","fundamental":{"score":51.5,"confidence":0.128,"coverage":0.136,"previousScore":51.5,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":56,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":44.1,"confidence":0.3},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":null,"confidence":null},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":null,"confidence":null},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":6.840424727932286,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":6.003133969580876,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":19.504643962848295,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":6.339371889421086,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-0.6972178624688231,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":113097000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":6.840424727932286,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":3.86,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":19.504643962848295,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":26.975958690327772,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":10.060908248500377,"periodEnd":"2025-12-31","format":"percent"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"5c3533b9-7222-4374-803c-5a958c803b82","ticker":"CAT","name":"Caterpillar Inc.","exchange":"NYSE","sector":"Industrials","industry":"Farm & Heavy Construction Machinery","fundamental":{"score":56.7,"confidence":0.242,"coverage":0.363,"previousScore":56.7,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":31.6,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":68.9,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":65.1,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":69,"confidence":0.325},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":4.289527689055532,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":4.38323160905727,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-14.749661705006778,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":14.110313261977447,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-4.27740116464315,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":67589000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":4.289527689055532,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":18.9,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-14.749661705006778,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":13.141191614020034,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":16.498246756128957,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":41.664321230884696,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":8918000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":13.194454718963144,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":30696000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"7ccc6d7d-70f5-460a-ad06-d60ed5a716c0","ticker":"CVX","name":"Chevron Corporation","exchange":"NYSE","sector":"Energy","industry":"Oil & Gas Integrated","fundamental":{"score":19.3,"confidence":0.167,"coverage":0.214,"previousScore":19.3,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":7.8,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":21,"confidence":0.3},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":25,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":59.1,"confidence":0.15},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":-6.785770641839915,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":-8.43747615537762,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-31.86475409836065,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-28.717489047634626,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":5.80561865062139,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":189031000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":-6.785770641839915,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":6.65,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-31.86475409836065,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":6.50634022990938,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":6.5964065433091985,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":16592000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":8.777396300077765,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":33477000000,"periodEnd":"2017-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"432f58a3-ef81-44ce-9cfd-3c34ac1d4bc1","ticker":"COP","name":"ConocoPhillips","exchange":"NYSE","sector":"Energy","industry":"Oil & Gas E&P","fundamental":{"score":40.1,"confidence":0.157,"coverage":0.193,"previousScore":40.1,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":42,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":33.2,"confidence":0.3},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":34.3,"confidence":0.075},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":53.2,"confidence":0.15},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":7.670106859073888,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":-9.106174739359629,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-18.67007672634271,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-24.228960095964357,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":18.073721353199897,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":58944000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":7.670106859073888,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":6.36,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-18.67007672634271,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":13.55184581976113,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":12.386992727216338,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":18155000000,"periodEnd":"2022-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":23.12915636863964,"periodEnd":"2022-12-31","format":"percent"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"6dfeaa9d-1668-4859-abea-d0e1e2beaa2b","ticker":"COST","name":"Costco Wholesale Corporation","exchange":"NASDAQ","sector":"Consumer Staples","industry":"Discount Stores","fundamental":{"score":62.7,"confidence":0.238,"coverage":0.355,"previousScore":62.7,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":55.8,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":61.9,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":67,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.175},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":8.167323631476146,"periodEnd":"2025-08-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":6.640442726947482,"periodEnd":"2025-08-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":9.945750452079558,"periodEnd":"2025-08-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":11.467010327399718,"periodEnd":"2025-08-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":0.7050035854358955,"periodEnd":"2025-08-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":275235000000,"periodEnd":"2025-08-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":8.167323631476146,"periodEnd":"2025-08-31","format":"percent"},{"key":"eps","label":"EPS","value":18.24,"periodEnd":"2025-08-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":9.945750452079558,"periodEnd":"2025-08-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":2.9425763438516177,"periodEnd":"2025-08-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":3.7724126655403563,"periodEnd":"2025-08-31","format":"percent"},{"key":"roe","label":"ROE","value":27.770539020710466,"periodEnd":"2025-08-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":7837000000,"periodEnd":"2025-08-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":2.8473849619416134,"periodEnd":"2025-08-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":5713000000,"periodEnd":"2025-08-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"ec7357d8-61b8-4498-9c6b-54a660df327f","ticker":"DE","name":"Deere & Company","exchange":"NYSE","sector":"Industrials","industry":"Farm & Heavy Construction Machinery","fundamental":{"score":26.1,"confidence":0.191,"coverage":0.261,"previousScore":26.1,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":7.2,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":28.1,"confidence":0.425},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":46.4,"confidence":0.175},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.15},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":-11.663701755742903,"periodEnd":"2025-11-02"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":-4.576331885156371,"periodEnd":"2025-11-02"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-27.905169063350172,"periodEnd":"2025-11-02"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-7.4764386282277995,"periodEnd":"2025-11-02"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-14.080704939533396,"periodEnd":"2025-11-02"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":45684000000,"periodEnd":"2025-11-02","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":-11.663701755742903,"periodEnd":"2025-11-02","format":"percent"},{"key":"eps","label":"EPS","value":18.55,"periodEnd":"2025-11-02","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-27.905169063350172,"periodEnd":"2025-11-02","format":"percent"},{"key":"net_margin","label":"Net Margin","value":11.00385255231591,"periodEnd":"2025-11-02","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":17.478149895583574,"periodEnd":"2024-10-27","format":"percent"},{"key":"roe","label":"ROE","value":19.371868978805395,"periodEnd":"2025-11-02","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":6099000000,"periodEnd":"2025-11-02","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":13.350407144733387,"periodEnd":"2025-11-02","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":32888000000,"periodEnd":"2021-10-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"db85bb5b-8305-4775-bcf7-297e65e203e4","ticker":"LLY","name":"Eli Lilly and Company","exchange":"NYSE","sector":"Healthcare","industry":"Drug Manufacturers","fundamental":{"score":91.5,"confidence":0.139,"coverage":0.157,"previousScore":91.5,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":97.9,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":84.4,"confidence":0.3},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":75,"confidence":0.075},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":null,"confidence":null},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":44.70394955930999,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":31.687374880620432,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":95.57823129251702,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":49.16429063716448,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":12.572146179796533,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":65179000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":44.70394955930999,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":23,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":95.57823129251702,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":31.666641096058544,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":77.78405879027699,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":40868000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"5cdb92dc-0127-4b89-8d3f-f8c112f57c1f","ticker":"INTC","name":"Intel Corporation","exchange":"NASDAQ","sector":"Technology","industry":"Semiconductors","fundamental":{"score":34.2,"confidence":0.24,"coverage":0.391,"previousScore":34.2,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":17.6,"confidence":0.3},{"key":"PROFITABILITY","label":"Profitability","score":31.4,"confidence":0.625},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":55,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":25,"confidence":0.325},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":-0.4670345191239336,"periodEnd":"2025-12-27"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":-5.712887978236014,"periodEnd":"2025-12-27"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-79.48717948717949,"periodEnd":"2023-12-30"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":null,"periodEnd":null},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":6.765245705515586,"periodEnd":"2025-12-27"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":52853000000,"periodEnd":"2025-12-27","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":-0.4670345191239336,"periodEnd":"2025-12-27","format":"percent"},{"key":"eps","label":"EPS","value":-0.06,"periodEnd":"2025-12-27","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-79.48717948717949,"periodEnd":"2023-12-30","format":"percent"},{"key":"net_margin","label":"Net Margin","value":-0.5051747299112632,"periodEnd":"2025-12-27","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":-4.188976973870925,"periodEnd":"2025-12-27","format":"percent"},{"key":"roe","label":"ROE","value":-0.23363463742879392,"periodEnd":"2025-12-27","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":-4949000000,"periodEnd":"2025-12-27","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":-9.36370688513424,"periodEnd":"2025-12-27","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":44086000000,"periodEnd":"2025-12-27","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"0d544b2c-e068-4e6a-b0f5-2733ae027bc2","ticker":"IBM","name":"International Business Machines","exchange":"NYSE","sector":"Technology","industry":"Information Technology Services","fundamental":{"score":69.2,"confidence":0.204,"coverage":0.288,"previousScore":69.2,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":68.5,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":68,"confidence":0.4},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":64.6,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.325},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":7.620352811817761,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":3.717667987880624,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":73.96630934150075,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":84.12057159046921,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":2.711547626791088,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":67535000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":7.620352811817761,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":11.36,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":73.96630934150075,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":15.685200266528469,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":32.44609164420485,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":12102000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":17.91959724587251,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":54836000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"00c174d0-515a-405c-94fd-8392eab4e92d","ticker":"JNJ","name":"Johnson & Johnson","exchange":"NYSE","sector":"Healthcare","industry":"Drug Manufacturers","fundamental":{"score":51.2,"confidence":0.232,"coverage":0.343,"previousScore":51.2,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":65.9,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":46.7,"confidence":0.4},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":38.3,"confidence":0.275},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":25,"confidence":0.1},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":48.1,"confidence":0.325},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":6.048119251078011,"periodEnd":"2025-12-28"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":5.599284954178807,"periodEnd":"2025-12-28"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":90.58219178082194,"periodEnd":"2025-12-28"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":17.676972555778224,"periodEnd":"2025-12-28"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-0.20696925307082026,"periodEnd":"2025-12-28"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":94193000000,"periodEnd":"2025-12-28","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":6.048119251078011,"periodEnd":"2025-12-28","format":"percent"},{"key":"eps","label":"EPS","value":11.13,"periodEnd":"2025-12-28","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":90.58219178082194,"periodEnd":"2025-12-28","format":"percent"},{"key":"net_margin","label":"Net Margin","value":28.45646704107524,"periodEnd":"2025-12-28","format":"percent"},{"key":"roe","label":"ROE","value":32.87059746885117,"periodEnd":"2025-12-28","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":19698000000,"periodEnd":"2025-12-28","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":20.91238202414192,"periodEnd":"2025-12-28","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":39438000000,"periodEnd":"2025-12-28","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"ffb97676-d72b-44e9-a190-25a8a57da417","ticker":"JPM","name":"JPMorgan Chase & Co.","exchange":"NYSE","sector":"Financial Services","industry":"Banks - Diversified","fundamental":{"score":46.1,"confidence":0.128,"coverage":0.136,"previousScore":46.1,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":33.9,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":66.4,"confidence":0.3},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":null,"confidence":null},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":null,"confidence":null},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":2.7546238933069005,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":12.337567967520657,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":1.3137948458817665,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":18.334033738266676,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-10.048539873541584,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":182447000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":2.7546238933069005,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":20.05,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":1.3137948458817665,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":31.268258727192006,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":15.74007140531622,"periodEnd":"2025-12-31","format":"percent"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"056dab83-bac8-4ecc-9292-299aff928c77","ticker":"LOW","name":"Lowe's Companies, Inc.","exchange":"NYSE","sector":"Consumer Discretionary","industry":"Home Improvement Retail","fundamental":{"score":42.3,"confidence":0.26,"coverage":0.401,"previousScore":42.3,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":33.1,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":47.6,"confidence":0.625},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":59.9,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":25,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":45.6,"confidence":0.35},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":3.121638740827497,"periodEnd":"2026-01-30"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":-3.8458186348783285,"periodEnd":"2026-01-30"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-3.1020408163265367,"periodEnd":"2026-01-30"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":5.184121096662819,"periodEnd":"2026-01-30"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":7.063657850101362,"periodEnd":"2026-01-30"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":86286000000,"periodEnd":"2026-01-30","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":3.121638740827497,"periodEnd":"2026-01-30","format":"percent"},{"key":"eps","label":"EPS","value":11.87,"periodEnd":"2026-01-30","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-3.1020408163265367,"periodEnd":"2026-01-30","format":"percent"},{"key":"net_margin","label":"Net Margin","value":7.711563868993811,"periodEnd":"2026-01-30","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":11.766682891778505,"periodEnd":"2026-01-30","format":"percent"},{"key":"roe","label":"ROE","value":-67.09690430573762,"periodEnd":"2026-01-30","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":7651000000,"periodEnd":"2026-01-30","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":8.867023619127089,"periodEnd":"2026-01-30","format":"percent"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"491190bd-5369-4a14-8486-07d6a546f3e8","ticker":"MA","name":"Mastercard Incorporated","exchange":"NYSE","sector":"Financial Services","industry":"Credit Services","fundamental":{"score":73.5,"confidence":0.238,"coverage":0.355,"previousScore":73.5,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":76.3,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":82.8,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":43.4,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.175},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":16.416373770724608,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":13.82198495222513,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":18.907260963335723,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":17.25446284810146,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":1.7752148117912299,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":32791000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":16.416373770724608,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":16.54,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":18.907260963335723,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":45.64667134274649,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":57.62861760849013,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":193.45999741501873,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":17159000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":52.328382787960116,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":18251000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"bf9069a3-2e39-4117-950a-929982813fc5","ticker":"MCD","name":"McDonald's Corporation","exchange":"NYSE","sector":"Consumer Discretionary","industry":"Restaurants","fundamental":{"score":49.8,"confidence":0.183,"coverage":0.246,"previousScore":49.8,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":39.5,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":64.8,"confidence":0.425},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":44.3,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":null,"confidence":null},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":3.7229938271604937,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":5.062275280891337,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":4.803493449781666,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":12.669515923583873,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-3.122758791030891,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":26885000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":3.7229938271604937,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":12,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":4.803493449781666,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":31.850474242142457,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":46.09633624697787,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":-478.1127861529872,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":7186000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":26.728659103589365,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":39973000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"55280a97-8a98-42c6-925c-2aee667345ec","ticker":"MRK","name":"Merck & Co., Inc.","exchange":"NYSE","sector":"Healthcare","industry":"Drug Manufacturers","fundamental":{"score":45.6,"confidence":0.167,"coverage":0.214,"previousScore":45.6,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":34.3,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":74,"confidence":0.3},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":41.3,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":25,"confidence":0.15},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":1.313738935294851,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":3.122213027882159,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":7.988165680473373,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":8.406688788985072,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-0.04484940622872813,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":65011000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":1.313738935294851,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":7.3,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":7.988165680473373,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":28.078325206503514,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":34.69946393947458,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":12360000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":19.012167171709404,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":46750000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"e97055a5-1c3e-49a0-936b-a0248bb21ac4","ticker":"NVDA","name":"NVIDIA","exchange":"NASDAQ","sector":"Technology","industry":"Semiconductors","fundamental":{"score":79.2,"confidence":0.293,"coverage":0.465,"previousScore":79.2,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":94.6,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":80.7,"confidence":0.625},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":75,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":60,"confidence":0.5},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":65.4735357900948,"periodEnd":"2026-01-25"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":100.04509499443964,"periodEnd":"2026-01-25"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":65.99326599326596,"periodEnd":"2026-01-25"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":201.43346886540917,"periodEnd":"2026-01-25"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-30.19049539552869,"periodEnd":"2026-01-25"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":215938000000,"periodEnd":"2026-01-25","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":65.4735357900948,"periodEnd":"2026-01-25","format":"percent"},{"key":"eps","label":"EPS","value":4.93,"periodEnd":"2026-01-25","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":65.99326599326596,"periodEnd":"2026-01-25","format":"percent"},{"key":"net_margin","label":"Net Margin","value":55.60253406070261,"periodEnd":"2026-01-25","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":60.38168363141272,"periodEnd":"2026-01-25","format":"percent"},{"key":"roe","label":"ROE","value":76.33333969089534,"periodEnd":"2026-01-25","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":96676000000,"periodEnd":"2026-01-25","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":44.770258129648326,"periodEnd":"2026-01-25","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":7469000000,"periodEnd":"2026-01-25","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"60e1db2c-d61e-44bc-8e9b-3952b6e15587","ticker":"ORCL","name":"Oracle Corporation","exchange":"NYSE","sector":"Technology","industry":"Software","fundamental":{"score":70.2,"confidence":0.201,"coverage":0.282,"previousScore":70.2,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":82.9,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":73.8,"confidence":0.425},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":57.4,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":25,"confidence":0.15},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":17.348734298506944,"periodEnd":"2026-05-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":10.476732816565715,"periodEnd":"2026-05-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":33.183856502242165,"periodEnd":"2026-05-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":23.545035086408774,"periodEnd":"2026-05-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":5.664598161785004,"periodEnd":"2026-05-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":67357000000,"periodEnd":"2026-05-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":17.348734298506944,"periodEnd":"2026-05-31","format":"percent"},{"key":"eps","label":"EPS","value":5.94,"periodEnd":"2026-05-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":33.183856502242165,"periodEnd":"2026-05-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":25.36781626260077,"periodEnd":"2026-05-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":30.592217586887777,"periodEnd":"2026-05-31","format":"percent"},{"key":"roe","label":"ROE","value":40.197139362002446,"periodEnd":"2026-05-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":-23686000000,"periodEnd":"2026-05-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":-35.164867793993196,"periodEnd":"2026-05-31","format":"percent"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"bd411133-e4e2-4705-b1f4-56608ad58d35","ticker":"PEP","name":"PepsiCo, Inc.","exchange":"NASDAQ","sector":"Consumer Staples","industry":"Beverages - Non-Alcoholic","fundamental":{"score":38,"confidence":0.293,"coverage":0.465,"previousScore":38,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":25,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":39.9,"confidence":0.625},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":48.4,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":25,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":50.1,"confidence":0.5},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":2.254665011866658,"periodEnd":"2025-12-27"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":2.8259092561689236,"periodEnd":"2025-12-27"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-13.629842180774752,"periodEnd":"2025-12-27"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-2.273519408117486,"periodEnd":"2025-12-27"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-1.8121757818710966,"periodEnd":"2025-12-27"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":93925000000,"periodEnd":"2025-12-27","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":2.254665011866658,"periodEnd":"2025-12-27","format":"percent"},{"key":"eps","label":"EPS","value":6.02,"periodEnd":"2025-12-27","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-13.629842180774752,"periodEnd":"2025-12-27","format":"percent"},{"key":"net_margin","label":"Net Margin","value":8.772957146659568,"periodEnd":"2025-12-27","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":12.241682193239287,"periodEnd":"2025-12-27","format":"percent"},{"key":"roe","label":"ROE","value":40.38028030971283,"periodEnd":"2025-12-27","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":7672000000,"periodEnd":"2025-12-27","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":8.168219323928666,"periodEnd":"2025-12-27","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":42321000000,"periodEnd":"2025-12-27","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"c3ff3682-f040-4cee-be69-f2c29f0ab670","ticker":"PFE","name":"Pfizer Inc.","exchange":"NYSE","sector":"Healthcare","industry":"Drug Manufacturers","fundamental":{"score":27.9,"confidence":0.149,"coverage":0.178,"previousScore":27.9,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":24.6,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":28.6,"confidence":0.3},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":38.7,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":null,"confidence":null},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":-1.6470995017838341,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":-14.79760515726194,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-3.521126760563368,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-37.41989995713122,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":19.745760849552855,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":62579000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":-1.6470995017838341,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":1.37,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-3.521126760563368,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":12.417903769635181,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":8.986308339886211,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":9075000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":14.501669889259974,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":61641000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"4d6e0c6b-3891-4585-8c48-92399169618c","ticker":"QCOM","name":"Qualcomm Incorporated","exchange":"NASDAQ","sector":"Technology","industry":"Semiconductors","fundamental":{"score":42.5,"confidence":0.256,"coverage":0.391,"previousScore":42.5,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":50.2,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":31.1,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":55,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":25,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":48.1,"confidence":0.325},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":13.65946306657769,"periodEnd":"2025-09-28"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":0.06330832838727929,"periodEnd":"2025-09-28"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-44.44444444444445,"periodEnd":"2025-09-28"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-24.035100722012615,"periodEnd":"2025-09-28"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":16.30936954233862,"periodEnd":"2025-09-28"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":44284000000,"periodEnd":"2025-09-28","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":13.65946306657769,"periodEnd":"2025-09-28","format":"percent"},{"key":"eps","label":"EPS","value":5.05,"periodEnd":"2025-09-28","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-44.44444444444445,"periodEnd":"2025-09-28","format":"percent"},{"key":"net_margin","label":"Net Margin","value":12.51241983560654,"periodEnd":"2025-09-28","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":27.899467076144884,"periodEnd":"2025-09-28","format":"percent"},{"key":"roe","label":"ROE","value":26.129397340375366,"periodEnd":"2025-09-28","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":12820000000,"periodEnd":"2025-09-28","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":28.9495077228796,"periodEnd":"2025-09-28","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":14811000000,"periodEnd":"2025-09-28","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"0ee49dd2-fa66-43c1-998c-68861175819a","ticker":"TSLA","name":"Tesla","exchange":"NASDAQ","sector":"Consumer Discretionary","industry":"Auto Manufacturers","fundamental":{"score":25.1,"confidence":0.293,"coverage":0.465,"previousScore":25.1,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":10.2,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":22.9,"confidence":0.625},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":40,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":25,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":40,"confidence":0.5},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":-2.9306991503736306,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":5.1943257367141005,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-47.089947089947096,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-33.54127812357696,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-10.862982827500778,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":94827000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":-2.9306991503736306,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":1.18,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-47.089947089947096,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":4.000970187815707,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":4.592573845001951,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":4.619111971462313,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":6220000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":6.559313275754795,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":0,"periodEnd":"2013-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"d56dd128-03bb-4b7f-9f3c-c67e54640b00","ticker":"TXN","name":"Texas Instruments","exchange":"NASDAQ","sector":"Technology","industry":"Semiconductors","fundamental":{"score":43.9,"confidence":0.278,"coverage":0.437,"previousScore":43.9,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":65.2,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":36.4,"confidence":0.625},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":25,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":25,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":40,"confidence":0.5},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":13.049037785307846,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":-4.067756491132624,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":4.389312977099228,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-16.835955307725392,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":12.788249669566246,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":17682000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":13.049037785307846,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":5.47,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":4.389312977099228,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":28.28299966067187,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":34.06288881348264,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":30.73188717507528,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":2603000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":14.72118538626852,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":13548000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"04c898e0-892f-4283-b05b-b846d6d2ba47","ticker":"SCHW","name":"The Charles Schwab Corporation","exchange":"NYSE","sector":"Financial Services","industry":"Capital Markets","fundamental":{"score":85.1,"confidence":0.139,"coverage":0.157,"previousScore":85.1,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":92.2,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":75.5,"confidence":0.3},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":75,"confidence":0.075},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":null,"confidence":null},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":null,"confidence":null},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":22.008568805467714,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":4.834295603081085,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":55.666666666666664,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":9.881540394851074,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":15.640157632673173,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":23921000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":22.008568805467714,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":4.67,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":55.666666666666664,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":37.00514192550479,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":17.909964592817403,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":8763000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":36.6330839011747,"periodEnd":"2025-12-31","format":"percent"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"1309ba54-b6e1-42e4-9af2-de481f434136","ticker":"PG","name":"The Procter & Gamble Company","exchange":"NYSE","sector":"Consumer Staples","industry":"Household & Personal Products","fundamental":{"score":55.4,"confidence":0.242,"coverage":0.363,"previousScore":55.4,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":35.9,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":70.2,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":38.8,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":63.9,"confidence":0.325},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":3.260405296378909,"periodEnd":"2026-06-30"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":2.002569409339938,"periodEnd":"2026-06-30"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":1.199400299850076,"periodEnd":"2026-06-30"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":3.6028479444773165,"periodEnd":"2026-06-30"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":0.39065920014906713,"periodEnd":"2026-06-30"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":87032000000,"periodEnd":"2026-06-30","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":3.260405296378909,"periodEnd":"2026-06-30","format":"percent"},{"key":"eps","label":"EPS","value":6.75,"periodEnd":"2026-06-30","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":1.199400299850076,"periodEnd":"2026-06-30","format":"percent"},{"key":"net_margin","label":"Net Margin","value":18.436896773600512,"periodEnd":"2026-06-30","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":22.69050464197077,"periodEnd":"2026-06-30","format":"percent"},{"key":"roe","label":"ROE","value":29.544659461250944,"periodEnd":"2026-06-30","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":15147000000,"periodEnd":"2026-06-30","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":17.403943377148636,"periodEnd":"2026-06-30","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":22842000000,"periodEnd":"2026-06-30","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"93036583-0280-4acf-9709-e45dc6a69912","ticker":"DIS","name":"The Walt Disney Company","exchange":"NYSE","sector":"Communication Services","industry":"Entertainment","fundamental":{"score":61.8,"confidence":0.223,"coverage":0.327,"previousScore":61.8,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":58,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":62.2,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":50,"confidence":0.15},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.175},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":3.353728615054564,"periodEnd":"2025-09-27"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":4.50939232231049,"periodEnd":"2025-09-27"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":152.94117647058823,"periodEnd":"2025-09-27"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":58.43365635516204,"periodEnd":"2025-09-27"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-2.0561208717478805,"periodEnd":"2025-09-27"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":94425000000,"periodEnd":"2025-09-27","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":3.353728615054564,"periodEnd":"2025-09-27","format":"percent"},{"key":"eps","label":"EPS","value":6.88,"periodEnd":"2025-09-27","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":152.94117647058823,"periodEnd":"2025-09-27","format":"percent"},{"key":"net_margin","label":"Net Margin","value":13.136351601800369,"periodEnd":"2025-09-27","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":18.587238549113053,"periodEnd":"2025-09-27","format":"percent"},{"key":"roe","label":"ROE","value":11.289808772265152,"periodEnd":"2025-09-27","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":10077000000,"periodEnd":"2025-09-27","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":10.671961874503575,"periodEnd":"2025-09-27","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":35315000000,"periodEnd":"2025-09-27","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"295feddb-490f-4f65-8e9f-bf2d5c2338f6","ticker":"UNH","name":"UnitedHealth Group Incorporated","exchange":"NYSE","sector":"Healthcare","industry":"Healthcare Plans","fundamental":{"score":34.8,"confidence":0.238,"coverage":0.355,"previousScore":34.8,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":52.4,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":23.1,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":33.1,"confidence":0.25},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":25,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":25,"confidence":0.175},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":11.814039242726306,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":11.352161443193465,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-15.089514066496172,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-14.796910347284332,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":-1.4133942457773518,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":447567000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":11.814039242726306,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":13.28,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-15.089514066496172,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":2.6936749134766416,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":4.237130977038075,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":12.045159356579079,"periodEnd":"2025-12-31","format":"percent"},{"key":"free_cash_flow","label":"Free Cash Flow","value":16075000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"fcf_margin","label":"FCF Margin","value":3.5916410280471975,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":72320000000,"periodEnd":"2025-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0},{"id":"3834bc6c-6d46-49c5-9429-950cfa9b460f","ticker":"VZ","name":"Verizon Communications Inc.","exchange":"NYSE","sector":"Communication Services","industry":"Telecom Services","fundamental":{"score":48.8,"confidence":0.227,"coverage":0.334,"previousScore":48.8,"scoreChange":0,"calcVersion":"v1.1"},"categories":[{"key":"GROWTH","label":"Growth","score":31.4,"confidence":0.5},{"key":"PROFITABILITY","label":"Profitability","score":55.8,"confidence":0.525},{"key":"FINANCIAL_HEALTH","label":"Financial Health","score":40.1,"confidence":0.175},{"key":"VALUATION","label":"Valuation","score":null,"confidence":null},{"key":"CAPITAL_ALLOCATION","label":"Capital Allocation","score":75,"confidence":0.175},{"key":"COMPETITIVE_ADVANTAGE","label":"Competitive Advantage","score":75,"confidence":0.175},{"key":"MANAGEMENT","label":"Management","score":null,"confidence":null},{"key":"EARNINGS_MOMENTUM","label":"Earnings Momentum","score":null,"confidence":null}],"growth":[{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","unit":"%","value":2.5247054633943673,"periodEnd":"2025-12-31"},{"key":"revenue_cagr_3y","label":"Revenue CAGR (3Y)","unit":"%","value":0.3292396665705022,"periodEnd":"2025-12-31"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","unit":"%","value":-2.1686746987951984,"periodEnd":"2025-12-31"},{"key":"eps_cagr","label":"EPS CAGR","unit":"%","value":-7.0765828174263685,"periodEnd":"2025-12-31"},{"key":"growth_acceleration","label":"Growth Acceleration","unit":"","value":2.307772397718304,"periodEnd":"2025-12-31"}],"keyFinancials":[{"key":"revenue","label":"Revenue","value":138191000000,"periodEnd":"2025-12-31","format":"currency"},{"key":"revenue_growth_yoy","label":"Revenue Growth (YoY)","value":2.5247054633943673,"periodEnd":"2025-12-31","format":"percent"},{"key":"eps","label":"EPS","value":4.06,"periodEnd":"2025-12-31","format":"pershare"},{"key":"eps_growth_yoy","label":"EPS Growth (YoY)","value":-2.1686746987951984,"periodEnd":"2025-12-31","format":"percent"},{"key":"net_margin","label":"Net Margin","value":12.427726841834852,"periodEnd":"2025-12-31","format":"percent"},{"key":"operating_margin","label":"Operating Margin","value":21.17286943433364,"periodEnd":"2025-12-31","format":"percent"},{"key":"roe","label":"ROE","value":16.241571386690122,"periodEnd":"2025-12-31","format":"percent"},{"key":"long_term_debt_noncurrent","label":"Long-Term Debt","value":89658000000,"periodEnd":"2013-12-31","format":"currency"}],"hasValuation":false,"hasThesis":false,"changesCount":0}];
const GENERATED_AT = "2026-09-07";

/* ----------------------------- DESIGN TOKENS ----------------------------- */
const C = {
  bg: "var(--bg)", bgSecondary: "var(--bg-secondary)", border: "var(--border)",
  text: "var(--text)", textSoft: "var(--text-soft)", textFaint: "var(--text-faint)",
  green: "var(--green)", greenSoft: "var(--green-soft)",
  yellow: "var(--yellow)", yellowSoft: "var(--yellow-soft)",
  red: "var(--red)", redSoft: "var(--red-soft)",
  accent: "var(--accent)", accentContrast: "var(--accent-contrast)",
};
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function scoreLabel(score) {
  if (score == null) return "UNSCORED";
  if (score >= 85) return "STRONG";
  if (score >= 65) return "MODERATE";
  return "WEAK";
}
function scoreColor(score) {
  if (score == null) return C.textFaint;
  if (score >= 85) return C.green;
  if (score >= 65) return C.yellow;
  return C.red;
}
function scoreSoft(score) {
  if (score == null) return C.bgSecondary;
  if (score >= 85) return C.greenSoft;
  if (score >= 65) return C.yellowSoft;
  return C.redSoft;
}

/* ----------------------------- FORMATTERS -----------------------------
   Display-only. Never derive or estimate a value — these only decide how
   an already-computed, already-stored number renders. */
function formatPercent(v, d = 1) { return v.toFixed(d) + "%"; }
function formatPlain(v, d = 1) { return v.toFixed(d); }
const CURRENCY_SCALE = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
function formatCurrency(v) {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  for (const [t, s] of CURRENCY_SCALE) if (abs >= t) return sign + "$" + (abs / t).toFixed(2) + s;
  return sign + "$" + abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function formatPerShare(v) { return "$" + v.toFixed(2); }
function formatKeyFinancial(f) {
  if (f.format === "currency") return formatCurrency(f.value);
  if (f.format === "percent") return formatPercent(f.value);
  return formatPerShare(f.value);
}

/* ----------------------------- PRIMARY SCORE -----------------------------
   Mirrors the real frontend's primaryScore.ts: prefer the fundamental
   score; fall back to the GROWTH category score; otherwise unscored. Used
   consistently for every headline number and every ranking. */
function primaryScore(company) {
  if (company.fundamental) return { score: company.fundamental.score, confidence: company.fundamental.confidence, source: "fundamental" };
  const growth = company.categories.find((c) => c.key === "GROWTH" && c.score != null);
  if (growth) return { score: growth.score, confidence: growth.confidence, source: "growth" };
  return null;
}

/* ----------------------------- ICONS (hand-drawn, no icon library) ----------------------------- */
function Icon({ path, size = 14, strokeWidth = 2, color = "currentColor", viewBox = "0 0 24 24" }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}
const IconSearch = (p) => <Icon {...p} path={<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>} />;
const IconChevronRight = (p) => <Icon {...p} path={<polyline points="9 18 15 12 9 6" />} />;
const IconChevronDown = (p) => <Icon {...p} path={<polyline points="6 9 12 15 18 9" />} />;
const IconArrowUp = (p) => <Icon {...p} path={<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>} />;
const IconArrowDown = (p) => <Icon {...p} path={<><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></>} />;
const IconMinus = (p) => <Icon {...p} path={<line x1="5" y1="12" x2="19" y2="12" />} />;
const IconX = (p) => <Icon {...p} path={<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>} />;
const IconMenu = (p) => <Icon {...p} path={<><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>} />;
const IconInfo = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>} />;
const IconDatabase = (p) => <Icon {...p} path={<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></>} />;

/* ----------------------------- SMALL PRIMITIVES ----------------------------- */

function ChangeTag({ value }) {
  const v = value;
  const isPos = v > 0, isZero = v === 0 || v == null;
  const color = isZero ? C.textFaint : isPos ? C.green : C.red;
  const IconEl = isZero ? IconMinus : isPos ? IconArrowUp : IconArrowDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color, fontSize: 12.5, fontWeight: 600 }}>
      <IconEl size={11} strokeWidth={2.5} />
      {isZero ? "0" : Math.abs(v)}
    </span>
  );
}

function ColorDot({ color }) {
  const map = { green: C.green, yellow: C.yellow, red: C.red, faint: C.textFaint };
  return <span style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: map[color] || map.faint, display: "inline-block", flexShrink: 0 }} />;
}

function SnapshotTag() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, color: C.textFaint, border: "1px solid " + C.border, borderRadius: 5, padding: "2px 7px", letterSpacing: "0.03em" }}>
      <IconDatabase size={10.5} strokeWidth={2} /> REAL DATA · STATIC SNAPSHOT
    </span>
  );
}

const SECTOR_COLORS = {
  "Technology": "#3D5AFE", "Communication Services": "#8E5CE0", "Consumer Discretionary": "#E0785C",
  "Financial Services": "#1E8E5A", "Healthcare": "#2AA6B8", "Industrials": "#B7791F",
  "Consumer Staples": "#6B8E23", "Energy": "#C0432F",
};
function CompanyLogo({ company, size = 40 }) {
  const color = SECTOR_COLORS[company.sector] || C.textFaint;
  const initial = (company.name || company.ticker || "?").trim().charAt(0).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: size * 0.42 }}>
      {initial}
    </div>
  );
}

function DataUnavailable({ label = "Data unavailable" }) {
  return <div style={{ fontSize: 12.5, color: C.textFaint, fontStyle: "italic" }}>{label}</div>;
}

/* ----------------------------- NAVIGATION ----------------------------- */

const SIDEBAR_SECTIONS = [
  { label: "RESEARCH", items: [{ key: "dashboard", label: "Dashboard" }, { key: "discover", label: "Discover" }] },
  { label: "PORTFOLIO", items: [{ key: "watchlist", label: "Watchlist" }, { key: "companies", label: "Companies" }] },
  { label: "MONITORING", items: [{ key: "alerts", label: "Alerts" }] },
];

function Sidebar({ view, setView }) {
  return (
    <div className="eq-sidebar" style={{ width: 216, flexShrink: 0, borderRight: "1px solid " + C.border, flexDirection: "column", height: "100vh", position: "sticky", top: 0, backgroundColor: C.bg }}>
      <div style={{ padding: "24px 22px 18px" }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, letterSpacing: "0.02em" }}>EQUITY AI</div>
        <div style={{ marginTop: 8 }}><SnapshotTag /></div>
      </div>
      <nav style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 22, overflowY: "auto" }}>
        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.label}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textFaint, letterSpacing: "0.06em", padding: "0 10px 6px" }}>{section.label}</div>
            {section.items.map((item) => {
              const active = view === item.key;
              return (
                <button key={item.key} onClick={() => setView(item.key)} style={{
                  display: "block", width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                  backgroundColor: active ? C.bgSecondary : "transparent", color: active ? C.text : C.textSoft,
                  fontSize: 13.5, fontWeight: active ? 600 : 500, marginBottom: 1,
                }}>
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ padding: "16px 22px", fontSize: 10.5, color: C.textFaint, lineHeight: 1.5 }}>
        Snapshot captured {GENERATED_AT}. Not live — nothing here updates in real time.
      </div>
    </div>
  );
}

function MobileTopBar({ mobileOpen, setMobileOpen, view, setView }) {
  return (
    <div className="eq-mobilebar" style={{ alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid " + C.border, backgroundColor: C.bg, position: "sticky", top: 0, zIndex: 40 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: "0.02em" }}>EQUITY AI</div>
      <button onClick={() => setMobileOpen(!mobileOpen)} style={{ border: "none", background: "none", cursor: "pointer", color: C.text, padding: 4 }}>
        {mobileOpen ? <IconX size={19} /> : <IconMenu size={19} />}
      </button>
      {mobileOpen && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, backgroundColor: C.bg, borderBottom: "1px solid " + C.border, padding: "8px 14px 16px", boxShadow: "var(--shadow)" }}>
          {SIDEBAR_SECTIONS.map((section) => (
            <div key={section.label} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textFaint, letterSpacing: "0.06em", padding: "0 6px 6px" }}>{section.label}</div>
              {section.items.map((item) => (
                <button key={item.key} onClick={() => { setView(item.key); setMobileOpen(false); }} style={{
                  display: "block", width: "100%", textAlign: "left", padding: "9px 6px", borderRadius: 6, border: "none", cursor: "pointer",
                  backgroundColor: view === item.key ? C.bgSecondary : "transparent", color: view === item.key ? C.text : C.textSoft,
                  fontSize: 14, fontWeight: view === item.key ? 600 : 500,
                }}>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- SEARCH ----------------------------- */

function SearchField({ value, onChange, onFocus, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", border: "1px solid " + C.border, borderRadius: 10, backgroundColor: C.bg }}>
      <IconSearch size={16} color={C.textFaint} strokeWidth={2} />
      <input value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} placeholder={placeholder}
        style={{ border: "none", outline: "none", fontSize: 14.5, flex: 1, color: C.text, backgroundColor: "transparent", fontFamily: FONT }} />
    </div>
  );
}

function SearchView({ recentSearches, goToCompany }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return COMPANIES_DATA.filter((c) => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q));
  }, [query]);

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textFaint, letterSpacing: "0.06em", marginBottom: 12 }}>SEARCH THE 30-COMPANY DEMO UNIVERSE</div>
      <SearchField value={query} onChange={setQuery} placeholder="e.g. NVIDIA or NVDA" />

      {!query.trim() && recentSearches.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textFaint, letterSpacing: "0.06em", marginBottom: 10 }}>RECENT SEARCHES</div>
          {recentSearches.map((id) => {
            const c = COMPANIES_DATA.find((x) => x.id === id);
            if (!c) return null;
            return (
              <button key={id} onClick={() => goToCompany(id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 4px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid " + C.border, fontSize: 14.5, color: C.text, fontWeight: 500 }}>
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {query.trim() && (
        <div style={{ marginTop: 24 }}>
          {results.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textFaint }}>No matches in the 30-company demo universe.</p>
          ) : results.map((c) => (
            <button key={c.id} onClick={() => goToCompany(c.id)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 4px",
              border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid " + C.border,
            }}>
              <CompanyLogo company={c} size={32} />
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{c.name}</div>
                <div style={{ fontSize: 12, color: C.textFaint }}>{c.ticker} · {c.exchange}</div>
                <div style={{ fontSize: 11.5, color: C.textFaint }}>{c.sector}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- SECTION HEADER ----------------------------- */

function SectionHeader({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textFaint, letterSpacing: "0.06em" }}>{children}</div>
      {action && <button onClick={action.onClick} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: C.text, display: "flex", alignItems: "center", gap: 3 }}>{action.label} <IconChevronRight size={12} /></button>}
    </div>
  );
}

/* ----------------------------- PAGE: DASHBOARD ----------------------------- */

function DashboardPage({ followed, goToSearch, goToCompany, setView }) {
  const followedCompanies = COMPANIES_DATA.filter((c) => followed.has(c.id));
  const ranked = useMemo(() => [...COMPANIES_DATA].sort((a, b) => {
    const sa = primaryScore(a)?.score ?? -1, sb = primaryScore(b)?.score ?? -1;
    return sb - sa;
  }), []);
  const interesting = ranked.filter((c) => !followed.has(c.id)).slice(0, 6);

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: "0 0 4px", letterSpacing: "-0.01em" }}>Good morning.</h1>
      <p style={{ fontSize: 14, color: C.textSoft, margin: "0 0 20px" }}>Your companies, backed by a real snapshot of the Equity AI database.</p>
      <button onClick={goToSearch} style={{ display: "block", width: "100%", textAlign: "left", border: "none", padding: 0, background: "none", cursor: "pointer" }}>
        <div style={{ pointerEvents: "none" }}><SearchField value="" onChange={() => {}} placeholder="Search a company or ticker" /></div>
      </button>

      <div style={{ marginTop: 36 }}>
        <SectionHeader>YOUR COMPANIES</SectionHeader>
        {followedCompanies.length === 0 ? (
          <p style={{ fontSize: 13, color: C.textFaint }}>You aren't following any companies yet — try Discover.</p>
        ) : (
          <div>
            {followedCompanies.map((c, i) => {
              const p = primaryScore(c);
              return (
                <button key={c.id} onClick={() => goToCompany(c.id)} style={{
                  display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "13px 4px",
                  border: "none", background: "none", cursor: "pointer", borderTop: i === 0 ? "1px solid " + C.border : "none", borderBottom: "1px solid " + C.border, gap: 12,
                }}>
                  <CompanyLogo company={c} size={30} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: C.textFaint }}>{p ? "Fundamental Score " + p.score : "Not yet scored"}</div>
                  </div>
                  {c.fundamental && <ChangeTag value={c.fundamental.scoreChange} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 32 }}>
        <SectionHeader>WHAT CHANGED</SectionHeader>
        <p style={{ fontSize: 13, color: C.textFaint }}>No changes detected yet — this snapshot captures a single point in time, so change-over-time tracking isn't available here.</p>
      </div>

      <div style={{ marginTop: 32, marginBottom: 20 }}>
        <SectionHeader action={{ label: "Discover", onClick: () => setView("discover") }}>COMPANIES WORTH LOOKING INTO</SectionHeader>
        {interesting.map((c) => {
          const p = primaryScore(c);
          return (
            <button key={c.id} onClick={() => goToCompany(c.id)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: "none", background: "none", cursor: "pointer", padding: "10px 4px", borderBottom: "1px solid " + C.border }}>
              <CompanyLogo company={c} size={26} />
              <span style={{ fontSize: 13.5, color: C.text, fontWeight: 500, flex: 1 }}>{c.name}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(p?.score) }}>{p ? p.score : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------- SCORE DIMENSIONS ----------------------------- */

function CategoryRow({ cat }) {
  const unscored = cat.score == null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderBottom: "1px solid " + C.border }}>
      <div style={{ width: 150, fontSize: 13, color: unscored ? C.textFaint : C.text, flexShrink: 0 }}>{cat.label}</div>
      {unscored ? (
        <div style={{ flex: 1 }}><DataUnavailable label="Not yet scored" /></div>
      ) : (
        <>
          <div style={{ flex: 1, height: 6, backgroundColor: C.bgSecondary, borderRadius: 999, overflow: "hidden", border: "1px solid " + C.border }}>
            <div style={{ width: cat.score + "%", height: "100%", backgroundColor: scoreColor(cat.score), borderRadius: 999 }} />
          </div>
          <div style={{ width: 34, textAlign: "right", fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{formatPlain(cat.score, 1)}</div>
        </>
      )}
    </div>
  );
}

function OverviewTab({ company }) {
  return (
    <div>
      <SectionHeader>SCORE DIMENSIONS</SectionHeader>
      <div>
        {company.categories.map((cat) => <CategoryRow key={cat.key} cat={cat} />)}
      </div>
      <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 14, lineHeight: 1.5 }}>
        Categories marked "Not yet scored" genuinely have no scoring run yet for this company in the source database — nothing here is estimated to fill the gap.
      </p>
    </div>
  );
}

/* ----------------------------- FINANCIALS TAB ----------------------------- */

function FinancialsTab({ company }) {
  return (
    <div>
      <SectionHeader>GROWTH METRICS</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 18, marginBottom: 30 }}>
        {company.growth.map((m) => (
          <div key={m.key}>
            <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 3 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
              {m.value != null ? (m.unit === "%" ? formatPercent(m.value) : formatPlain(m.value)) : <DataUnavailable />}
            </div>
            {m.periodEnd && <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 4 }}>{m.periodEnd} (FY)</div>}
          </div>
        ))}
      </div>

      <SectionHeader>KEY FINANCIALS</SectionHeader>
      {company.keyFinancials.length === 0 ? (
        <DataUnavailable label="No financial data available for this company in the snapshot." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 18 }}>
          {company.keyFinancials.map((f) => (
            <div key={f.key}>
              <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 3 }}>{f.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{formatKeyFinancial(f)}</div>
              <div style={{ fontSize: 10.5, color: C.textFaint, marginTop: 4 }}>{f.periodEnd} (FY)</div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11, color: C.textFaint, marginTop: 16 }}>Only metrics with a real stored value for this company are shown — nothing is padded to a fixed layout.</p>
    </div>
  );
}

/* ----------------------------- VALUATION TAB ----------------------------- */

const VALUATION_LABELS = ["P/E", "Forward P/E", "EV / EBITDA", "EV / Sales", "Price / FCF", "FCF Yield"];

function ValuationTab({ company }) {
  return (
    <div>
      <SectionHeader>VALUATION MULTIPLES</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 18 }}>
        {VALUATION_LABELS.map((label) => (
          <div key={label}>
            <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 3 }}>{label}</div>
            <DataUnavailable />
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: C.textFaint, marginTop: 18, lineHeight: 1.5, maxWidth: 480 }}>
        Valuation multiples require market-price data the source pipeline doesn't yet ingest for any of the 30 demo companies — shown here honestly as unavailable, not fabricated.
      </p>
    </div>
  );
}

/* ----------------------------- ANALYSIS TAB ----------------------------- */

function AnalysisTab({ company }) {
  return (
    <div>
      <SectionHeader>AI INVESTMENT THESIS</SectionHeader>
      <DataUnavailable label="No AI analysis generated yet for this company." />
      <div style={{ marginTop: 30 }}>
        <SectionHeader>WHAT CHANGED</SectionHeader>
        <DataUnavailable label="No changes detected yet." />
      </div>
    </div>
  );
}

/* ----------------------------- PAGE: COMPANY ----------------------------- */

function CompanyHeader({ company, followed, onToggleFollow }) {
  const p = primaryScore(company);
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <CompanyLogo company={company} size={52} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.01em" }}>{company.name}</h1>
            <span style={{ fontSize: 13, color: C.textFaint }}>{company.ticker} · {company.exchange}</span>
          </div>
          <div style={{ fontSize: 12.5, color: C.textFaint, marginTop: 2 }}>{company.sector}{company.industry ? " · " + company.industry : ""}</div>
        </div>
        <button onClick={onToggleFollow} style={{
          padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0,
          border: followed ? "1px solid " + C.border : "none", backgroundColor: followed ? C.bg : C.accent, color: followed ? C.text : C.accentContrast,
        }}>
          {followed ? "✓ Following" : "+ Follow"}
        </button>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textFaint, letterSpacing: "0.06em", marginBottom: 4 }}>FUNDAMENTAL SCORE</div>
        {p == null ? (
          <DataUnavailable label="This company hasn't completed a scoring run." />
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: C.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{p.score}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(p.score), backgroundColor: scoreSoft(p.score), padding: "3px 9px", borderRadius: 5, letterSpacing: "0.03em" }}>
              {scoreLabel(p.score)}
            </span>
            {company.fundamental && (
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textFaint, backgroundColor: C.bgSecondary, padding: "3px 8px", borderRadius: 999 }}>
                Confidence {Math.round(company.fundamental.confidence * 100)}% · Coverage {Math.round(company.fundamental.coverage * 100)}%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "valuation", label: "Valuation" },
  { key: "analysis", label: "Analysis" },
];

function CompanyPage({ companyId, followed, onToggleFollow, onBack }) {
  const company = COMPANIES_DATA.find((c) => c.id === companyId);
  const [activeTab, setActiveTab] = useState("overview");
  if (!company) return <DataUnavailable label="Company not found in this snapshot." />;

  return (
    <div style={{ maxWidth: 640 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "none", cursor: "pointer", color: C.textSoft, fontSize: 13, fontWeight: 500, marginBottom: 16, padding: 0 }}>
        <IconChevronRight size={13} style={{ transform: "rotate(180deg)" }} /> Back
      </button>
      <CompanyHeader company={company} followed={followed} onToggleFollow={onToggleFollow} />

      <div style={{ display: "flex", gap: 22, borderBottom: "1px solid " + C.border, marginBottom: 26 }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            border: "none", background: "none", cursor: "pointer", padding: "0 0 11px", fontSize: 13.5, fontWeight: 600,
            color: activeTab === t.key ? C.text : C.textFaint, borderBottom: activeTab === t.key ? "2px solid " + C.text : "2px solid transparent", marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <OverviewTab company={company} />}
      {activeTab === "financials" && <FinancialsTab company={company} />}
      {activeTab === "valuation" && <ValuationTab company={company} />}
      {activeTab === "analysis" && <AnalysisTab company={company} />}

      <div style={{ display: "flex", gap: 8, padding: "18px 4px 0", color: C.textFaint, borderTop: "1px solid " + C.border, marginTop: 30 }}>
        <IconInfo size={13} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
          Every figure above is a real value from the snapshot's source database — never fabricated, estimated, or defaulted to zero. Nothing here is investment advice.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------- OTHER PAGES ----------------------------- */

function ListPage({ title, subtitle, companies, goToCompany, emptyText, ranked }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 13.5, color: C.textSoft, margin: "0 0 22px" }}>{subtitle}</p>}
      {companies.length === 0 ? (
        <p style={{ fontSize: 13, color: C.textFaint }}>{emptyText}</p>
      ) : companies.map((c, i) => {
        const p = primaryScore(c);
        return (
          <button key={c.id} onClick={() => goToCompany(c.id)} style={{
            display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "13px 4px",
            border: "none", background: "none", cursor: "pointer", borderTop: i === 0 ? "1px solid " + C.border : "none", borderBottom: "1px solid " + C.border,
          }}>
            {ranked && <div style={{ width: 20, textAlign: "right", fontSize: 11, fontWeight: 700, color: C.textFaint, flexShrink: 0 }}>{i + 1}</div>}
            <CompanyLogo company={c} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
              <div style={{ fontSize: 12, color: C.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.ticker} · {c.sector}</div>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(p?.score), flexShrink: 0 }}>{p ? p.score : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

function DiscoverPage({ followed, goToCompany }) {
  const ranked = useMemo(() => [...COMPANIES_DATA].sort((a, b) => {
    const sa = primaryScore(a)?.score ?? -1, sb = primaryScore(b)?.score ?? -1;
    return sb - sa;
  }), []);
  return <ListPage title="Discover" subtitle={"Ranked by Fundamental Score across the " + COMPANIES_DATA.length + "-company demo universe."} companies={ranked} goToCompany={goToCompany} emptyText="" ranked />;
}

function WatchlistPage({ followed, goToCompany }) {
  const list = COMPANIES_DATA.filter((c) => followed.has(c.id));
  return <ListPage title="Watchlist" subtitle="Companies you're tracking this session." companies={list} goToCompany={goToCompany} emptyText="You haven't added any companies to your watchlist yet — follow one from Discover or its company page." />;
}

function CompaniesPage({ goToCompany }) {
  return <ListPage title="Companies" subtitle={"Every company in the " + COMPANIES_DATA.length + "-company demo universe."} companies={COMPANIES_DATA} goToCompany={goToCompany} emptyText="" />;
}

function AlertsPage() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>Alerts</h1>
      <p style={{ fontSize: 13.5, color: C.textSoft, margin: "0 0 22px" }}>Meaningful changes detected in the companies you follow.</p>
      <div style={{ padding: "24px", border: "1px solid " + C.border, borderRadius: 12, textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>No meaningful changes right now</div>
        <div style={{ fontSize: 12.5, color: C.textFaint }}>The snapshot's alert history is genuinely empty — nothing has been invented to fill this screen.</div>
      </div>
    </div>
  );
}

/* ----------------------------- APP ----------------------------- */

export default function EquityAIRealDataDemo() {
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [followed, setFollowed] = useState(new Set());
  const [recentSearches, setRecentSearches] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const goToCompany = (id) => {
    setSelectedId(id);
    setView("company");
    setRecentSearches((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 3));
  };
  const goToSearch = () => setView("search");
  const toggleFollow = (id) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  let page;
  if (view === "dashboard") page = <DashboardPage followed={followed} goToSearch={goToSearch} goToCompany={goToCompany} setView={setView} />;
  else if (view === "search") page = <SearchView recentSearches={recentSearches} goToCompany={goToCompany} />;
  else if (view === "company") page = <CompanyPage companyId={selectedId} followed={followed.has(selectedId)} onToggleFollow={() => toggleFollow(selectedId)} onBack={() => setView("dashboard")} />;
  else if (view === "watchlist") page = <WatchlistPage followed={followed} goToCompany={goToCompany} />;
  else if (view === "companies") page = <CompaniesPage goToCompany={goToCompany} />;
  else if (view === "discover") page = <DiscoverPage followed={followed} goToCompany={goToCompany} />;
  else if (view === "alerts") page = <AlertsPage />;

  return (
    <div style={{ fontFamily: FONT, backgroundColor: C.bg, minHeight: "100vh", display: "flex", color: C.text }}>
      <style>{"\n        .eq-sidebar { display: none; }\n        .eq-mobilebar { display: flex; }\n        @media (min-width: 768px) {\n          .eq-sidebar { display: flex; }\n          .eq-mobilebar { display: none; }\n        }\n      "}</style>
      <Sidebar view={view} setView={setView} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <MobileTopBar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} view={view} setView={setView} />
        <div style={{ flex: 1, padding: "32px 24px 60px" }}>
          {page}
        </div>
      </div>
    </div>
  );
}

