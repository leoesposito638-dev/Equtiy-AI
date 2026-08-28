import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompanies } from "../lib/useApi";
import { useFollowed } from "../lib/followedContext";
import { DiscoveryCard } from "../components/DiscoveryCard";
import { PageHeader, SectionLabel } from "../components/Primitives";
import { ErrorBlock, LoadingBlock } from "../components/States";
import { C } from "../styles/tokens";

const DISCOVERY_CATEGORIES = ["Strong Growth", "Improving Fundamentals", "High Quality", "Attractive Valuation", "Strong Financial Health"];

export default function DiscoverPage() {
  const { data: companies, loading, error } = useCompanies();
  const { followed, toggle } = useFollowed();
  const navigate = useNavigate();
  const [activeCat, setActiveCat] = useState<string | null>(null);

  if (loading) return <LoadingBlock label="Loading companies…" />;
  if (error) return <ErrorBlock message={error} />;
  if (!companies) return null;

  const candidates = companies.filter((c) => !followed.has(c.id));

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Discover" subtitle="Companies Equity AI thinks are interesting right now." />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        {DISCOVERY_CATEGORIES.map((catName) => {
          const active = activeCat === catName;
          return (
            <button key={catName} onClick={() => setActiveCat(active ? null : catName)} style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? C.accent : C.border}`, backgroundColor: active ? C.accent : C.surface, color: active ? C.surface : C.textSoft }}>
              {catName}
            </button>
          );
        })}
      </div>
      {activeCat && (
        <p style={{ fontSize: 12, color: C.textFaint, marginTop: -18, marginBottom: 20 }}>
          Category filtering surfaces here once the backend's peer-percentile categorization is wired up — showing all uncovered companies for now.
        </p>
      )}
      <SectionLabel>Interesting right now</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {candidates.map((c) => (
          <DiscoveryCard key={c.id} company={c} followed={followed.has(c.id)} onFollow={() => toggle(c.id)} onAnalyze={() => navigate(`/company/${c.id}`)} />
        ))}
      </div>
    </div>
  );
}
