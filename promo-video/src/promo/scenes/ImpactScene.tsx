import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ASSETS, optionalAsset } from "../assets";
import { EndCard } from "../components/EndCard";
import {
  COLORS,
  FONT,
  GREEN_GRADIENT,
  INDIGO_GRADIENT,
  SAFFRON_GRADIENT,
  gradientText,
  glass,
} from "../theme";
import { IMPACT } from "../timeline";
import { CLAMP } from "../utils";

const BoltIcon: React.FC = () => (
  <svg width="44" height="44" viewBox="0 0 24 24">
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" fill={COLORS.saffron} />
  </svg>
);

const ShieldIcon: React.FC = () => (
  <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
    <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill={COLORS.green} />
    <path d="M8 12l3 3 5-6" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StatCard: React.FC<{
  delay: number;
  icon: React.ReactNode;
  accent: string;
  value: React.ReactNode;
  label: string;
  complete: number;
  exit: number;
}> = ({ delay, icon, accent, value, label, complete, exit }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120 } });

  return (
    <div style={{ perspective: 1400 }}>
      <div
        style={{
          ...glass,
          position: "relative",
          width: 640,
          height: 390,
          borderRadius: 36,
          padding: "40px 48px",
          overflow: "hidden",
          opacity: Math.min(1, enter * 1.6) * (1 - exit),
          transform: `translateY(${(1 - enter) * 90 - exit * 70}px) rotateX(${(1 - enter) * 22}deg) scale(${(0.85 + 0.15 * enter) * (1 - exit * 0.1)})`,
          boxShadow: `0 30px 80px rgba(2,6,23,0.55), 0 0 ${60 * complete}px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.08)`,
          filter: exit > 0 ? `blur(${exit * 10}px)` : undefined,
        }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 5, background: accent, opacity: 0.85 }} />
        {icon}
        <div style={{ fontSize: 190, fontWeight: 800, letterSpacing: -6, lineHeight: 1, marginTop: 16 }}>{value}</div>
        <div style={{ fontSize: 46, fontWeight: 700, color: COLORS.text, marginTop: 8 }}>{label}</div>
      </div>
    </div>
  );
};

export const ImpactScene: React.FC<{
  statOneValue: number;
  statOneSuffix: string;
  statOneLabel: string;
  statTwoBig: string;
  statTwoLabel: string;
  cta: string;
}> = ({ statOneValue, statOneSuffix, statOneLabel, statTwoBig, statTwoLabel, cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dashboard = optionalAsset(ASSETS.dashboard);

  const countEase = { ...CLAMP, easing: Easing.out(Easing.cubic) };
  const countUp = Math.round(interpolate(frame, [IMPACT.countStart, IMPACT.countEnd], [1, statOneValue], countEase));
  const countDown = Math.round(interpolate(frame, [IMPACT.countStart + 6, IMPACT.countEnd], [99, 0], countEase));
  const zeroPop = spring({ frame: frame - IMPACT.countEnd, fps, config: { damping: 9, stiffness: 200 } });
  const complete = interpolate(frame, [IMPACT.countEnd, IMPACT.countEnd + 8], [0, 1], CLAMP);
  const statsExit = interpolate(frame, [IMPACT.statsOut, IMPACT.statsOut + 14], [0, 1], {
    ...CLAMP,
    easing: Easing.in(Easing.cubic),
  });

  const second =
    frame >= IMPACT.countEnd ? (
      <span style={{ display: "inline-block", transform: `scale(${0.6 + 0.4 * zeroPop})`, ...gradientText(GREEN_GRADIENT) }}>
        {statTwoBig}
      </span>
    ) : (
      <span style={gradientText(INDIGO_GRADIENT)}>{countDown}</span>
    );

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      {dashboard ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", perspective: 1600 }}>
          <Img
            src={dashboard}
            style={{
              width: 1500,
              maxWidth: "none",
              borderRadius: 24,
              opacity: 0.14 * (1 - statsExit),
              transform: "rotateX(28deg) translateY(120px)",
              filter: "blur(2px)",
            }}
          />
        </AbsoluteFill>
      ) : null}

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 70 }}>
        <StatCard
          delay={4}
          icon={<BoltIcon />}
          accent={COLORS.saffron}
          value={
            <>
              <span style={gradientText(INDIGO_GRADIENT)}>{countUp}</span>
              <span style={{ ...gradientText(SAFFRON_GRADIENT), fontSize: 150 }}>{statOneSuffix}</span>
            </>
          }
          label={statOneLabel}
          complete={complete}
          exit={statsExit}
        />
        <StatCard
          delay={12}
          icon={<ShieldIcon />}
          accent={COLORS.green}
          value={second}
          label={statTwoLabel}
          complete={complete}
          exit={statsExit}
        />
      </AbsoluteFill>

      <EndCard logoIn={IMPACT.logoIn} ctaIn={IMPACT.ctaIn} cta={cta} />
    </AbsoluteFill>
  );
};
