import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MarkIcon } from "../components/Brand";
import { BrowserChrome, TOPBAR } from "../components/BrowserChrome";
import { Checkmark } from "../components/Checkmark";
import { Cursor } from "../components/Cursor";
import { COLORS, FONT, glass } from "../theme";
import { AUTOFILL, AUTOFILL_DONE } from "../timeline";
import { CLAMP } from "../utils";

const BROWSER = { width: 1600, height: 800, left: 160, top: 210 };
const PANEL_W = 460;
const FORM_W = BROWSER.width - PANEL_W;
const PANEL_PAD = 30;
const BUTTON = { top: 414, height: 70 };
/** Where the cursor clicks, in browser-window pixels. */
const CLICK_POINT = {
  x: FORM_W + PANEL_W / 2 + 24,
  y: TOPBAR + BUTTON.top + BUTTON.height / 2 + 6,
};

// Sample data only: canonical fake mobile, example.com email, masked ID.
const FORM_FIELDS = [
  { label: "Full Name", value: "Rahul Sharma" },
  { label: "Father's Name", value: "Suresh Sharma" },
  { label: "Date of Birth", value: "14-08-1996" },
  { label: "Gender", value: "Male" },
  { label: "Mobile Number", value: "98765 43210" },
  { label: "Email Address", value: "rahul.sharma@example.com" },
  { label: "Aadhaar Number", value: "XXXX XXXX 4821" },
  { label: "State", value: "Bihar" },
];

const fillStartFor = (index: number) => AUTOFILL.fillStart + index * AUTOFILL.fillStep;

const FormField: React.FC<{ label: string; value: string; start: number }> = ({ label, value, start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - start;
  const typed = interpolate(local, [0, 9], [0, 1], CLAMP);
  const pulse = interpolate(local, [0, 6, 24], [0, 1, 0.3], CLAMP);
  const tick = spring({ frame: local - 6, fps, config: { damping: 11, stiffness: 180 } });

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginBottom: 8 }}>{label}</div>
      <div
        style={{
          height: 54,
          borderRadius: 10,
          border: `2px solid ${interpolateColors(typed, [0, 1], ["#cbd5e1", "#22c55e"])}`,
          background: interpolateColors(typed, [0, 1], ["#ffffff", "#f0fdf4"]),
          boxShadow: `0 0 0 ${5 * pulse}px rgba(34,197,94,${0.22 * pulse}), 0 0 ${26 * pulse}px rgba(34,197,94,${0.4 * pulse})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px 0 18px",
          fontSize: 20,
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        <span>{value.slice(0, Math.ceil(value.length * typed))}</span>
        {local >= 6 ? <Checkmark progress={tick} size={28} /> : null}
      </div>
    </div>
  );
};

const FormPage: React.FC = () => {
  const frame = useCurrentFrame();
  const sweepY = interpolate(frame, [AUTOFILL.fillStart - 2, AUTOFILL_DONE], [150, 560], CLAMP);
  const sweepOpacity = interpolate(
    frame,
    [AUTOFILL.fillStart - 4, AUTOFILL.fillStart, AUTOFILL_DONE - 4, AUTOFILL_DONE + 4],
    [0, 1, 1, 0],
    CLAMP,
  );

  return (
    <div style={{ position: "relative", width: FORM_W, height: "100%", background: "#f8fafc", padding: "36px 48px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round">
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M9 8h6M9 12h6M9 16h4" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", letterSpacing: -0.5 }}>Online Application Form</div>
          <div style={{ fontSize: 16, color: "#64748b", marginTop: 2 }}>
            Recruitment Examination 2026 · Step 2 of 4 — Personal details
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: "#e2e8f0", margin: "22px 0 26px" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "22px 32px" }}>
        {FORM_FIELDS.map((field, i) => (
          <FormField key={field.label} label={field.label} value={field.value} start={fillStartFor(i)} />
        ))}
      </div>

      <div style={{ marginTop: 32, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 15, color: "#94a3b8" }}>* All fields are mandatory</div>
        {/* Bharatfill never submits: this button is left for the operator. */}
        <div
          style={{
            padding: "16px 34px",
            borderRadius: 12,
            background: "#1e293b",
            color: "white",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          Submit Application
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: sweepY - 60,
          height: 60,
          background: "linear-gradient(to top, rgba(34,197,94,0.16), transparent)",
          opacity: sweepOpacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: sweepY,
          height: 3,
          background: "linear-gradient(90deg, transparent, #22c55e 15%, #86efac 50%, #22c55e 85%, transparent)",
          boxShadow: "0 0 18px rgba(34,197,94,0.8)",
          opacity: sweepOpacity,
        }}
      />
    </div>
  );
};

const BoltIcon: React.FC = () => (
  <svg width="26" height="26" viewBox="0 0 24 24">
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="white" />
  </svg>
);

const ExtensionPanel: React.FC<{ buttonLabel: string }> = ({ buttonLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slide = spring({ frame: frame - 16, fps, config: { damping: 16, stiffness: 120 } });
  const pressed = interpolate(frame, [AUTOFILL.click - 1, AUTOFILL.click + 2, AUTOFILL.click + 8], [0, 1, 0], CLAMP);
  const ripple = interpolate(frame, [AUTOFILL.click, AUTOFILL.click + 20], [0, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.cubic),
  });
  const done = frame >= AUTOFILL_DONE;
  const doneMix = interpolate(frame, [AUTOFILL_DONE - 4, AUTOFILL_DONE + 2], [0, 1], CLAMP);
  const filled = FORM_FIELDS.filter((_, i) => frame >= fillStartFor(i)).length;
  const status = spring({ frame: frame - AUTOFILL_DONE, fps, config: { damping: 14, stiffness: 140 } });
  const idleGlow = frame < AUTOFILL.click ? 0.6 + 0.4 * Math.sin(frame / 5) : 0.4;

  const label =
    frame < AUTOFILL.fillStart
      ? buttonLabel
      : done
        ? `${FORM_FIELDS.length} of ${FORM_FIELDS.length} fields filled`
        : `Filling… ${filled}/${FORM_FIELDS.length}`;

  const card: React.CSSProperties = {
    ...glass,
    position: "absolute",
    left: PANEL_PAD,
    right: PANEL_PAD,
    borderRadius: 18,
    padding: 20,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
  };

  return (
    <div
      style={{
        position: "relative",
        width: PANEL_W,
        height: "100%",
        background: "linear-gradient(180deg, #121b36 0%, #0b1226 100%)",
        borderLeft: "1px solid rgba(255,255,255,0.1)",
        transform: `translateX(${(1 - slide) * PANEL_W}px)`,
        color: COLORS.text,
      }}
    >
      <div style={{ position: "absolute", left: PANEL_PAD, right: PANEL_PAD, top: 30, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ borderRadius: 12, overflow: "hidden" }}>
          <MarkIcon size={46} />
        </div>
        <div style={{ fontSize: 25, fontWeight: 800 }}>Bharatfill</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: "#86efac" }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: COLORS.green, boxShadow: `0 0 10px ${COLORS.green}` }} />
          Connected
        </div>
      </div>

      <div style={{ ...card, top: 110, display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${COLORS.indigo}, ${COLORS.saffron})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 21,
            fontWeight: 800,
          }}
        >
          RS
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Rahul Sharma</div>
          <div style={{ fontSize: 15, color: COLORS.muted, marginTop: 2 }}>Customer profile · 12 fields</div>
        </div>
      </div>

      <div style={{ ...card, top: 254 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.6, color: COLORS.muted }}>FORM DETECTED</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>Online Application Form</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div
              style={{
                width: `${interpolate(frame, [30, 56], [0, 100], CLAMP)}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.indigoSoft})`,
              }}
            />
          </div>
          <div style={{ fontSize: 15, color: COLORS.muted }}>{FORM_FIELDS.length} fields matched</div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: PANEL_PAD,
          right: PANEL_PAD,
          top: BUTTON.top,
          height: BUTTON.height,
          borderRadius: 16,
          overflow: "hidden",
          transform: `scale(${1 - 0.05 * pressed})`,
          boxShadow: done
            ? "0 0 32px rgba(34,197,94,0.55)"
            : `0 0 ${18 + 22 * idleGlow}px rgba(99,102,241,${0.45 + 0.3 * idleGlow})`,
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, #6366f1, #3b5bff)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, #16a34a, #22c55e)", opacity: doneMix }} />
        <div
          style={{
            position: "absolute",
            left: CLICK_POINT.x - FORM_W - PANEL_PAD - 260,
            top: BUTTON.height / 2 - 260,
            width: 520,
            height: 520,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.45)",
            transform: `scale(${ripple})`,
            opacity: frame >= AUTOFILL.click ? 1 - ripple : 0,
          }}
        />
        <div
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            fontSize: 21,
            fontWeight: 800,
          }}
        >
          {done ? <Checkmark progress={1} size={28} color="#15803d" /> : <BoltIcon />}
          {label}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: PANEL_PAD,
          right: PANEL_PAD,
          top: BUTTON.top + BUTTON.height + 28,
          opacity: status,
          transform: `translateY(${(1 - status) * 20}px)`,
          fontSize: 17,
          lineHeight: 1.5,
          color: COLORS.muted,
          textAlign: "center",
        }}
      >
        Review the form, then submit it yourself.
      </div>
    </div>
  );
};

export const AutoFillScene: React.FC<{ title: string; buttonLabel: string }> = ({ title, buttonLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 110 } });
  const titleIn = spring({ frame: frame - 2, fps, config: { damping: 16, stiffness: 140 } });
  const exit = interpolate(frame, [194, 210], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });

  // Cursor: glides in on a curve (x eases out, y eases in-out), clicks, then drifts off.
  const travel = interpolate(frame, [AUTOFILL.cursorIn, AUTOFILL.click - 2], [0, 1], CLAMP);
  const drift = interpolate(frame, [AUTOFILL.click + 14, AUTOFILL.click + 44], [0, 1], {
    ...CLAMP,
    easing: Easing.inOut(Easing.cubic),
  });
  const start = { x: BROWSER.width + 160, y: BROWSER.height + 140 };
  const cursorX =
    start.x + (CLICK_POINT.x - start.x) * Easing.out(Easing.cubic)(travel) + drift * 70;
  const cursorY =
    start.y + (CLICK_POINT.y - start.y) * Easing.inOut(Easing.cubic)(travel) + drift * 150;
  const cursorOpacity = interpolate(
    frame,
    [AUTOFILL.cursorIn, AUTOFILL.cursorIn + 6, AUTOFILL_DONE + 6, AUTOFILL_DONE + 18],
    [0, 1, 1, 0],
    CLAMP,
  );
  const pressed = interpolate(frame, [AUTOFILL.click - 1, AUTOFILL.click + 2, AUTOFILL.click + 7], [0, 1, 0], CLAMP);

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 74,
          textAlign: "center",
          fontSize: 64,
          fontWeight: 800,
          letterSpacing: -1.5,
          color: COLORS.text,
          opacity: titleIn * (1 - exit),
          transform: `translateY(${(1 - titleIn) * -30 - exit * 40}px)`,
        }}
      >
        {title}
      </div>

      <div
        style={{
          position: "absolute",
          left: BROWSER.left,
          top: BROWSER.top,
          width: BROWSER.width,
          height: BROWSER.height,
          perspective: 2200,
          opacity: (1 - exit),
          filter: exit > 0 ? `blur(${exit * 12}px)` : undefined,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            opacity: Math.min(1, enter * 2),
            transformOrigin: "50% 100%",
            transform: `translateY(${(1 - enter) * 220 - exit * 30}px) rotateX(${(1 - enter) * 24}deg) scale(${(0.86 + 0.14 * enter) * (1 - exit * 0.06)})`,
          }}
        >
          <BrowserChrome width={BROWSER.width} height={BROWSER.height} url="recruitment-portal.example/apply">
            <FormPage />
            <ExtensionPanel buttonLabel={buttonLabel} />
          </BrowserChrome>
          <Cursor x={cursorX} y={cursorY} pressed={pressed} opacity={cursorOpacity} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
