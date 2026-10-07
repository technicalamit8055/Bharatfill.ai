import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { SWEEP_LEAD, SWEEP_LENGTH } from "../timeline";
import { CLAMP } from "../utils";

/** A diagonal band of light that crosses the frame and hides the scene cut. */
export const SweepTransition: React.FC = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, SWEEP_LENGTH - 2], [-40, 140], {
    ...CLAMP,
    easing: Easing.inOut(Easing.cubic),
  });
  const flash = interpolate(
    frame,
    [SWEEP_LEAD - 4, SWEEP_LEAD, SWEEP_LEAD + 6],
    [0, 0.2, 0],
    CLAMP,
  );

  const band: React.CSSProperties = {
    position: "absolute",
    top: "-50%",
    height: "200%",
    left: `${x}%`,
    transform: "translateX(-50%) rotate(16deg)",
    mixBlendMode: "screen",
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          ...band,
          width: "30%",
          background:
            "linear-gradient(90deg, transparent, rgba(99,102,241,0.55) 30%, rgba(255,255,255,0.9) 50%, rgba(255,153,51,0.55) 70%, transparent)",
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          ...band,
          width: "0.5%",
          background: "rgba(255,255,255,0.95)",
          filter: "blur(4px)",
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "white", opacity: flash }} />
    </AbsoluteFill>
  );
};
