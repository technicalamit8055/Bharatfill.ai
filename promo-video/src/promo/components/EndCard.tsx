import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "../theme";
import { CLAMP } from "../utils";
import { LogoPlate } from "./Brand";

const Burst: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const local = frame - start;
  if (local < 0) {
    return null;
  }
  const colors = [COLORS.saffron, "#ffffff", COLORS.indiaGreen, COLORS.indigoSoft];
  return (
    <>
      {new Array(28).fill(0).map((_, i) => {
        const angle = (i / 28) * Math.PI * 2 + random(`burst-a-${i}`) * 0.3;
        const distance = interpolate(local, [0, 32], [0, 260 + random(`burst-d-${i}`) * 240], {
          ...CLAMP,
          easing: Easing.out(Easing.cubic),
        });
        const size = 6 + random(`burst-s-${i}`) * 8;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: Math.cos(angle) * distance - size / 2,
              top: Math.sin(angle) * distance - size / 2,
              width: size,
              height: size,
              borderRadius: i % 3 === 0 ? 2 : "50%",
              background: colors[i % colors.length],
              opacity: interpolate(local, [0, 4, 32], [0, 1, 0], CLAMP),
            }}
          />
        );
      })}
    </>
  );
};

/** Pulsing logo plate, optional tagline and the glowing CTA pill. Frames are scene-local. */
export const EndCard: React.FC<{
  logoIn: number;
  ctaIn: number;
  cta: string;
  tagline?: string;
}> = ({ logoIn, ctaIn, cta, tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logo = spring({ frame: frame - logoIn, fps, config: { damping: 11, stiffness: 120 } });
  const pulseBlend = interpolate(frame, [logoIn + 18, logoIn + 30], [0, 1], CLAMP);
  const pulse = Math.sin((frame - logoIn) / 5);
  const taglineIn = spring({
    frame: frame - Math.round((logoIn + ctaIn) / 2),
    fps,
    config: { damping: 16, stiffness: 130 },
  });
  const ctaSpring = spring({ frame: frame - ctaIn, fps, config: { damping: 12, stiffness: 140 } });
  const shimmer = ((frame - ctaIn) % 45) / 45;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 40 }}>
      <div
        style={{
          position: "relative",
          opacity: Math.min(1, logo * 1.5),
          transform: `translateY(${(1 - logo) * 60}px) scale(${interpolate(logo, [0, 1], [0.5, 1]) * (1 + 0.025 * pulse * pulseBlend)})`,
        }}
      >
        {/* Soft glow pulses radiating from behind the logo — frameless. */}
        {[0, 1].map((n) => {
          const start = logoIn + 20 + n * 15;
          const p = interpolate((frame - start) % 30, [0, 30], [0, 1], CLAMP);
          return (
            <div
              key={n}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: `${70 + p * 50}%`,
                height: `${90 + p * 90}%`,
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                background: `radial-gradient(ellipse at center, transparent 45%, ${n === 0 ? COLORS.cyberBlue : COLORS.saffron} 70%, transparent 72%)`,
                filter: "blur(10px)",
                opacity: frame >= start ? (1 - p) * 0.35 : 0,
              }}
            />
          );
        })}
        <LogoPlate width={900} glow={logo * (0.75 + 0.25 * pulse * pulseBlend)} shine={0} />
      </div>

      {tagline ? (
        <div
          style={{
            marginTop: 52,
            fontSize: 40,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: -0.5,
            opacity: taglineIn,
            transform: `translateY(${(1 - taglineIn) * 26}px)`,
          }}
        >
          {tagline}
        </div>
      ) : null}

      <div
        style={{
          position: "relative",
          marginTop: tagline ? 44 : 70,
          opacity: Math.min(1, ctaSpring * 1.5),
          transform: `translateY(${(1 - ctaSpring) * 60}px) scale(${0.8 + 0.2 * ctaSpring})`,
        }}
      >
        <div style={{ position: "absolute", left: "50%", top: "50%" }}>
          <Burst start={ctaIn} />
        </div>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 22,
            padding: "30px 64px",
            borderRadius: 999,
            overflow: "hidden",
            background: "linear-gradient(100deg, #ff9933 0%, #ff7a45 32%, #0066ff 68%, #00e5ff 100%)",
            border: "1px solid rgba(255,255,255,0.45)",
            boxShadow: `0 0 ${40 + 22 * pulse}px rgba(0,229,255,0.6), 0 0 ${90 + 30 * pulse}px rgba(0,102,255,0.45)`,
            fontSize: 46,
            fontWeight: 800,
            color: "white",
            letterSpacing: -0.5,
          }}
        >
          {cta}
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${-25 + shimmer * 150}%`,
              width: "18%",
              transform: "skewX(-20deg)",
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
              opacity: frame >= ctaIn ? 1 : 0,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
