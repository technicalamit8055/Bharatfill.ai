import React from "react";
import { interpolate } from "remotion";
import { COLORS } from "../theme";
import { CLAMP } from "../utils";

const PATH_LENGTH = 20;

/** Green disc that pops in, then draws its tick. `progress` is a 0→1 spring. */
export const Checkmark: React.FC<{
  progress: number;
  size?: number;
  color?: string;
}> = ({ progress, size = 28, color = COLORS.green }) => {
  const draw = interpolate(progress, [0.35, 1], [0, 1], CLAMP);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      style={{
        flexShrink: 0,
        transform: `scale(${Math.max(0, progress)})`,
        filter: `drop-shadow(0 0 ${size / 4}px ${color}99)`,
      }}
    >
      <circle cx="16" cy="16" r="16" fill={color} />
      <path
        d="M9 16.5l4.5 4.5L23 11.5"
        fill="none"
        stroke="white"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={PATH_LENGTH}
        strokeDashoffset={PATH_LENGTH * (1 - draw)}
      />
    </svg>
  );
};
