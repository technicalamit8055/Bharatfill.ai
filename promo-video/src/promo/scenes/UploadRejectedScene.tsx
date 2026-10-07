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
import { DocThumb, type DocKind } from "../components/DocThumbs";
import { SlamWord, slamKicks } from "../components/SlamWord";
import { REJECTED } from "../docs-timeline";
import { COLORS, FONT, MONO, glass } from "../theme";
import { CLAMP, shake, splitWords } from "../utils";

/* The kind of messages portals show when an upload is outside their rules. */
const ERRORS: { kind: DocKind; file: string; size: string; message: string }[] = [
  { kind: "photo", file: "photo.png", size: "2.4 MB", message: "File size must be between 20 KB and 50 KB" },
  { kind: "signature", file: "signature.jpg", size: "850 KB", message: "Dimension is not correct — must be 6 cm × 2 cm" },
  { kind: "pdf", file: "aadhaar.pdf", size: "1.2 MB", message: "PDF must be smaller than 200 KB" },
];

const HEADLINE_SIZE = 92;

export const UploadRejectedScene: React.FC<{ lineOne: string; lineTwo: string; stamp: string }> = ({
  lineOne,
  lineTwo,
  stamp,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lines = [
    { words: splitWords(lineOne), start: 6, step: 6 },
    { words: splitWords(lineTwo), start: 22, step: 5 },
  ];

  const errorIndex = Math.min(
    ERRORS.length - 1,
    Math.max(0, Math.floor((frame - REJECTED.boxIn) / REJECTED.errorStep)),
  );
  const error = ERRORS[errorIndex];
  const switchFrames = ERRORS.map((_, i) => REJECTED.boxIn + i * REJECTED.errorStep);
  const sinceSwitch = frame - switchFrames[errorIndex];

  const boxIn = spring({ frame: frame - REJECTED.boxIn, fps, config: { damping: 13, stiffness: 160 } });
  const stampIn = spring({ frame: frame - REJECTED.stamp, fps, config: { damping: 10, stiffness: 220, mass: 0.7 } });
  const exit = interpolate(frame, [104, 120], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });

  const kicks = slamKicks(frame, [
    ...lines.flatMap((line) => line.words.map((_, i) => ({ at: line.start + i * line.step, strength: 8 }))),
    ...switchFrames.map((at) => ({ at, strength: 12 })),
    { at: REJECTED.stamp, strength: 30 },
  ]);
  const rumble = interpolate(frame, [60, 100, 112], [0, 6, 0], CLAMP);
  const offset = shake(frame, kicks + rumble, "rejected");
  const jolt = Math.sin(sinceSwitch * 2.4) * 16 * Math.exp(-sinceSwitch / 5);
  const glitching = sinceSwitch >= 0 && sinceSwitch < 4;
  const split = glitching ? 6 + random(`rej-split-${frame}`) * 10 : 0;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity: 0.5 * (1 - exit) }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 62%, rgba(244,63,94,${0.08 + (glitching ? 0.12 : 0) + stampIn * 0.08}), transparent 55%)`,
        }}
      />

      <AbsoluteFill
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${1 + exit * 0.3})`,
          opacity: 1 - exit,
          filter: exit > 0 ? `blur(${exit * 16}px)` : undefined,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 130,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          {lines.map((line, li) => (
            <div key={li} style={{ display: "flex", justifyContent: "center" }}>
              {line.words.map((word, wi) => (
                <SlamWord
                  key={`${word}-${wi}`}
                  text={word}
                  start={line.start + wi * line.step}
                  size={HEADLINE_SIZE}
                  heavy={false}
                  // Emphasise the tail of each line: "big?", "wrong size?".
                  highlight={wi >= line.words.length - (li === 0 ? 1 : 2)}
                />
              ))}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            left: 960 - 470,
            top: 520,
            width: 940,
            opacity: Math.min(1, boxIn * 1.5),
            transform: `translate(${jolt}px, ${(1 - boxIn) * 80}px) scale(${0.9 + 0.1 * boxIn})`,
            filter: split > 0 ? `drop-shadow(${split}px 0 0 rgba(255,45,85,0.8)) drop-shadow(${-split}px 0 0 rgba(0,229,255,0.8))` : undefined,
          }}
        >
          <div style={{ ...glass, borderRadius: 28, padding: 30, border: `2px solid ${COLORS.error}`, boxShadow: "0 0 50px rgba(244,63,94,0.35), 0 30px 80px rgba(2,6,23,0.55)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
              <div style={{ width: 104, height: 128, borderRadius: 12, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
                <DocThumb kind={error.kind} width={error.kind === "signature" ? 104 : 96} height={error.kind === "signature" ? 52 : 120} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.muted, letterSpacing: 1.6 }}>UPLOAD DOCUMENT</div>
                <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: COLORS.text, marginTop: 8 }}>
                  {error.file} <span style={{ color: COLORS.error }}>· {error.size}</span>
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 24,
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "16px 20px",
                borderRadius: 14,
                background: "rgba(244,63,94,0.14)",
                color: "#fda4af",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24">
                <path d="M12 2L1 21h22z" fill={COLORS.error} />
                <path d="M12 9v5M12 17.5v.5" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              {error.message}
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              right: -30,
              top: -46,
              padding: "10px 30px",
              border: `6px solid ${COLORS.error}`,
              borderRadius: 14,
              color: COLORS.error,
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: 6,
              background: "rgba(10,15,29,0.75)",
              opacity: frame >= REJECTED.stamp ? 1 : 0,
              transform: `rotate(-12deg) scale(${interpolate(stampIn, [0, 1], [2.6, 1])})`,
              boxShadow: "0 0 40px rgba(244,63,94,0.5)",
            }}
          >
            {stamp}
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 4px)",
          opacity: glitching ? 1 : 0.5,
        }}
      />
    </AbsoluteFill>
  );
};
