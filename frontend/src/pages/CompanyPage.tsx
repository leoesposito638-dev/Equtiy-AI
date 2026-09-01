import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, FileText, Info, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { useCompanies, useCompanyAnalysis, useCompanyChanges, useCompanyFinancials, useCompanyMetrics, useCompanyScores, useCompanyValuation } from "../lib/useApi";
import { useFollowed } from "../lib/followedContext";
import { primaryScore } from "../lib/primaryScore";
import { latestGrowthMetrics } from "../lib/growthMetrics";
import { latestValuationMetrics } from "../lib/valuationMetrics";
import { Card, CategoryBar, ConfidenceBadge, ChangeTag, ScoreGauge, SectionLabel, StatusBadge } from "../components/Primitives";
import { DataUnavailable, ErrorBlock, LoadingBlock } from "../components/States";
import { C, CATEGORY_ORDER, severityColor, severityFromImportance } from "../styles/tokens";

function OpportunityChip({ score, confidence }: { score: number | null; confidence: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", backgroundColor: C.surfaceSunken, borderRadius: 10, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{score ?? <DataUnavailable label="—" />}</div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>Opportunity Score</div>
        <div style={{ fontSize: 11, color: C.textSoft }}>How interesting the stock looks right now — kept separate from fundamentals</div>
      </div>
    </div>
  );
}

function ThesisSection({ title, text, tone }: { title: string; text: string | null; tone: "bull" | "base" | "bear" }) {
  const color = tone === "bull" ? C.positive : tone === "bear" ? C.negative : C.text;
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{title}</div>
      {text ? <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.55 }}>{text}</p> : <DataUnavailable />}
    </div>
  );
}

function ListCard({ title, items, icon: Icon }: { title: string; items: string[]; icon: React.ComponentType<{ size?: number }> }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon size={12} /> {title}
      </div>
      {items.length === 0 ? <DataUnavailable /> : (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
          {items.map((item, i) => <li key={i} style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.5 }}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { followed, toggle } = useFollowed();
  const { data: companies } = useCompanies();
  const { data: scores, loading: scoresLoading, error: scoresError } = useCompanyScores(id);
  const { data: financials, loading: finLoading } = useCompanyFinancials(id);
  const { data: metrics } = useCompanyMetrics(id);
  const { data: valuation } = useCompanyValuation(id);
  const { data: analysis, loading: analysisLoading } = useCompanyAnalysis(id);
  const { data: changes } = useCompanyChanges(id);

  const company = companies?.find((c) => c.id === id);

  if (scoresLoading || finLoading || analysisLoading) return <LoadingBlock label="Loading company…" />;
  if (scoresError) return <ErrorBlock message={scoresError} onRetry={() => window.location.reload()} />;
  if (!id || !company) return <ErrorBlock message="Company not found." />;

  const fundamental = scores?.fundamental;
  const categories = scores?.categories ?? [];
  const headline = primaryScore(scores);
  const growthMetrics = latestGrowthMetrics(metrics ?? []);
  const valuationMetrics = latestValuationMetrics(valuation ?? []);
  const thesis = analysis?.thesis;
  const isFollowed = followed.has(id);

  return (
    <div style={{ maxWidth: 780 }}>
      <button onClick={() => navigate(-1)} style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", cursor: "pointer", color: C.textSoft, fontSize: 13, fontWeight: 500, marginBottom: 20, padding: 0 }}>
        <ChevronLeft size={15} /> Back
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0, letterSpacing: "-0.01em" }}>{company.name}</h1>
          <p style={{ fontSize: 13.5, color: C.textFaint, margin: "5px 0 0" }}>{company.ticker} · {company.exchange} · {company.sector}</p>
        </div>
        <button onClick={() => toggle(id)} style={{ padding: "9px 18px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600, border: isFollowed ? `1px solid ${C.border}` : "none", backgroundColor: isFollowed ? C.surface : C.accent, color: isFollowed ? C.text : C.surface }}>
          {isFollowed ? "Following" : "Follow"}
        </button>
      </div>

      {!headline ? (
        <Card style={{ padding: 30, marginBottom: 16, textAlign: "center" }}>
          <p style={{ fontSize: 13.5, color: C.textSoft, margin: 0 }}>No score yet — this company hasn't completed a scoring run.</p>
        </Card>
      ) : (
        <Card style={{ padding: "26px 24px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", marginBottom: fundamental ? 18 : 0 }}>
            <ScoreGauge score={headline.score} label={headline.label} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <StatusBadge score={headline.score} />
                {fundamental && <ChangeTag value={fundamental.score_change} />}
                {fundamental?.previous_score != null && <span style={{ fontSize: 12, color: C.textFaint }}>from {fundamental.previous_score}</span>}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <ConfidenceBadge confidence={headline.confidence} />
                {fundamental && (
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textFaint, backgroundColor: C.surfaceSunken, padding: "3px 8px", borderRadius: 999 }}>
                    Data coverage {Math.round(fundamental.data_coverage * 100)}%
                  </span>
                )}
                <span style={{ fontSize: 11.5, fontWeight: 600, color: C.textFaint, backgroundColor: C.surfaceSunken, padding: "3px 8px", borderRadius: 999 }}>
                  calc {fundamental ? fundamental.calculation_version : categories.find((c) => c.score_categories.category_key === "GROWTH")?.calculation_version}
                </span>
              </div>
            </div>
          </div>
          {fundamental && <OpportunityChip score={analysis?.snapshot?.opportunity_score ?? null} confidence={fundamental.confidence} />}
        </Card>
      )}

      <Card style={{ padding: "22px 24px", marginBottom: 16 }}>
        <SectionLabel>Score Dimensions</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {CATEGORY_ORDER.map((key) => {
            const c = categories.find((x) => x.score_categories.category_key === key);
            if (!c) return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 148, fontSize: 13, color: C.textFaint }}>{key}</div>
                <DataUnavailable label="Not yet scored" />
              </div>
            );
            return <CategoryBar key={key} label={c.score_categories.name} value={c.score} confidence={c.confidence} />;
          })}
        </div>
      </Card>

      <Card style={{ padding: "22px 24px", marginBottom: 16 }}>
        <SectionLabel>Growth Metrics</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 20 }}>
          {growthMetrics.map((m) => (
            <div key={m.metricName}>
              <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                {m.value != null ? `${m.value}${m.unit}` : <DataUnavailable />}
              </div>
              {m.periodEnd && <div style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>{m.periodEnd} (ANNUAL)</div>}
            </div>
          ))}
        </div>
      </Card>

      {thesis && (
        <Card style={{ padding: "22px 24px", marginBottom: 16 }}>
          <SectionLabel>Why this score?</SectionLabel>
          <p style={{ fontSize: 14, color: C.text, lineHeight: 1.65, margin: 0 }}>{thesis.thesis}</p>
          <div style={{ marginTop: 10, fontSize: 11, color: C.textFaint }}>AI interpretation · {thesis.model_version} · generated {new Date(thesis.generated_at).toLocaleDateString()}</div>
        </Card>
      )}

      <Card style={{ padding: "22px 24px", marginBottom: 16 }}>
        <SectionLabel>Key Fundamentals</SectionLabel>
        {!financials || financials.length === 0 ? (
          <DataUnavailable label="No financial data ingested yet for this company." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 20 }}>
            {financials.map((f) => (
              <div key={`${f.metric_name}-${f.period_end}`}>
                <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>{f.metric_name.replace(/_/g, " ")}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                  {f.value != null ? `${f.value}${f.unit === "%" ? "%" : ""}` : <DataUnavailable />}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textFaint, marginTop: 6 }}>
                  <FileText size={11} /><span>{f.period_end} ({f.period_type}) · source {f.source_id.slice(0, 8)}…</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ padding: "22px 24px", marginBottom: 16 }}>
        <SectionLabel>Valuation</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 20 }}>
          {valuationMetrics.map((m) => (
            <div key={m.metricName}>
              <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                {m.value != null ? m.value : <DataUnavailable />}
              </div>
              {m.periodEnd && <div style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>{m.periodEnd}</div>}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: C.textFaint, marginTop: 14, marginBottom: 0 }}>
          Valuation multiples require market-price data the current pipeline does not yet ingest — shown here for when that becomes available, not fabricated in the meantime.
        </p>
      </Card>

      <Card style={{ padding: "22px 24px", marginBottom: 16 }}>
        <SectionLabel>AI Investment Thesis</SectionLabel>
        {!thesis ? (
          <DataUnavailable label="No AI analysis generated yet for this company." />
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 14, lineHeight: 1.4 }}>{thesis.headline}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 18 }}>
              <ThesisSection title="Bull case" text={thesis.bull_case} tone="bull" />
              <ThesisSection title="Base case" text={thesis.base_case} tone="base" />
              <ThesisSection title="Bear case" text={thesis.bear_case} tone="bear" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
              <ListCard title="Catalysts" items={thesis.catalysts} icon={TrendingUp} />
              <ListCard title="Risks" items={thesis.risks} icon={TrendingDown} />
              <ListCard title="What would change this thesis" items={thesis.thesis_change_conditions} icon={AlertTriangle} />
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: C.textFaint }}>AI interpretation of verified data — not investment advice.</div>
          </>
        )}
      </Card>

      <Card style={{ padding: "22px 24px", marginBottom: 16 }}>
        <SectionLabel>Recent Changes</SectionLabel>
        {!changes || changes.length === 0 ? (
          <DataUnavailable label="No changes detected yet." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {changes.map((ev) => (
              <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: severityColor(severityFromImportance(ev.importance_score)), backgroundColor: C.surfaceSunken, padding: "2px 7px", borderRadius: 999, marginTop: 2, flexShrink: 0 }}>
                  {severityFromImportance(ev.importance_score)}
                </span>
                <div>
                  <div style={{ fontSize: 12.5, color: C.text, fontWeight: 500 }}>
                    {ev.event_type === "SCORE_CHANGE" ? `Fundamental score ${ev.old_value} → ${ev.new_value}` : `${ev.metric_name}: ${ev.old_value} → ${ev.new_value}`}
                  </div>
                  <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2 }}>{new Date(ev.detected_at).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 4px", color: C.textFaint }}>
        <Info size={13} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
          Every figure above traces to a source and retrieval date. Confidence and data coverage are reported separately from the score itself. Nothing here is investment advice.
        </p>
      </div>
    </div>
  );
}
