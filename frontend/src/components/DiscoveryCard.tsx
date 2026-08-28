import React from "react";
import { useCompanyAnalysis, useCompanyScores } from "../lib/useApi";
import { Card } from "./Primitives";
import { C } from "../styles/tokens";
import type { Company } from "../lib/types";

export function DiscoveryCard({ company, onAnalyze, onFollow, followed }: {
  company: Company; onAnalyze: () => void; onFollow?: () => void; followed?: boolean;
}) {
  const { data: scores } = useCompanyScores(company.id);
  const { data: analysis } = useCompanyAnalysis(company.id);
  const fundamental = scores?.fundamental;

  return (
    <Card style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{company.name}</div>
          <div style={{ fontSize: 11.5, color: C.textFaint }}>{company.ticker}</div>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fundamental?.score ?? "—"}</div>
      </div>
      <p style={{ fontSize: 12.5, color: C.textSoft, margin: 0, lineHeight: 1.5, minHeight: 38 }}>
        {analysis?.thesis?.thesis ?? "Analysis not yet available for this company."}
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={onAnalyze} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1px solid ${C.border}`, backgroundColor: C.surface, color: C.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          Analyze
        </button>
        {onFollow && (
          <button onClick={onFollow} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", backgroundColor: followed ? C.accentSoft : C.accent, color: followed ? C.accent : C.surface, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            {followed ? "Following" : "Follow"}
          </button>
        )}
      </div>
    </Card>
  );
}
