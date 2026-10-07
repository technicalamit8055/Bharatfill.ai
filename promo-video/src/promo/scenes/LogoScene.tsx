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
import { LogoPlate } from "../components/Brand";
import { COLORS, SAFFRON_GRADIENT, TRICOLOR_GRADIENT, gradientText } from "../theme";
import { CLAMP, splitWords } from "../utils";

const CENTER_Y = "40%";
const RING_COLORS = [COLORS.cyberBlue, COLORS.saffron, "#ffffff"];

const Particles: React.FC<{ opacity: number }> = ({ opacity }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity }}>
      {new Array(40).fill(0).map((_, i) => {
        const speed = 0.8 + random(`p-speed-${i}`) * 1.8;
        const y = 1100 - ((frame * speed * 2 + random(`p-y-${i}`) * 1150) % 1150);
        const size = 2 + random(`p-size-${i}`) * 4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: random(`p-x-${i}`) * 1920,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              color: random(`p-c-${i}`) > 0.5 ? COLORS.cyberBlue : COLORS.saffron,
              background: "currentColor",
              opacity: 0.25 + random(`p-o-${i}`) * 0.5,
              boxShadow: `0 0 ${size * 3}px currentColor`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const LogoScene: React.FC<{ tagline: string }> = ({ tagline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame: frame - 2, fps, config: { damping: 11, stiffness: 110, mass: 0.9 } });
  const glow = interpolate(frame, [8, 40], [0, 1], CLAMP) * (0.8 + 0.2 * Math.sin(frame / 7));
  const shine = interpolate(frame, [34, 62], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
  const exit = interpolate(frame, [134, 150], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });
  const float = Math.sin(frame / 18) * 6;
  const raysOpacity = interpolate(frame, [6, 30], [0, 1], CLAMP) * (1 - exit);
  const underline = interpolate(frame, [66, 92], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });

  const words = splitWords(tagline);

  return (
    <AbsoluteFill>
      {/* Radiant glow: rotating rays and a soft halo behind the plate. */}
      <AbsoluteFill
        style={{
          opacity: raysOpacity,
          background: `repeating-conic-gradient(from ${frame * 0.5}deg at 50% ${CENTER_Y}, rgba(255,255,255,0.07) 0deg 5deg, transparent 5deg 15deg)`,
          WebkitMaskImage: `radial-gradient(circle at 50% ${CENTER_Y}, black 0%, transparent 62%)`,
          maskImage: `radial-gradient(circle at 50% ${CENTER_Y}, black 0%, transparent 62%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: glow * (1 - exit),
          background: `radial-gradient(circle at 50% ${CENTER_Y}, rgba(0,229,255,0.38) 0%, rgba(0,102,255,0.22) 28%, rgba(255,153,51,0.12) 52%, transparent 68%)`,
        }}
      />

      {RING_COLORS.map((color, i) => {
        const p = interpolate(frame - i * 7, [0, 45], [0, 1], { ...CLAMP, easing: Easing.out(Easing.cubic) });
        const size = p * 1700;
        return (
          <div
            key={color}
            style={{
              position: "absolute",
              left: 960 - size / 2,
              top: `calc(${CENTER_Y} - ${size / 2}px)`,
              width: size,
              height: size,
              borderRadius: "50%",
              border: `2px solid ${color}`,
              opacity: frame >= i * 7 ? (1 - p) * 0.6 : 0,
            }}
          />
        );
      })}

      <Particles opacity={interpolate(frame, [10, 40], [0, 1], CLAMP) * (1 - exit)} />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 90,
          opacity: 1 - exit,
          transform: `scale(${1 - exit * 0.08})`,
          filter: exit > 0 ? `blur(${exit * 14}px)` : undefined,
        }}
      >
        <div style={{ perspective: 1600 }}>
          <div
            style={{
              opacity: interpolate(frame, [2, 10], [0, 1], CLAMP),
              transform: `translateY(${(1 - enter) * 80 + float}px) rotateX(${(1 - enter) * 40}deg) scale(${interpolate(enter, [0, 1], [0.35, 1])})`,
            }}
          >
            <LogoPlate width={1020} glow={glow} shine={shine} />
          </div>
        </div>

        <div
          style={{
            marginTop: 72,
            maxWidth: 1760,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0 18px",
          }}
        >
          {words.map((word, i) => {
            const s = spring({ frame: frame - 46 - i * 3, fps, config: { damping: 16, stiffness: 130 } });
            return (
              <span
                key={`${word}-${i}`}
                style={{
                  display: "inline-block",
                  fontSize: 56,
                  fontWeight: 700,
                  letterSpacing: -0.5,
                  opacity: s,
                  transform: `translateY(${(1 - s) * 32}px)`,
                  filter: s < 0.98 ? `blur(${(1 - s) * 10}px)` : undefined,
                  ...(word === "AI" ? gradientText(SAFFRON_GRADIENT) : { color: COLORS.text }),
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 26,
            width: 380 * underline,
            height: 5,
            borderRadius: 3,
            background: TRICOLOR_GRADIENT,
            boxShadow: "0 0 20px rgba(255,153,51,0.5)",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
