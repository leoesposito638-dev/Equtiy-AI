# Product Documentation

**Honest note before anything else:** no single document explicitly titled
"Product Bible" exists anywhere in this project's history. What exists is
the set of product/architecture specifications that were provided over the
course of building this project, in order. They are archived here
**verbatim** (not rewritten, not summarized, not reinterpreted) because
collectively they define the same principles a Product Bible would:
Fundamental Score, the FACT → CALCULATION → AI INTERPRETATION separation,
transparency by design, information hierarchy, progressive disclosure, and
"professional first, beginner-friendly second."

If a formal Product Bible document exists outside this environment, it
should replace or supplement these files — these are preserved as the
authoritative source available right now, not as a claim that they are the
final or only product documentation.

## Documents, in the order they were produced

1. **`01-master-prototype-prompt-v1.md`** — the original product brief:
   core concept (Search → Understand → Watch → Monitor), the three pillars
   (Clarity, Continuous Intelligence, Discovery), navigation, page-by-page
   requirements, and design philosophy.
2. **`02-database-scoring-engine-blueprint-v1.md`** — the backend
   architecture specification: the FACT → CALCULATION → AI INTERPRETATION
   separation, the full database schema, the scoring methodology
   (percentile-based, never hardcoded thresholds), confidence/coverage,
   Fundamental Score vs. Opportunity Score, provider abstraction, and API
   surface. This is what `/backend` was built against.
3. **`03-prototype-v1-spec.md`** — the detailed UX specification for the
   interactive prototype: sidebar structure, Dashboard, Search, the
   Company Page's progressive-disclosure model (Level 1–5), and explicit
   non-goals ("do not overbuild").
4. **`04-prototype-v1.1-revision-spec.md`** — the product-review-driven
   revision: simplifying the Company Overview (removing duplicated
   Key Financials / Valuation sections), hiding Opportunity Score pending
   a defined methodology, and introducing the centralized financial-term
   glossary with tooltips.

## Relationship to the code

- `/backend` implements document 2's architecture directly — the schema,
  scoring engine, and provider abstraction match it field for field.
- `/docs/prototypes/prototype-1.2` implements documents 1, 3, and 4's UX
  direction as a demo-fixture-only reference.
- `/frontend` is the production frontend, built against `/backend`'s real
  API contracts rather than against any single one of these documents.
