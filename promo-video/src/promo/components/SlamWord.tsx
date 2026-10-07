import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, SAFFRON_GRADIENT, gradientText } from "../theme";
import { CLAMP } from "../utils";

/** A word that slams in from oversized and blurred. `heavy` hits harder. */
export const SlamWord: React.FC<{
  text: string;
  start: number;
  size: number;
  heavy: boolean;
  highlight: boolean;
}> = ({ text, start, size, heavy, highlight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - start, fps, config: { damping: 13, stiffness: 200, mass: 0.6 } });
  const scale = interpolate(s, [0, 1], [heavy ? 2.3 : 1.7, 1]);
  const blur = interpolate(s, [0, 1], [14, 0], CLAMP);
  const opacity = interpolate(frame - start, [0, 3], [0, 1], CLAMP);

  return (
    <span
      style={{
        display: "inline-block",
        margin: `0 ${size * 0.12}px`,
        fontSize: size,
        fontWeight: 800,
        letterSpacing: -size * 0.025,
        lineHeight: 1.08,
        opacity,
        transform: `scale(${scale})`,
        filter: blur > 0.1 ? `blur(${blur}px)` : undefined,
        ...(highlight ? gradientText(SAFFRON_GRADIENT) : { color: COLORS.text }),
      }}
    >
      {text}
    </span>
  );
};

/** Sum of decaying camera kicks, one per slam. */
export const slamKicks = (frame: number, starts: { at: number; strength: number }[]): number =>
  starts.reduce((sum, { at, strength }) => {
    const age = frame - at;
    return age >= 0 ? sum + strength * Math.exp(-age / 2.5) : sum;
  }, 0);
