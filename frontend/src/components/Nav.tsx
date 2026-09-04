import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Building2, Compass, Bell } from "lucide-react";
import { C } from "../styles/tokens";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: Home, end: true },
  { to: "/companies", label: "My Companies", icon: Building2, end: false },
  { to: "/discover", label: "Discover", icon: Compass, end: false },
  { to: "/alerts", label: "Alerts", icon: Bell, end: false },
];

export function Sidebar({ alertCount }: { alertCount: number }) {
  return (
    <div className="hidden md:flex" style={{ width: 232, flexShrink: 0, borderRight: `1px solid ${C.border}`, flexDirection: "column", height: "100vh", position: "sticky", top: 0, backgroundColor: C.surface }}>
      <div style={{ padding: "26px 24px 22px" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>equity<span style={{ color: C.textFaint, fontWeight: 500 }}>AI</span></div>
      </div>
      <nav style={{ padding: "4px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} style={({ isActive }) => ({
            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, textDecoration: "none",
            backgroundColor: isActive ? C.accentSoft : "transparent", color: isActive ? C.accent : C.textSoft,
            fontSize: 13.5, fontWeight: isActive ? 600 : 500,
          })}>
            <item.icon size={16} strokeWidth={2} />
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.to === "/alerts" && alertCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: C.surface, backgroundColor: C.accent, borderRadius: 999, padding: "1px 6px", minWidth: 16, textAlign: "center" }}>{alertCount}</span>
            )}
          </NavLink>
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
