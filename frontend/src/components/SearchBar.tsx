import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { C, FONT } from "../styles/tokens";
import type { Company } from "../lib/types";

export function SearchBar({ companies }: { companies: Company[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q)).slice(0, 6);
  }, [query, companies]);

  return (
    <div style={{ position: "relative", maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", border: `1px solid ${C.border}`, borderRadius: 11, backgroundColor: C.surface }}>
        <Search size={16} color={C.textFaint} strokeWidth={2} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search company or ticker…"
          style={{ border: "none", outline: "none", fontSize: 14, flex: 1, color: C.text, backgroundColor: "transparent", fontFamily: FONT }}
        />
      </div>
      {focused && results.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, overflow: "hidden", zIndex: 20, boxShadow: "0 8px 24px rgba(20,23,28,0.08)" }}>
          {results.map((c) => (
            <button key={c.ticker} onClick={() => { navigate(`/company/${c.id}`); setQuery(""); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 16px", border: "none", background: "none", cursor: "pointer", borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{c.name}</span>
                <span style={{ fontSize: 12, color: C.textFaint }}>{c.ticker}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
