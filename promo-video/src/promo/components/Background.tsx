import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";

/**
 * Deep Cyber Navy background with flowing electric blue laser streaks,
 * ambient cyan bloom, and reflective floor horizon matching the 3D brand banner.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;

  const cyanX = 30 + Math.sin(t * 0.3) * 8;
  const cyanY = 28 + Math.cos(t * 0.25) * 6;
  const blueX = 72 + Math.cos(t * 0.28) * 8;
  const blueY = 65 + Math.sin(t * 0.32) * 6;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      {/* Deep Cyber Radial Glows */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${cyanX}% ${cyanY}%, rgba(0,229,255,0.22) 0%, transparent 48%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${blueX}% ${blueY}%, rgba(0,102,255,0.25) 0%, rgba(255,153,51,0.08) 50%, transparent 60%)`,
        }}
      />

      {/* Futuristic Cyber Light Streaks / Curves across the bottom & sides */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
        viewBox="0 0 1920 1080"
        fill="none"
      >
        <defs>
          <linearGradient id="neonLaserGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00e5ff" stopOpacity="0" />
            <stop offset="25%" stopColor="#00e5ff" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.9" />
            <stop offset="75%" stopColor="#0066ff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="saffronLaserGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff9933" stopOpacity="0" />
            <stop offset="50%" stopColor="#ff9933" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ff9933" stopOpacity="0" />
          </linearGradient>
          <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Lower cyber laser swoop (left to right) */}
        <path
          d={`M -200 820 Q 500 ${760 + Math.sin(t * 1.5) * 12} 1100 810 T 2120 ${790 + Math.cos(t * 1.5) * 12}`}
          stroke="url(#neonLaserGrad)"
          strokeWidth="3.5"
          filter="url(#neonGlow)"
          opacity="0.75"
        />
        <path
          d={`M -200 850 Q 600 ${810 + Math.cos(t * 1.2) * 14} 1300 840 T 2120 ${830 + Math.sin(t * 1.2) * 14}`}
          stroke="url(#neonLaserGrad)"
          strokeWidth="2"
          opacity="0.45"
        />

        {/* Subtle upper saffron beam accent */}
        <path
          d={`M 150 -50 Q 800 ${180 + Math.sin(t) * 10} 1850 60`}
          stroke="url(#saffronLaserGrad)"
          strokeWidth="1.5"
          opacity="0.35"
        />
      </svg>

      {/* Cyber Grid dot pattern */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(rgba(0,229,255,0.09) 1.2px, transparent 1.2px)",
          backgroundSize: "46px 46px",
          backgroundPosition: `${frame * 0.3}px ${frame * 0.15}px`,
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 78%)",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 78%)",
        }}
      />

      {/* Reflective floor horizon overlay */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, transparent 65%, rgba(0,102,255,0.08) 82%, rgba(0,229,255,0.12) 100%)",
        }}
      />

      {/* Subtle vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 60%, rgba(2,6,23,0.7) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
