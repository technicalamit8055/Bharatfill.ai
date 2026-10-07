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
import { SlamWord } from "../components/SlamWord";
import { COLORS, MONO } from "../theme";
import { CLAMP, shake, splitWords } from "../utils";

/* ---------- Background: form inputs stuck in a type → error → retype loop ---------- */

type LoopField = {
  label: string;
  value: string;
  error: string;
  x: number;
  y: number;
  rotate: number;
  scale: number;
  appear: number;
  phase: number;
  far: boolean;
};

const FIELDS: LoopField[] = [
  { label: "Father's Name", value: "Suresh Sharma", error: "Spelling does not match", x: 90, y: 80, rotate: -5, scale: 1, appear: 0, phase: 0, far: false },
  { label: "Date of Birth", value: "14/08/1996", error: "Invalid date format", x: 1420, y: 100, rotate: 4, scale: 0.95, appear: 4, phase: 13, far: false },
  { label: "Aadhaar Number", value: "XXXX XXXX 4821", error: "Number does not match", x: 110, y: 820, rotate: 3, scale: 0.95, appear: 8, phase: 25, far: false },
  { label: "Mobile Number", value: "98765 43210", error: "Required field", x: 1400, y: 840, rotate: -4, scale: 1, appear: 12, phase: 6, far: false },
  // Second wave: the repetition multiplies.
  { label: "Pin Code", value: "80000", error: "Enter 6 digits", x: 770, y: 30, rotate: -2, scale: 0.8, appear: 52, phase: 19, far: true },
  { label: "Full Name", value: "Rahul Sharma", error: "Name mismatch", x: 760, y: 930, rotate: 2, scale: 0.8, appear: 58, phase: 31, far: true },
  { label: "Category", value: "General", error: "Select a value", x: 20, y: 480, rotate: -7, scale: 0.72, appear: 64, phase: 9, far: true },
  { label: "Email", value: "rahul@example", error: "Invalid email", x: 1560, y: 470, rotate: 6, scale: 0.72, appear: 70, phase: 22, far: true },
];

const CYCLE = 44;
const TYPE_END = 22;
const ERROR_START = 24;
const ERROR_END = 39;

const ErrorIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 20 20">
    <circle cx="10" cy="10" r="10" fill={COLORS.error} />
    <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const LoopingInput: React.FC<{ field: LoopField; time: number; exit: number }> = ({
  field,
  time,
  exit,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const local = (((time + field.phase) % CYCLE) + CYCLE) % CYCLE;
  const len = field.value.length;
  const chars =
    local < TYPE_END
      ? Math.floor((len * local) / TYPE_END)
      : local < ERROR_END
        ? len
        : Math.round(len * (1 - (local - ERROR_END) / (CYCLE - ERROR_END)));
  const hasError = local >= ERROR_START && local < ERROR_END;
  const errorAge = local - ERROR_START;
  const jolt = hasError ? Math.sin(errorAge * 2.4) * 10 * Math.exp(-errorAge / 5) : 0;
  const caretOn = local < TYPE_END || Math.floor(frame / 6) % 2 === 0;

  const enter = spring({ frame: frame - field.appear, fps, config: { damping: 14, stiffness: 140 } });
  const opacity = interpolate(enter, [0, 1], [0, field.far ? 0.42 : 0.72]) * (1 - exit);

  return (
    <div
      style={{
        position: "absolute",
        left: field.x,
        top: field.y,
        width: 380,
        opacity,
        transform: `translateX(${jolt}px) rotate(${field.rotate}deg) scale(${field.scale * (0.8 + 0.2 * enter) * (1 + exit * 0.4)})`,
        filter: field.far ? "blur(1.5px)" : undefined,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.muted, marginBottom: 8 }}>
        {field.label}
      </div>
      <div
        style={{
          height: 58,
          borderRadius: 12,
          border: `2px solid ${hasError ? COLORS.error : "rgba(255,255,255,0.14)"}`,
          background: hasError ? "rgba(244,63,94,0.12)" : "rgba(255,255,255,0.04)",
          boxShadow: hasError ? "0 0 30px rgba(244,63,94,0.35)" : "none",
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          fontFamily: MONO,
          fontSize: 24,
          color: COLORS.text,
        }}
      >
        {field.value.slice(0, chars)}
        <span
          style={{
            width: 2,
            height: 28,
            marginLeft: 3,
            background: COLORS.text,
            opacity: caretOn ? 1 : 0,
          }}
        />
      </div>
      <div
        style={{
          height: 30,
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 17,
          fontWeight: 600,
          color: COLORS.error,
          opacity: hasError ? 1 : 0,
        }}
      >
        <ErrorIcon />
        {field.error}
      </div>
    </div>
  );
};

/* ---------- Headline: slamming words with shake and glitch ---------- */

type Line = { words: string[]; start: number; step: number; size: number; heavy: boolean };

const Headline: React.FC<{ lines: Line[] }> = ({ lines }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
    {lines.map((line, li) => (
      <div key={li} style={{ display: "flex", justifyContent: "center" }}>
        {line.words.map((word, wi) => (
          <SlamWord
            key={`${word}-${wi}`}
            text={word}
            start={line.start + wi * line.step}
            size={line.size}
            heavy={line.heavy}
            // The last two words of the middle line carry the emphasis ("government forms").
            highlight={li === 1 && wi >= line.words.length - 2}
          />
        ))}
      </div>
    ))}
  </div>
);

const GLITCH_BURSTS: [number, number][] = [
  [47, 50],
  [69, 72],
  [80, 84],
  [92, 99],
  [108, 112],
  [119, 131],
];

export const ProblemScene: React.FC<{ lead: string; middle: string; repeat: string }> = ({
  lead,
  middle,
  repeat,
}) => {
  const frame = useCurrentFrame();

  const lines: Line[] = [
    { words: splitWords(lead), start: 4, step: 6, size: 92, heavy: false },
    { words: splitWords(middle), start: 24, step: 5, size: 92, heavy: false },
    { words: splitWords(repeat), start: 60, step: 10, size: 132, heavy: true },
  ];

  // The loops speed up as the frustration builds.
  const loopTime = frame + Math.max(0, frame - 60) * 0.7;

  // Shake: a rising rumble plus a kick every time a word slams in.
  const rumble = interpolate(frame, [50, 95, 125, 140], [0, 5, 12, 0], CLAMP);
  const kicks = lines.reduce((sum, line) => {
    return (
      sum +
      line.words.reduce((acc, _w, i) => {
        const age = frame - (line.start + i * line.step);
        return age >= 0 ? acc + (line.heavy ? 22 : 8) * Math.exp(-age / 2.5) : acc;
      }, 0)
    );
  }, 0);
  const offset = shake(frame, rumble + kicks, "problem");

  const glitching = GLITCH_BURSTS.some(([a, b]) => frame >= a && frame <= b);
  const split = glitching ? 5 + random(`split-${frame}`) * 12 : 0;

  const exit = interpolate(frame, [132, 150], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });
  const echoOpacity = interpolate(frame, [86, 96], [0, 1], CLAMP) * (1 - exit);

  const headlineLayer = (clip?: string, dx = 0) => (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        clipPath: clip,
        transform: `translate(${offset.x + dx}px, ${offset.y - 20}px) scale(${1 + exit * 0.35})`,
        opacity: 1 - exit,
        filter:
          [
            exit > 0 ? `blur(${exit * 18}px)` : "",
            split > 0
              ? `drop-shadow(${split}px 0 0 rgba(255,45,85,0.85)) drop-shadow(${-split}px 0 0 rgba(0,229,255,0.85))`
              : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
      }}
    >
      <Headline lines={lines} />
    </AbsoluteFill>
  );

  const sliceTop = random(`slice-top-${frame}`) * 70;
  const sliceTop2 = random(`slice-top2-${frame}`) * 70;

  return (
    <AbsoluteFill>
      {/* Darken the shared background so this opener feels heavier. */}
      <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity: 0.5 * (1 - exit) }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 50%, rgba(244,63,94,${0.06 + (glitching ? 0.14 : 0)}), transparent 60%)`,
        }}
      />

      {FIELDS.map((field) => (
        <LoopingInput key={field.label} field={field} time={loopTime} exit={exit} />
      ))}

      {/* Keep the centre readable over the busy inputs. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 900px 480px at 50% 50%, rgba(10,15,29,0.9), rgba(10,15,29,0.55) 60%, transparent 100%)",
        }}
      />

      {/* Echoes of the last line trailing downward: "again… again… again". */}
      {[1, 2].map((n) => (
        <AbsoluteFill
          key={n}
          style={{
            alignItems: "center",
            justifyContent: "center",
            transform: `translate(${offset.x * 0.5}px, ${200 + n * 125}px)`,
            opacity: echoOpacity * (n === 1 ? 0.22 : 0.1) * (0.7 + 0.3 * random(`echo-${n}-${frame}`)),
          }}
        >
          <div
            style={{
              fontSize: 132,
              fontWeight: 800,
              letterSpacing: -3,
              color: "transparent",
              WebkitTextStroke: "2px rgba(255,255,255,0.8)",
            }}
          >
            {repeat}
          </div>
        </AbsoluteFill>
      ))}

      {headlineLayer()}
      {glitching ? (
        <>
          {headlineLayer(`inset(${sliceTop}% 0 ${Math.max(0, 88 - sliceTop)}% 0)`, 34)}
          {headlineLayer(`inset(${sliceTop2}% 0 ${Math.max(0, 92 - sliceTop2)}% 0)`, -28)}
        </>
      ) : null}

      {/* CRT scanlines for texture. */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 2px, transparent 2px 4px)",
          opacity: glitching ? 1 : 0.5,
        }}
      />
    </AbsoluteFill>
  );
};
