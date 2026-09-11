// ============================================================================
// One row in a company list (Overview "Your companies", My Companies).
// Each row independently loads its own score summary. The backend doesn't
// currently expose a bulk "companies + scores" endpoint — for a watchlist of
// realistic size (tens of companies) that's fine; see README "Known gaps"
// for the recommendation to add one before scaling to hundreds.
// ============================================================================

import React from "react";
import { ChevronRight, X } from "lucide-react";
import { useCompanyScores } from "../lib/useApi";
import { ChangeTag, ConfidenceBadge, StatusBadge } from "./Primitives";
import { C } from "../styles/tokens";
import type { Company } from "../lib/types";

export function CompanyListRow({ company, last, onClick, onUnfollow }: {
  company: Company; last: boolean; onClick: () => void; onUnfollow?: () => void;
}) {
  const { data } = useCompanyScores(company.id);
  const fundamental = data?.fundamental;

  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer", borderBottom: last ? "none" : `1px solid ${C.border}`, gap: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{company.name}</div>
        <div style={{ fontSize: 12, color: C.textFaint, marginTop: 1 }}>{company.ticker} · {company.sector}</div>
      </div>
      {fundamental ? (
        <>
          <div className="hidden sm:block"><ConfidenceBadge confidence={fundamental.confidence} coverage={fundamental.data_coverage} compact /></div>
          <div style={{ width: 50, textAlign: "right", fontSize: 15, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{fundamental.score}</div>
          <div style={{ width: 54, display: "flex", justifyContent: "flex-end" }}><ChangeTag value={fundamental.score_change} /></div>
          <div className="hidden sm:block" style={{ width: 90, textAlign: "right" }}><StatusBadge score={fundamental.score} /></div>
        </>
      ) : (
        <span style={{ fontSize: 12, color: C.textFaint }}>Score pending</span>
      )}
      {onUnfollow && (
        <button onClick={(e) => { e.stopPropagation(); onUnfollow(); }} title="Unfollow" style={{ border: "none", background: "none", cursor: "pointer", padding: 4, color: C.textFaint }}>
          <X size={14} />
        </button>
      )}
      <ChevronRight size={15} color={C.textFaint} />
    </div>
  );
}
