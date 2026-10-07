import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlusJakartaSans";
import type { CSSProperties } from "react";

export const { fontFamily: FONT } = loadDisplay("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

export const { fontFamily: MONO } = loadMono("normal", {
  weights: ["500", "700"],
  subsets: ["latin"],
});

export const COLORS = {
  bg: "#030714",
  cyberBlue: "#00e5ff",
  electricBlue: "#0066ff",
  indigo: "#6366f1",
  indigoSoft: "#818cf8",
  saffron: "#ff9933",
  green: "#22c55e",
  indiaGreen: "#138808",
  error: "#f43f5e",
  text: "#f8fafc",
  muted: "#94a3b8",
  glassBorder: "rgba(255,255,255,0.12)",
} as const;

export const CYBER_GRADIENT =
  "linear-gradient(135deg, #ffffff 0%, #00e5ff 40%, #0066ff 100%)";
export const SAFFRON_GRADIENT =
  "linear-gradient(100deg, #ffc27a 0%, #ff9933 45%, #ffd9a8 100%)";
export const INDIGO_GRADIENT =
  "linear-gradient(180deg, #ffffff 0%, #c7d2fe 55%, #818cf8 100%)";
export const GREEN_GRADIENT =
  "linear-gradient(180deg, #ffffff 0%, #bbf7d0 50%, #22c55e 100%)";
export const TRICOLOR_GRADIENT = `linear-gradient(90deg, ${COLORS.saffron} 0 33%, #ffffff 33% 66%, ${COLORS.indiaGreen} 66% 100%)`;

export const gradientText = (gradient: string): CSSProperties => ({
  backgroundImage: gradient,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
});

/** Frosted dark glass used for every floating card. */
export const glass: CSSProperties = {
  background:
    "linear-gradient(150deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02))",
  border: `1px solid ${COLORS.glassBorder}`,
  boxShadow:
    "0 30px 80px rgba(2,6,23,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
  backdropFilter: "blur(16px)",
};
