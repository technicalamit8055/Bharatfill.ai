import React from "react";

const SIZE = 46;
/** Where the arrow tip sits inside the SVG box, in px. */
const TIP = { x: (3 / 24) * SIZE, y: (2 / 24) * SIZE };

/** Mouse pointer whose tip is placed exactly at (x, y). */
export const Cursor: React.FC<{
  x: number;
  y: number;
  pressed: number;
  opacity: number;
}> = ({ x, y, pressed, opacity }) => (
  <svg
    width={SIZE}
    height={SIZE}
    viewBox="0 0 24 24"
    style={{
      position: "absolute",
      left: x - TIP.x,
      top: y - TIP.y,
      opacity,
      transform: `scale(${1 - 0.18 * pressed})`,
      transformOrigin: `${TIP.x}px ${TIP.y}px`,
      filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.5))",
      zIndex: 10,
    }}
  >
    <path
      d="M3 2l7.6 19.2 2.7-8.1 8.2-2.6z"
      fill="white"
      stroke="#0f172a"
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  </svg>
);
