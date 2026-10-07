import React from "react";
import { random } from "remotion";
import { COLORS, FONT, MONO, TRICOLOR_GRADIENT } from "../theme";

/*
 * A generic, clearly fake identity card. No government emblem, no real photo,
 * and the number is masked the way the product shows it by default.
 */

export const ID_CARD = { width: 760, height: 480 } as const;

type Box = { x: number; y: number; w: number; h: number };

/** Value boxes in card pixels; the scanner highlights these as the laser passes. */
export const ID_CARD_FIELDS = {
  name: { x: 196, y: 108, w: 372, h: 64 },
  father: { x: 196, y: 180, w: 372, h: 64 },
  dob: { x: 196, y: 252, w: 372, h: 64 },
  id: { x: 24, y: 330, w: 452, h: 70 },
} satisfies Record<string, Box>;

export type IdCardField = keyof typeof ID_CARD_FIELDS;

export const rowCenter = (field: IdCardField): number =>
  ID_CARD_FIELDS[field].y + ID_CARD_FIELDS[field].h / 2;

const SAMPLE = {
  name: "Rahul Sharma",
  father: "Suresh Sharma",
  dob: "14 / 08 / 1996",
  id: "XXXX XXXX 4821",
};

const LABELS: Record<IdCardField, string> = {
  name: "NAME",
  father: "FATHER'S NAME",
  dob: "DATE OF BIRTH",
  id: "ID NUMBER",
};

const Silhouette: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => (
  <svg width={width} height={height} viewBox="0 0 146 200">
    <rect width="146" height="200" rx="14" fill="#e2e8f0" />
    <circle cx="73" cy="78" r="34" fill="#94a3b8" />
    <path d="M14 200c4-46 28-70 59-70s55 24 59 70z" fill="#94a3b8" />
  </svg>
);

const QR_CELLS = 21;
const isFinder = (r: number, c: number) => {
  const inBox = (r0: number, c0: number) =>
    r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
  return inBox(0, 0) || inBox(0, QR_CELLS - 7) || inBox(QR_CELLS - 7, 0);
};
const finderFill = (r: number, c: number) => {
  const local = (v: number) => (v >= QR_CELLS - 7 ? v - (QR_CELLS - 7) : v);
  const lr = local(r);
  const lc = local(c);
  const ring = lr === 0 || lr === 6 || lc === 0 || lc === 6;
  const core = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
  return ring || core;
};

const QrPattern: React.FC<{ size: number }> = ({ size }) => {
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < QR_CELLS; r++) {
    for (let c = 0; c < QR_CELLS; c++) {
      const on = isFinder(r, c)
        ? finderFill(r, c)
        : random(`qr-${r}-${c}`) > 0.52;
      if (on) {
        cells.push(
          <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} />,
        );
      }
    }
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${QR_CELLS} ${QR_CELLS}`}
      shapeRendering="crispEdges"
    >
      <g fill="#1e293b">{cells}</g>
    </svg>
  );
};

const cardShell: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: 24,
  overflow: "hidden",
  fontFamily: FONT,
  boxShadow:
    "0 40px 90px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.35) inset",
};

const Watermark: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{
      position: "absolute",
      left: "50%",
      top: "52%",
      transform: "translate(-50%, -50%) rotate(-18deg)",
      fontSize: 150,
      fontWeight: 800,
      letterSpacing: 12,
      color,
      pointerEvents: "none",
    }}
  >
    SAMPLE
  </div>
);

export const SampleIdCard: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      ...cardShell,
      background:
        "linear-gradient(135deg, #ffffff 0%, #f3f6ff 55%, #e7edff 100%)",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage:
          "repeating-radial-gradient(circle at 85% 20%, rgba(99,102,241,0.05) 0 2px, transparent 2px 14px)",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: 8,
        background: TRICOLOR_GRADIENT,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 30,
        top: 28,
        width: 50,
        height: 50,
        borderRadius: 14,
        background: `linear-gradient(135deg, ${COLORS.indigoSoft}, #3b5bff)`,
        color: "white",
        fontSize: 19,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      ID
    </div>
    <div style={{ position: "absolute", left: 96, top: 28 }}>
      <div
        style={{
          fontSize: 25,
          fontWeight: 800,
          color: "#1e293b",
          letterSpacing: 0.5,
        }}
      >
        IDENTITY CARD
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#64748b",
          letterSpacing: 2.4,
          marginTop: 4,
        }}
      >
        SAMPLE · NOT A REAL DOCUMENT
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 30,
        right: 30,
        top: 96,
        height: 1,
        background: "#dbe2f0",
      }}
    />
    <div style={{ position: "absolute", left: 30, top: 110 }}>
      <Silhouette width={146} height={200} />
    </div>
    {(["name", "father", "dob"] as const).map((field) => {
      const box = ID_CARD_FIELDS[field];
      return (
        <div
          key={field}
          style={{ position: "absolute", left: box.x + 14, top: box.y + 8 }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#64748b",
              letterSpacing: 1.8,
            }}
          >
            {LABELS[field]}
          </div>
          <div
            style={{
              fontSize: 27,
              fontWeight: 700,
              color: "#0f172a",
              marginTop: 2,
            }}
          >
            {SAMPLE[field]}
          </div>
        </div>
      );
    })}
    <div style={{ position: "absolute", left: 598, top: 112 }}>
      <QrPattern size={132} />
    </div>
    <div
      style={{
        position: "absolute",
        left: ID_CARD_FIELDS.id.x + 16,
        top: ID_CARD_FIELDS.id.y + 8,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#64748b",
          letterSpacing: 1.8,
        }}
      >
        {LABELS.id}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 34,
          fontWeight: 700,
          color: "#0f172a",
          letterSpacing: 3,
        }}
      >
        {SAMPLE.id}
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 56,
        background: "linear-gradient(90deg, #e0e7ff, #eef2ff)",
        borderTop: "1px solid #c7d2fe",
        display: "flex",
        alignItems: "center",
        paddingLeft: 30,
        fontSize: 13,
        fontWeight: 600,
        color: "#4f46e5",
        letterSpacing: 0.6,
      }}
    >
      Demonstration card for Bharatfill.ai — not a valid identity document
    </div>
    <Watermark color="rgba(99,102,241,0.07)" />
    {children}
  </div>
);

/** A second fake card that sits behind the ID card for depth. */
export const SampleTaxCard: React.FC = () => (
  <div
    style={{
      ...cardShell,
      background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 60%, #a5c8fb 100%)",
    }}
  >
    <div style={{ position: "absolute", left: 34, top: 30 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#1e3a8a" }}>
        TAX ID CARD
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#1d4ed8",
          letterSpacing: 2.4,
          marginTop: 4,
        }}
      >
        SAMPLE · NOT A REAL DOCUMENT
      </div>
    </div>
    <div style={{ position: "absolute", left: 34, top: 150 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#1e40af",
          letterSpacing: 1.8,
        }}
      >
        NAME
      </div>
      <div style={{ fontSize: 27, fontWeight: 700, color: "#0f172a" }}>
        RAHUL SHARMA
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#1e40af",
          letterSpacing: 1.8,
          marginTop: 26,
        }}
      >
        ACCOUNT NUMBER
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 36,
          fontWeight: 700,
          color: "#0f172a",
          letterSpacing: 4,
        }}
      >
        ABCDE1234F
      </div>
    </div>
    <div style={{ position: "absolute", right: 40, top: 120 }}>
      <Silhouette width={130} height={178} />
    </div>
    <Watermark color="rgba(30,64,175,0.08)" />
  </div>
);
