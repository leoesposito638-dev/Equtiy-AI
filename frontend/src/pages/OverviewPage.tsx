import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useCompanies, useCompanyScores, useCompanyChanges } from "../lib/useApi";
import { SearchBar } from "../components/SearchBar";
import { CompanyListRow } from "../components/CompanyListRow";
import { DiscoveryCard } from "../components/DiscoveryCard";
import { Card, SectionLabel, ChangeTag } from "../components/Primitives";
import { ErrorBlock, LoadingBlock } from "../components/States";
import { C } from "../styles/tokens";
import type { Company } from "../lib/types";
import { useFollowed } from "../lib/followedContext";

function WhatChangedRow({ company }: { company: Company }) {
  const navigate = useNavigate();
  const { data: scores } = useCompanyScores(company.id);
  const { data: changes } = useCompanyChanges(company.id);
  const fundamental = scores?.fundamental;
  const topChange = changes?.[0];
  if (!fundamental || !topChange) return null;

  return (
    <Card style={{ padding: 18, cursor: "pointer" }} onClick={() => navigate(`/company/${company.id}`)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{company.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: C.textFaint }}>{fundamental.previous_score}</span>
          <ChevronRight size={12} color={C.textFaint} />
          <span style={{ fontWeight: 700, color: C.text }}>{fundamental.score}</span>
          <ChangeTag value={fundamental.score_change} />
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.textSoft, margin: 0, lineHeight: 1.5 }}>
        {topChange.event_type === "SCORE_CHANGE" ? `Fundamental score moved by ${topChange.absolute_change}.` : `${topChange.metric_name} changed.`}
      </p>
    </Card>
  );
}

export default function OverviewPage() {
  const { data: companies, loading, error } = useCompanies();
  const { followed } = useFollowed();

  if (loading) return <LoadingBlock label="Loading companies…" />;
  if (error) return <ErrorBlock message={error} />;
  if (!companies) return null;

  const followedCompanies = companies.filter((c) => followed.has(c.id));
  const discoveryCompanies = companies.filter((c) => !followed.has(c.id)).slice(0, 3);

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 26 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: "-0.01em", margin: 0 }}>Good morning.</h1>
        <p style={{ fontSize: 14.5, color: C.textSoft, margin: "5px 0 0" }}>Your companies, continuously analyzed.</p>
      </div>

      <SearchBar companies={companies} />

      <div style={{ marginTop: 34 }}>
        <SectionLabel>Your companies</SectionLabel>
        {followedCompanies.length === 0 ? (
          <p style={{ fontSize: 13, color: C.textFaint }}>You aren't following any companies yet — try Discover.</p>
        ) : (
          <Card>
            {followedCompanies.map((c, i) => (
              <CompanyListRowLink key={c.id} company={c} last={i === followedCompanies.length - 1} />
            ))}
          </Card>
        )}
      </div>

      <div style={{ marginTop: 34 }}>
        <SectionLabel>What changed</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {followedCompanies.map((c) => <WhatChangedRow key={c.id} company={c} />)}
        </div>
      </div>

      <div style={{ marginTop: 34 }}>
        <SectionLabel>Companies worth looking into</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {discoveryCompanies.map((c) => (
            <DiscoveryCardLink key={c.id} company={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CompanyListRowLink({ company, last }: { company: Company; last: boolean }) {
  const navigate = useNavigate();
  return <CompanyListRow company={company} last={last} onClick={() => navigate(`/company/${company.id}`)} />;
}

function DiscoveryCardLink({ company }: { company: Company }) {
  const navigate = useNavigate();
  const { followed, toggle } = useFollowed();
  return (
    <DiscoveryCard company={company} followed={followed.has(company.id)} onFollow={() => toggle(company.id)} onAnalyze={() => navigate(`/company/${company.id}`)} />
  );
}
