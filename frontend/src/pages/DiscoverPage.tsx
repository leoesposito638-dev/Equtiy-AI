import React from "react";
import { useNavigate } from "react-router-dom";
import { useCompanies, useCompanyScoresMap } from "../lib/useApi";
import { useFollowed } from "../lib/followedContext";
import { primaryScore } from "../lib/primaryScore";
import { DiscoveryCard } from "../components/DiscoveryCard";
import { PageHeader, SectionLabel } from "../components/Primitives";
import { ErrorBlock, LoadingBlock } from "../components/States";

export default function DiscoverPage() {
  const { data: companies, loading, error } = useCompanies();
  const { data: scoresMap, loading: scoresLoading } = useCompanyScoresMap(companies);
  const { followed, toggle } = useFollowed();
  const navigate = useNavigate();

  if (loading || scoresLoading) return <LoadingBlock label="Loading companies…" />;
  if (error) return <ErrorBlock message={error} />;
  if (!companies) return null;

  // Ranked by Fundamental Score (real score when available, falling back to
  // the same primaryScore logic every score display in the app uses) — a
  // company with no score yet sorts to the bottom rather than being hidden.
  const ranked = [...companies].sort((a, b) => {
    const sa = primaryScore(scoresMap?.get(a.id))?.score ?? -1;
    const sb = primaryScore(scoresMap?.get(b.id))?.score ?? -1;
    return sb - sa;
  });

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader title="Discover" subtitle={`Ranked by Fundamental Score across the ${companies.length}-company demo universe.`} />
      <SectionLabel>All companies</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {ranked.map((c, i) => (
          <DiscoveryCard
            key={c.id}
            rank={i + 1}
            company={c}
            followed={followed.has(c.id)}
            onFollow={() => toggle(c.id)}
            onAnalyze={() => navigate(`/company/${c.id}`)}
          />
        ))}
      </div>
    </div>
  );
}
