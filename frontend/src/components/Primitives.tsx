import React from "react";
import { ArrowUp, ArrowDown, Minus, ShieldCheck, AlertTriangle } from "lucide-react";
import { C, statusFor, statusColor } from "../styles/tokens";

export function ChangeTag({ value, size = "sm" }: { value: number | null; size?: "sm" | "lg" }) {
  const v = value ?? 0;
  const isPos = v > 0, isZero = v === 0;
  const color = isZero ? C.textFaint : isPos ? C.positive : C.negative;
  const bg = isZero ? C.surfaceSunken : isPos ? C.positiveSoft : C.negativeSoft;
  const Icon = isZero ? Minus : isPos ? ArrowUp : ArrowDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color, backgroundColor: bg, fontSize: size === "lg" ? 14 : 12, fontWeight: 600, padding: "3px 8px", borderRadius: 999, fontVariantNumeric: "tabular-nums" }}>
      <Icon size={size === "lg" ? 13 : 11} strokeWidth={2.5} />
      {isZero ? "0" : Math.abs(v)}
    </span>
  );
}

export function StatusBadge({ score }: { score: number }) {
  const status = statusFor(score);
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color: statusColor(status), display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: statusColor(status) }} />
      {status}
    </span>
  );
}

export function ConfidenceBadge({ confidence, coverage, compact }: { confidence: number; coverage?: number; compact?: boolean }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? C.positive : pct >= 50 ? C.amber : C.negative;
  const bg = pct >= 80 ? C.positiveSoft : pct >= 50 ? C.amberSoft : C.negativeSoft;
  return (
    <span title={coverage != null ? `Data coverage ${Math.round(coverage * 100)}%` : undefined}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color, backgroundColor: bg, padding: "3px 8px", borderRadius: 999 }}>
      <ShieldCheck size={11} strokeWidth={2.5} />
      {compact ? `${pct}%` : `Confidence ${pct}%`}
    </span>
  );
}

export function Card({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, cursor: onClick ? "pointer" : undefined, ...style }}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, action }: { children: React.ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
      <h2 style={{ fontSize: 12.5, fontWeight: 700, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{children}</h2>
      {action && <button onClick={action.onClick} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: C.accent }}>{action.label}</button>}
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: "-0.01em", margin: 0 }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 14.5, color: C.textSoft, margin: "5px 0 0" }}>{subtitle}</p>}
    </div>
  );
}

export function ScoreGauge({ score, size = 140, label = "Fundamental Score" }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 10, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r, pct = score / 100;
  const color = statusColor(statusFor(score));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth="10" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.28} fontWeight="700" fill={C.text} fontVariantNumeric="tabular-nums">{score}</text>
        <text x={cx} y={cy + size * 0.15} textAnchor="middle" fontSize={size * 0.07} fontWeight="600" fill={C.textFaint}>/ 100</text>
      </svg>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

export function CategoryBar({ label, value, confidence }: { label: string; value: number; confidence: number }) {
  const color = value >= 85 ? C.positive : value >= 60 ? C.accent : C.negative;
  const lowConfidence = confidence < 0.6;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 148, fontSize: 13, color: C.textSoft, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
        {label}
        {lowConfidence && <span title="Lower confidence — limited data coverage"><AlertTriangle size={11} color={C.amber} /></span>}
      </div>
      <div style={{ flex: 1, height: 6, backgroundColor: C.surfaceSunken, borderRadius: 999, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <div style={{ width: `${value}%`, height: "100%", backgroundColor: color, opacity: lowConfidence ? 0.55 : 1, borderRadius: 999 }} />
      </div>
      <div style={{ width: 28, textAlign: "right", fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
