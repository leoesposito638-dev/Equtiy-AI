import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, Minus, ChevronRight } from "lucide-react";
import { useAlerts } from "../lib/useApi";
import { api } from "../lib/apiClient";
import { DEMO_MODE } from "../lib/config";
import { Card, ChangeTag, PageHeader, SectionLabel } from "../components/Primitives";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../components/States";
import { C, severityColor } from "../styles/tokens";

export default function AlertsPage() {
  const { data: alerts, loading, error } = useAlerts();
  const navigate = useNavigate();

  if (loading) return <LoadingBlock label="Loading alerts…" />;
  if (error) return <ErrorBlock message={error} />;
  if (!alerts) return null;

  const handleMarkRead = async (id: string) => {
    if (DEMO_MODE) return; // no persistence layer to write to in demo mode
    try { await api.markAlertRead(id); } catch { /* surfaced via next refetch */ }
  };

  return (
    <div style={{ maxWidth: 780 }}>
      <PageHeader title="Alerts" subtitle="Meaningful changes detected in the companies you follow." />
      {alerts.length === 0 ? (
        <EmptyBlock title="No meaningful changes right now" description="You'll see an alert here the moment something matters — Equity AI doesn't alert on tiny movements." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map((a) => {
            const isPos = (a.score_after ?? 0) > (a.score_before ?? 0);
            const isFlat = a.score_after === a.score_before;
            const Icon = isFlat ? Minus : isPos ? ArrowUp : ArrowDown;
            return (
              <Card key={a.id} style={{ padding: 20, cursor: "pointer", opacity: a.is_read ? 0.7 : 1 }}
                onClick={() => { handleMarkRead(a.id); navigate(`/company/${a.company_id}`); }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, backgroundColor: isFlat ? C.surfaceSunken : isPos ? C.positiveSoft : C.negativeSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={15} color={isFlat ? C.textFaint : isPos ? C.positive : C.negative} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{a.companies.name}</div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: severityColor(a.severity), backgroundColor: C.surfaceSunken, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: "0.04em" }}>{a.severity}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.textSoft, marginBottom: 8 }}>{a.title}</div>
                    {a.score_before != null && a.score_after != null && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: C.textFaint, fontVariantNumeric: "tabular-nums" }}>{a.score_before}</span>
                        <ChevronRight size={13} color={C.textFaint} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{a.score_after}</span>
                        <ChangeTag value={a.score_after - a.score_before} size="lg" />
                      </div>
                    )}
                    <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.5 }}>{a.summary}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
