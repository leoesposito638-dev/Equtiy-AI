import React, { useRef, useState } from "react";
import { Info } from "lucide-react";
import { C } from "../styles/tokens";
import { GLOSSARY, GLOSSARY_ALIASES } from "../lib/glossary";

// ============================================================================
// Financial terminology tooltips (Milestone 16C, item 3). Ported from
// Prototype 1.2's InfoIcon/FinancialTerm (equity-ai-prototype-1.2.jsx lines
// 410-468) — same behavior: a single reusable ⓘ + popover, opens on
// click/tap (not hover-only, so it works on touch devices) and closes on an
// outside tap. No component defines its own tooltip text; everything
// resolves from lib/glossary.ts.
// ============================================================================

function InfoIcon({ termKey }: { termKey: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const entry = GLOSSARY[termKey];
  if (!entry) return null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const popWidth = 260;
      let left = rect.left;
      if (left + popWidth > window.innerWidth - 12) left = window.innerWidth - popWidth - 12;
      setPos({ top: rect.bottom + 6, left: Math.max(12, left) });
    }
    setOpen((o) => !o);
  };

  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button ref={btnRef} onClick={toggle} aria-label={`What does ${entry.term} mean?`} style={{
        border: "none", background: "none", cursor: "pointer", padding: 2, marginLeft: 3, color: C.textFaint,
        display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999,
      }}>
        <Info size={12} strokeWidth={2} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "fixed", top: pos.top, left: pos.left, width: 260, zIndex: 200,
            backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14,
            boxShadow: "0 10px 30px rgba(15,20,32,0.14)",
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 8 }}>{entry.term}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, letterSpacing: "0.05em", marginBottom: 3 }}>WHAT IS IT?</div>
            <p style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5, margin: "0 0 10px" }}>{entry.whatIsIt}</p>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textFaint, letterSpacing: "0.05em", marginBottom: 3 }}>WHY IT MATTERS</div>
            <p style={{ fontSize: 12, color: C.textSoft, lineHeight: 1.5, margin: 0 }}>{entry.whyItMatters}</p>
          </div>
        </>
      )}
    </span>
  );
}

/** Wraps a metric label with its ⓘ tooltip, resolved from GLOSSARY_ALIASES.
 * If a label has no glossary entry, it just renders as plain text — adding
 * a tooltip is opt-in via the glossary, never assumed (the prototype's own
 * rule: don't tooltip ordinary words, only real financial terminology). */
export function FinancialTerm({ label, style }: { label: string; style?: React.CSSProperties }) {
  const key = GLOSSARY_ALIASES[label];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", ...style }}>
      {label}
      {key && <InfoIcon termKey={key} />}
    </span>
  );
}
