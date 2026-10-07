import React from "react";
import { MarkIcon } from "./Brand";

export const TOPBAR = 60;

/** Dark browser window with traffic lights, URL pill and the pinned Bharatfill icon. */
export const BrowserChrome: React.FC<{
  width: number;
  height: number;
  url: string;
  children: React.ReactNode;
}> = ({ width, height, url, children }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 20,
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "0 50px 120px rgba(0,0,0,0.6), 0 0 80px rgba(99,102,241,0.18)",
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <div
      style={{
        height: TOPBAR,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "0 22px",
        background: "linear-gradient(#1e293b, #172033)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ display: "flex", gap: 9 }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: "50%", background: c }} />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          height: 36,
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 18px",
          fontSize: 17,
          color: "#cbd5e1",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#94a3b8">
          <path d="M6 10V8a6 6 0 1112 0v2h1a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V11a1 1 0 011-1zm2 0h8V8a4 4 0 10-8 0z" />
        </svg>
        {url}
      </div>
      <div style={{ borderRadius: 8, overflow: "hidden" }}>
        <MarkIcon size={30} />
      </div>
    </div>
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>{children}</div>
  </div>
);
