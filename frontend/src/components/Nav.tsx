import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Building2, Compass, Bell } from "lucide-react";
import { C } from "../styles/tokens";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<any>;
  end: boolean;
}

// Milestone 16C item 5 — grouped sidebar sections, matching Prototype 1.2's
// SIDEBAR_SECTIONS (equity-ai-prototype-1.2.jsx line 472) with one
// deliberate difference: the prototype's PORTFOLIO section has two items
// ("Watchlist" and "Companies") because its fixture data models them as
// separate views; this app has one real page for that (MyCompaniesPage, at
// /companies) so PORTFOLIO has one item. No SETTINGS section — there is no
// user-preferences backend to put behind it yet (see the Milestone 16C
// report's Prototype-gap plan, milestone 5).
export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  { label: "RESEARCH", items: [
    { to: "/", label: "Dashboard", icon: Home, end: true },
    { to: "/discover", label: "Discover", icon: Compass, end: false },
  ] },
  { label: "PORTFOLIO", items: [
    { to: "/companies", label: "My Companies", icon: Building2, end: false },
  ] },
  { label: "MONITORING", items: [
    { to: "/alerts", label: "Alerts", icon: Bell, end: false },
  ] },
];

const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function Sidebar({ alertCount }: { alertCount: number }) {
  return (
    <div className="hidden md:flex" style={{ width: 232, flexShrink: 0, borderRight: `1px solid ${C.border}`, flexDirection: "column", height: "100vh", position: "sticky", top: 0, backgroundColor: C.surface }}>
      <div style={{ padding: "26px 24px 22px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>equity<span style={{ color: C.textFaint, fontWeight: 500 }}>AI</span></div>
      </div>
      <nav style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.textFaint, letterSpacing: "0.06em", padding: "0 12px 6px" }}>{section.label}</div>
            {section.items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, textDecoration: "none",
                backgroundColor: isActive ? C.accentSoft : "transparent", color: isActive ? C.accent : C.textSoft,
                fontSize: 13.5, fontWeight: isActive ? 600 : 500, marginBottom: 2,
              })}>
                <item.icon size={16} strokeWidth={2} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.to === "/alerts" && alertCount > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.surface, backgroundColor: C.accent, borderRadius: 999, padding: "1px 6px", minWidth: 16, textAlign: "center" }}>{alertCount}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div style={{ marginTop: "auto", padding: "16px 24px", fontSize: 11, color: C.textFaint }}>Equity AI</div>
    </div>
  );
}

export function MobileNav({ alertCount }: { alertCount: number }) {
  return (
    <div className="flex md:hidden" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, backgroundColor: C.surface, borderTop: `1px solid ${C.border}`, justifyContent: "space-around", padding: "8px 4px calc(env(safe-area-inset-bottom, 8px))" }}>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} style={({ isActive }) => ({
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textDecoration: "none",
          padding: "4px 10px", color: isActive ? C.accent : C.textFaint, position: "relative",
        })}>
          {({ isActive }: { isActive: boolean }) => (
            <>
              <item.icon size={19} strokeWidth={isActive ? 2.4 : 2} />
              <span style={{ fontSize: 10.5, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
              {item.to === "/alerts" && alertCount > 0 && <span style={{ position: "absolute", top: 0, right: 4, width: 7, height: 7, borderRadius: 999, backgroundColor: C.negative }} />}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

export function TopBar() {
  return (
    <div className="flex md:hidden" style={{ alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${C.border}`, backgroundColor: C.surface, position: "sticky", top: 0, zIndex: 30 }}>
      <div style={{ fontSize: 16.5, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>equity<span style={{ color: C.textFaint, fontWeight: 500 }}>AI</span></div>
    </div>
  );
}
