import React from "react";
import { MONO } from "../theme";

/*
 * Drawn stand-ins for a customer's photo, signature and Aadhaar PDF. All fake:
 * a silhouette, a scribble, and a page with placeholder lines.
 */

export type DocKind = "photo" | "signature" | "pdf";

const PhotoThumb: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  // Several thumbs share the page, so each gradient needs its own id.
  const gradientId = `photo-bg-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg width={width} height={height} viewBox="0 0 140 180" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#bfdbfe" />
        </linearGradient>
      </defs>
      <rect width="140" height="180" fill={`url(#${gradientId})`} />
      <circle cx="70" cy="72" r="30" fill="#64748b" />
      <path d="M12 180c4-44 28-66 58-66s54 22 58 66z" fill="#475569" />
    </svg>
  );
};

/** `paper` is the scan around the signature; a raw scan has wide grey margins. */
const SignatureThumb: React.FC<{ width: number; height: number; paper: string }> = ({
  width,
  height,
  paper,
}) => (
  <div style={{ width, height, background: paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg width="88%" height="80%" viewBox="0 0 280 100">
      <path
        d="M14 66 C 26 18, 46 16, 42 50 C 39 72, 28 78, 34 58 C 42 34, 68 30, 72 56 C 74 70, 82 70, 90 50 C 96 38, 102 40, 102 56 C 102 66, 110 66, 118 52 C 126 38, 132 44, 130 58 C 129 66, 138 64, 148 48 C 158 32, 166 36, 164 54 C 163 66, 174 62, 184 46 C 192 34, 202 40, 198 58 C 196 70, 212 64, 224 48 C 234 36, 244 42, 242 56 M 36 84 C 104 78, 184 76, 266 70"
        fill="none"
        stroke="#1d4ed8"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

const PdfPage: React.FC<{ offset: number }> = ({ offset }) => (
  <g transform={`translate(${offset} ${offset})`}>
    <path d="M8 4h76l24 24v128a4 4 0 01-4 4H8a4 4 0 01-4-4V8a4 4 0 014-4z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />
    <path d="M84 4v20a4 4 0 004 4h20" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="2" />
  </g>
);

const PdfThumb: React.FC<{ width: number; height: number }> = ({ width, height }) => (
  <svg width={width} height={height} viewBox="0 0 124 176">
    <PdfPage offset={12} />
    <PdfPage offset={0} />
    <rect x="16" y="40" width="80" height="50" rx="6" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="1.5" />
    <circle cx="34" cy="62" r="9" fill="#94a3b8" />
    <path d="M22 84c2-9 7-13 12-13s10 4 12 13z" fill="#94a3b8" />
    <rect x="52" y="54" width="36" height="5" rx="2.5" fill="#94a3b8" />
    <rect x="52" y="65" width="28" height="5" rx="2.5" fill="#cbd5e1" />
    {[102, 114, 126].map((y) => (
      <rect key={y} x="16" y={y} width={y === 126 ? 52 : 80} height="5" rx="2.5" fill="#e2e8f0" />
    ))}
    <rect x="62" y="140" width="40" height="22" rx="5" fill="#ef4444" />
    <text x="82" y="156" textAnchor="middle" fontFamily={MONO} fontSize="13" fontWeight="700" fill="white">
      PDF
    </text>
  </svg>
);

/** Renders the right stand-in for a document kind at any size. */
export const DocThumb: React.FC<{
  kind: DocKind;
  width: number;
  height: number;
  /** Signature only: the scan's paper colour. */
  paper?: string;
}> = ({ kind, width, height, paper = "#ffffff" }) => {
  if (kind === "photo") {
    return <PhotoThumb width={width} height={height} />;
  }
  if (kind === "signature") {
    return <SignatureThumb width={width} height={height} paper={paper} />;
  }
  return <PdfThumb width={width} height={height} />;
};
