import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar, MobileNav, TopBar } from "./Nav";
import { DemoBanner } from "./States";
import { DEMO_MODE } from "../lib/config";
import { useAlerts } from "../lib/useApi";
import { C, FONT } from "../styles/tokens";

export default function Layout() {
  const { data: alerts } = useAlerts();
  const alertCount = alerts?.filter((a) => !a.is_read).length ?? 0;

  return (
    <div style={{ fontFamily: FONT, backgroundColor: C.bg, minHeight: "100vh", display: "flex", color: C.text }}>
      <Sidebar alertCount={alertCount} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar />
        <DemoBanner show={DEMO_MODE} />
        <div style={{ flex: 1, padding: "28px 20px 90px", overflowX: "hidden" }}>
          <div style={{ padding: "0 4px" }}>
            <Outlet />
          </div>
        </div>
      </div>
      <MobileNav alertCount={alertCount} />
    </div>
  );
}
