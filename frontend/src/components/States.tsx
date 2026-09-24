// ============================================================================
// Loading / error / empty / demo-mode states.
// "Treat failure and emptiness as moments for direction, not mood" — every
// state here says what happened and, where relevant, what to do about it.
// ============================================================================

import React from "react";
import { WifiOff, AlertCircle, Loader2 } from "lucide-react";
import { C } from "../styles/tokens";

/** Milestone 16B: the banner must say WHEN this snapshot was captured and
 * WHICH scoring version it reflects, not just that it's a snapshot — a
 * generic "showing real data" notice reads as reassurance, not a warning,
 * and hides that the numbers behind it can be several scoring versions
 * stale (see scoreDisplay.ts's isComparableChange for why that matters). */
export function DemoBanner({ show, meta }: { show: boolean; meta?: { generatedAt: string; calculationVersion: string } }) {
  if (!show) return null;
  const capturedLabel = meta
    ? new Date(meta.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", backgroundColor: C.amberSoft, borderBottom: `1px solid ${C.border}`, fontSize: 12.5, color: "#6B5420" }}>
      <WifiOff size={14} strokeWidth={2} />
      <span>
        <strong>Not live.</strong>{" "}
        {meta ? (
          <>Showing a snapshot captured <strong>{capturedLabel}</strong>, scoring <strong>{meta.calculationVersion}</strong> — real data, but frozen at that moment and not updated since.</>
        ) : (
          <>Showing a real data snapshot captured from Supabase, not fabricated values.</>
        )}{" "}
        Set <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 5px", borderRadius: 4 }}>VITE_API_BASE_URL</code> to connect to the current database.
      </span>
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 40, color: C.textFaint, fontSize: 13.5 }}>
      <Loader2 size={16} className="spin" style={{ animation: "spin 0.8s linear infinite" }} />
      {label}
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: 24, backgroundColor: C.negativeSoft, borderRadius: 12, border: `1px solid ${C.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.negative, fontSize: 13.5, fontWeight: 600 }}>
        <AlertCircle size={16} /> Couldn't load this
      </div>
      <p style={{ fontSize: 12.5, color: C.textSoft, margin: 0, lineHeight: 1.5 }}>{message}</p>
      {onRetry && (
        <button onClick={onRetry} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, backgroundColor: C.surface, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ title, description, action }: { title: string; description: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ padding: 40, textAlign: "center", backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>{title}</div>
      <p style={{ fontSize: 13, color: C.textSoft, margin: "0 0 16px" }}>{description}</p>
      {action && (
        <button onClick={action.onClick} style={{ padding: "9px 18px", borderRadius: 9, border: "none", backgroundColor: C.accent, color: C.surface, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Used for any individual metric/field the backend explicitly reports as
 * unavailable, rather than fabricating a placeholder value. */
export function DataUnavailable({ label }: { label?: string }) {
  return <span style={{ fontSize: 12.5, color: C.textFaint, fontStyle: "italic" }}>{label ?? "Data unavailable"}</span>;
}
