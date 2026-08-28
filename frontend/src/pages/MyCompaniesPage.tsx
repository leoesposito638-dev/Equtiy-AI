import React from "react";
import { useNavigate } from "react-router-dom";
import { useCompanies } from "../lib/useApi";
import { useFollowed } from "../lib/followedContext";
import { CompanyListRow } from "../components/CompanyListRow";
import { Card, PageHeader } from "../components/Primitives";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "../components/States";

export default function MyCompaniesPage() {
  const { data: companies, loading, error } = useCompanies();
  const { followed, toggle } = useFollowed();
  const navigate = useNavigate();

  if (loading) return <LoadingBlock label="Loading companies…" />;
  if (error) return <ErrorBlock message={error} />;
  if (!companies) return null;

  const followedCompanies = companies.filter((c) => followed.has(c.id));

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="My Companies" subtitle="Every company Equity AI is continuously watching for you." />
      {followedCompanies.length === 0 ? (
        <EmptyBlock title="You aren't following any companies yet" description="Follow a company from its page, or find one worth watching on Discover." action={{ label: "Discover companies", onClick: () => navigate("/discover") }} />
      ) : (
        <Card>
          {followedCompanies.map((c, i) => (
            <CompanyListRow key={c.id} company={c} last={i === followedCompanies.length - 1} onClick={() => navigate(`/company/${c.id}`)} onUnfollow={() => toggle(c.id)} />
          ))}
        </Card>
      )}
    </div>
  );
}
