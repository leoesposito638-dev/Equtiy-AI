import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { C, FONT } from "../styles/tokens";
import { useCompanySearch } from "../lib/useApi";

// Milestone 16C item 4: queries the real backend (GET /search, debounced)
// instead of filtering an already-loaded company list client-side — see
// useCompanySearch's own doc comment in lib/useApi.ts.
export function SearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const { data: results, loading } = useCompanySearch(query);

  const showDropdown = focused && query.trim().length > 0;

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
      {showDropdown && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, overflow: "hidden", zIndex: 20, boxShadow: "0 8px 24px rgba(20,23,28,0.08)" }}>
          {results && results.length > 0 ? (
            results.map((c) => (
              <button key={c.ticker} onClick={() => { navigate(`/company/${c.id}`); setQuery(""); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 16px", border: "none", background: "none", cursor: "pointer", borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{c.name}</span>
                  <span style={{ fontSize: 12, color: C.textFaint }}>{c.ticker}</span>
                </span>
              </button>
            ))
          ) : (
            <div style={{ padding: "10px 16px", fontSize: 12.5, color: C.textFaint }}>
              {loading ? "Searching…" : `No matches for "${query.trim()}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
