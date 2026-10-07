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
import { DocThumb, type DocKind } from "../components/DocThumbs";
import {
  ALL_LANDED,
  RESIZE,
  fitEndFor,
  flyStartFor,
  landFor,
} from "../docs-timeline";
import { COLORS, FONT, MONO, glass } from "../theme";
import { CLAMP } from "../utils";

/*
 * Beat A: three customer files are auto-fitted to the portal's KB window and
 * dimensions, then the operator ticks each fitted copy (nothing is attached
 * silently). Beat B: the ticked copies fly into the portal's upload boxes.
 * The portal's own "Save & Continue" is never pressed.
 */

type Doc = {
  kind: DocKind;
  title: string;
  rule: string;
  problem: string;
  fromKb: number;
  toKb: number;
  fromDims: string;
  toDims: string;
  windowKb: [number, number];
  before: { w: number; h: number };
  after: { w: number; h: number };
  guides: [string, string] | null;
  fileName: string;
};

// Sizes follow the product's own auto-fit examples (e.g. "1.2 MB → 186 KB").
const DOCS: Doc[] = [
  {
    kind: "photo",
    title: "Photograph",
    rule: "JPG · 20–50 KB · 3.5 × 4.5 cm",
    problem: "Too large",
    fromKb: 2458,
    toKb: 42,
    fromDims: "1600 × 2000 px · PNG",
    toDims: "276 × 354 px · JPG",
    windowKb: [20, 50],
    before: { w: 176, h: 220 },
    after: { w: 140, h: 180 },
    guides: ["3.5 cm", "4.5 cm"],
    fileName: "photo.jpg",
  },
  {
    kind: "signature",
    title: "Signature",
    rule: "JPG · 10–20 KB · 6.0 × 2.0 cm",
    problem: "Wrong size",
    fromKb: 850,
    toKb: 16,
    fromDims: "2480 × 1100 px",
    toDims: "709 × 236 px · 300 DPI",
    windowKb: [10, 20],
    before: { w: 370, h: 164 },
    after: { w: 270, h: 90 },
    guides: ["6.0 cm", "2.0 cm"],
    fileName: "signature.jpg",
  },
  {
    kind: "pdf",
    title: "Aadhaar Card",
    rule: "PDF · up to 200 KB",
    problem: "Over 200 KB",
    fromKb: 1229,
    toKb: 186,
    fromDims: "PDF · 2 pages",
    toDims: "PDF · 2 pages · 150 DPI",
    windowKb: [0, 200],
    before: { w: 150, h: 212 },
    after: { w: 132, h: 187 },
    guides: null,
    fileName: "aadhaar.pdf",
  },
];

/* ---------- layout (screen px) ---------- */

const CARD = { w: 480, h: 580, gap: 60, top: 268, pad: 28 };
const PREVIEW = { y: 104, h: 240 };
const CHECK = { y: 524, size: 26 };
const cardLeft = (i: number) => (1920 - (3 * CARD.w + 2 * CARD.gap)) / 2 + i * (CARD.w + CARD.gap);
const checkCenter = (i: number) => ({
  x: cardLeft(i) + CARD.pad + CHECK.size / 2,
  y: CARD.top + CHECK.y + CHECK.size / 2,
});

const BROWSER = { width: 1600, height: 800, left: 160, top: 210 };
const PANEL_W = 460;
const FORM_W = BROWSER.width - PANEL_W;
const PAGE = { padX: 48, rowsTop: 140, rowH: 150, rowGap: 18 };
const SLOT = { x: 20, y: 15, w: 96, h: 120 };
const rowTop = (i: number) => PAGE.rowsTop + i * (PAGE.rowH + PAGE.rowGap);
const slotCenter = (i: number) => ({
  x: BROWSER.left + PAGE.padX + SLOT.x + SLOT.w / 2,
  y: BROWSER.top + TOPBAR + rowTop(i) + SLOT.y + SLOT.h / 2,
});

/* ---------- helpers ---------- */

const formatSize = (kb: number) => (kb >= 1000 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`);

/** Position on a log scale from 5 KB to 5 MB, so 20 KB and 2 MB both fit on one bar. */
const barPosition = (kb: number) =>
  Math.min(1, Math.max(0, (Math.log(Math.max(kb, 5)) - Math.log(5)) / (Math.log(5000) - Math.log(5))));

const fitProgress = (frame: number, i: number) =>
  interpolate(frame, [fitEndFor(i) - RESIZE.fitLength, fitEndFor(i)], [0, 1], {
    ...CLAMP,
    easing: Easing.inOut(Easing.cubic),
  });

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Thumbnail tile with a white mat, sized to a fitted copy. */
const FittedThumb: React.FC<{ doc: Doc; width: number; height: number }> = ({ doc, width, height }) => (
  <div
    style={{
      width,
      height,
      borderRadius: 10,
      overflow: "hidden",
      background: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <DocThumb
      kind={doc.kind}
      width={doc.kind === "signature" ? width : width * 0.92}
      height={doc.kind === "signature" ? width / 3 : height * 0.92}
    />
  </div>
);

const TickBox: React.FC<{ ticked: number; size: number }> = ({ ticked, size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 7,
      flexShrink: 0,
      border: `2px solid ${ticked > 0 ? COLORS.indigo : "rgba(255,255,255,0.4)"}`,
      background: ticked > 0 ? COLORS.indigo : "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: ticked > 0 ? `0 0 16px ${COLORS.indigo}aa` : "none",
    }}
  >
    <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 24 24" style={{ transform: `scale(${ticked})` }}>
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="white" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

/* ---------- beat A: the auto-fit cards ---------- */

const StatusChip: React.FC<{ t: number; problem: string }> = ({ t, problem }) => {
  const state = t <= 0 ? "problem" : t < 1 ? "fitting" : "fits";
  const palette = {
    problem: { bg: "rgba(244,63,94,0.16)", fg: "#fda4af", text: problem },
    fitting: { bg: "rgba(99,102,241,0.2)", fg: "#c7d2fe", text: "Auto-fitting…" },
    fits: { bg: "rgba(34,197,94,0.18)", fg: "#86efac", text: "Fits the box" },
  }[state];
  return (
    <div
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 16,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {palette.text}
    </div>
  );
};

const FitCard: React.FC<{ doc: Doc; index: number; attachLabel: string }> = ({ doc, index, attachLabel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame: frame - RESIZE.cardsIn - index * RESIZE.cardStep, fps, config: { damping: 14, stiffness: 120 } });
  const t = fitProgress(frame, index);
  const done = spring({ frame: frame - fitEndFor(index), fps, config: { damping: 11, stiffness: 180 } });
  const tick = spring({ frame: frame - RESIZE.ticks[index], fps, config: { damping: 10, stiffness: 220 } });
  // The card dissolves as its fitted copy lifts off towards the upload box.
  const exit = interpolate(frame, [flyStartFor(index) - 6, flyStartFor(index) + 2], [0, 1], CLAMP);

  const fitStart = fitEndFor(index) - RESIZE.fitLength;
  const shimmer = interpolate(frame, [fitStart, fitStart + 34], [-40, 140], CLAMP);
  const kb = Math.exp(lerp(Math.log(doc.fromKb), Math.log(doc.toKb), t));
  const sizeColor = interpolateColors(t, [0, 0.7, 1], [COLORS.error, "#fb7185", COLORS.green]);
  const thumbW = lerp(doc.before.w, doc.after.w, t);
  const thumbH = lerp(doc.before.h, doc.after.h, t);
  const guides = interpolate(t, [0.75, 1], [0, 1], CLAMP);
  const innerW = CARD.w - CARD.pad * 2;
  const thumbLeft = (innerW - thumbW) / 2;
  const thumbTop = (PREVIEW.h - thumbH) / 2;
  const marker = barPosition(kb);
  const zone = [barPosition(doc.windowKb[0]), barPosition(doc.windowKb[1])];

  return (
    <div
      style={{
        ...glass,
        position: "absolute",
        left: cardLeft(index),
        top: CARD.top,
        width: CARD.w,
        height: CARD.h,
        borderRadius: 28,
        overflow: "hidden",
        opacity: Math.min(1, enter * 1.6) * (1 - exit),
        transform: `perspective(1400px) translateY(${(1 - enter) * 100}px) rotateX(${(1 - enter) * 25}deg) scale(${1 - exit * 0.12})`,
        boxShadow: `0 30px 80px rgba(2,6,23,0.55), 0 0 ${50 * done}px rgba(34,197,94,${0.35 * done})`,
        borderColor: done > 0.5 ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.1)",
        filter: exit > 0 ? `blur(${exit * 10}px)` : undefined,
      }}
    >
      <div style={{ position: "absolute", left: CARD.pad, right: CARD.pad, top: 26, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.text }}>{doc.title}</div>
        <StatusChip t={t} problem={doc.problem} />
      </div>
      <div style={{ position: "absolute", left: CARD.pad, top: 68, fontSize: 17, color: COLORS.muted }}>{doc.rule}</div>

      <div
        style={{
          position: "absolute",
          left: CARD.pad,
          top: PREVIEW.y,
          width: innerW,
          height: PREVIEW.h,
          borderRadius: 18,
          overflow: "hidden",
          background: "rgba(255,255,255,0.04)",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        <div style={{ position: "absolute", left: thumbLeft, top: thumbTop, width: thumbW, height: thumbH, borderRadius: 8, overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,0.45)" }}>
          <DocThumb
            kind={doc.kind}
            width={thumbW}
            height={thumbH}
            paper={interpolateColors(t, [0, 1], ["#d6d9df", "#ffffff"])}
          />
        </div>

        {doc.guides ? (
          <div style={{ opacity: guides }}>
            <div style={{ position: "absolute", left: thumbLeft, top: thumbTop - 14, width: thumbW, height: 2, background: COLORS.indigoSoft }} />
            <div style={{ position: "absolute", left: thumbLeft, top: thumbTop - 34, width: thumbW, textAlign: "center", fontFamily: MONO, fontSize: 14, fontWeight: 700, color: "#c7d2fe" }}>
              {doc.guides[0]}
            </div>
            <div style={{ position: "absolute", left: thumbLeft + thumbW + 12, top: thumbTop, width: 2, height: thumbH, background: COLORS.indigoSoft }} />
            <div style={{ position: "absolute", left: thumbLeft + thumbW + 20, top: thumbTop + thumbH / 2 - 9, fontFamily: MONO, fontSize: 14, fontWeight: 700, color: "#c7d2fe", whiteSpace: "nowrap" }}>
              {doc.guides[1]}
            </div>
          </div>
        ) : null}

        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${shimmer}%`,
            width: "30%",
            transform: "translateX(-50%) skewX(-18deg)",
            background: "linear-gradient(90deg, transparent, rgba(129,140,248,0.45), rgba(255,255,255,0.5), rgba(129,140,248,0.45), transparent)",
            opacity: shimmer > -40 && shimmer < 140 ? 1 : 0,
          }}
        />
      </div>

      <div style={{ position: "absolute", left: CARD.pad, right: CARD.pad, top: 362, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: sizeColor, letterSpacing: -1 }}>{formatSize(kb)}</div>
        <div style={{ fontFamily: MONO, fontSize: 15, color: COLORS.muted, opacity: t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2 }}>
          {t < 0.5 ? doc.fromDims : doc.toDims}
        </div>
      </div>

      <div style={{ position: "absolute", left: CARD.pad, right: CARD.pad, top: 440 }}>
        <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.08)" }}>
          <div
            style={{
              position: "absolute",
              left: `${zone[0] * 100}%`,
              width: `${(zone[1] - zone[0]) * 100}%`,
              top: 0,
              bottom: 0,
              borderRadius: 5,
              background: "rgba(34,197,94,0.45)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${marker * 100}%`,
              top: "50%",
              width: 20,
              height: 20,
              borderRadius: "50%",
              transform: "translate(-50%, -50%)",
              background: sizeColor,
              border: "3px solid white",
              boxShadow: `0 0 14px ${sizeColor}`,
            }}
          />
        </div>
        <div style={{ position: "relative", height: 20, marginTop: 8, fontFamily: MONO, fontSize: 13, color: COLORS.muted }}>
          <span style={{ position: "absolute", left: `${((zone[0] + zone[1]) / 2) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
            {doc.windowKb[0] > 0 ? `${doc.windowKb[0]}–${doc.windowKb[1]} KB` : `≤ ${doc.windowKb[1]} KB`}
          </span>
        </div>
      </div>

      <div style={{ position: "absolute", left: CARD.pad, right: CARD.pad, top: CHECK.y, display: "flex", alignItems: "center", gap: 14, opacity: interpolate(done, [0, 1], [0.35, 1]) }}>
        <TickBox ticked={frame >= RESIZE.ticks[index] ? tick : 0} size={CHECK.size} />
        <div style={{ fontSize: 19, fontWeight: 600, color: COLORS.text }}>{attachLabel}</div>
        <div style={{ marginLeft: "auto" }}>
          {done > 0.01 ? <Checkmark progress={done} size={30} /> : null}
        </div>
      </div>
    </div>
  );
};

/* ---------- beat B: the portal page and the panel ---------- */

const UploadRow: React.FC<{ doc: Doc; index: number }> = ({ doc, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = landFor(index);
  const attached = frame >= land;
  const pop = spring({ frame: frame - land, fps, config: { damping: 12, stiffness: 180 } });
  const tick = spring({ frame: frame - land - 4, fps, config: { damping: 11, stiffness: 180 } });
  const pulse = interpolate(frame - land, [0, 6, 24], [0, 1, 0.25], CLAMP);

  return (
    <div
      style={{
        position: "absolute",
        left: PAGE.padX,
        top: rowTop(index),
        width: FORM_W - PAGE.padX * 2,
        height: PAGE.rowH,
        borderRadius: 16,
        border: `2px solid ${interpolateColors(attached ? pop : 0, [0, 1], ["#e2e8f0", "#22c55e"])}`,
        background: attached ? "#f0fdf4" : "#ffffff",
        boxShadow: `0 0 0 ${5 * pulse}px rgba(34,197,94,${0.2 * pulse}), 0 0 ${28 * pulse}px rgba(34,197,94,${0.35 * pulse})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: SLOT.x,
          top: SLOT.y,
          width: SLOT.w,
          height: SLOT.h,
          borderRadius: 10,
          border: attached ? "1px solid #bbf7d0" : "2px dashed #cbd5e1",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {attached ? (
          <div style={{ transform: `scale(${pop})` }}>
            <FittedThumb doc={doc} width={SLOT.w - 8} height={SLOT.h - 8} />
          </div>
        ) : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16" />
          </svg>
        )}
      </div>

      <div style={{ position: "absolute", left: 142, top: 40 }}>
        <div style={{ fontSize: 23, fontWeight: 700, color: "#0f172a" }}>{doc.title}</div>
        <div style={{ fontSize: 16, color: "#64748b", marginTop: 6 }}>{doc.rule}</div>
      </div>

      <div style={{ position: "absolute", right: 28, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 16 }}>
        {attached ? (
          <>
            <Checkmark progress={tick} size={30} />
            <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: "#15803d" }}>
              {doc.fileName} · {formatSize(doc.toKb)}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 16, color: "#94a3b8" }}>No file chosen</div>
        )}
        <div style={{ padding: "10px 18px", borderRadius: 10, border: "1.5px solid #cbd5e1", fontSize: 16, fontWeight: 600, color: "#334155", background: "#ffffff" }}>
          {attached ? "Change" : "Choose File"}
        </div>
      </div>
    </div>
  );
};

const PortalPage: React.FC = () => (
  <div style={{ position: "relative", width: FORM_W, height: "100%", background: "#f8fafc" }}>
    <div style={{ position: "absolute", left: PAGE.padX, top: 34, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16" />
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#0f172a", letterSpacing: -0.5 }}>Upload Documents</div>
        <div style={{ fontSize: 16, color: "#64748b", marginTop: 2 }}>Recruitment Examination 2026 · Step 3 of 4 — Photo, signature and ID</div>
      </div>
    </div>
    <div style={{ position: "absolute", left: PAGE.padX, right: PAGE.padX, top: 116, height: 1, background: "#e2e8f0" }} />
    {DOCS.map((doc, i) => (
      <UploadRow key={doc.kind} doc={doc} index={i} />
    ))}
    <div style={{ position: "absolute", left: PAGE.padX, top: 676, fontSize: 15, color: "#94a3b8" }}>* All documents are mandatory</div>
    {/* Never pressed: the operator continues the application themselves. */}
    <div
      style={{
        position: "absolute",
        right: PAGE.padX,
        top: 660,
        padding: "16px 34px",
        borderRadius: 12,
        background: "#1e293b",
        color: "white",
        fontSize: 18,
        fontWeight: 700,
      }}
    >
      Save &amp; Continue
    </div>
  </div>
);

const AttachPanel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const status = spring({ frame: frame - ALL_LANDED - 4, fps, config: { damping: 14, stiffness: 140 } });

  return (
    <div
      style={{
        position: "relative",
        width: PANEL_W,
        height: "100%",
        background: "linear-gradient(180deg, #121b36 0%, #0b1226 100%)",
        borderLeft: "1px solid rgba(255,255,255,0.1)",
        color: COLORS.text,
      }}
    >
      <div style={{ position: "absolute", left: 30, right: 30, top: 30, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ borderRadius: 12, overflow: "hidden" }}>
          <MarkIcon size={46} />
        </div>
        <div style={{ fontSize: 25, fontWeight: 800 }}>Bharatfill</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: "#86efac" }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: COLORS.green, boxShadow: `0 0 10px ${COLORS.green}` }} />
          Connected
        </div>
      </div>
      <div style={{ position: "absolute", left: 30, top: 110, fontSize: 13, fontWeight: 700, letterSpacing: 1.6, color: COLORS.muted }}>
        DOCUMENTS TO ATTACH
      </div>

      {DOCS.map((doc, i) => {
        const attached = frame >= landFor(i);
        return (
          <div
            key={doc.kind}
            style={{
              ...glass,
              position: "absolute",
              left: 30,
              right: 30,
              top: 140 + i * 96,
              height: 82,
              borderRadius: 16,
              padding: "0 18px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            <FittedThumb doc={doc} width={46} height={58} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{doc.title}</div>
              <div style={{ fontSize: 15, marginTop: 2, color: attached ? "#86efac" : COLORS.muted }}>
                {attached ? "Attached" : "Fitted copy"} · {formatSize(doc.toKb)}
              </div>
            </div>
            <TickBox ticked={1} size={24} />
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 30,
          right: 30,
          top: 140 + 3 * 96 + 18,
          opacity: status,
          transform: `translateY(${(1 - status) * 20}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 22px",
            borderRadius: 999,
            background: "rgba(34,197,94,0.16)",
            color: "#86efac",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          <Checkmark progress={status} size={24} />
          {DOCS.length} of {DOCS.length} documents attached
        </div>
        <div style={{ fontSize: 17, lineHeight: 1.5, color: COLORS.muted, marginTop: 16 }}>
          Review the form, then submit it yourself.
        </div>
      </div>
    </div>
  );
};

/* ---------- the scene ---------- */

export const ResizeUploadScene: React.FC<{
  resizeTitle: string;
  uploadTitle: string;
  attachLabel: string;
}> = ({ resizeTitle, uploadTitle, attachLabel }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleA = spring({ frame: frame - 2, fps, config: { damping: 16, stiffness: 140 } });
  const titleAExit = interpolate(frame, [RESIZE.browserIn - 2, RESIZE.browserIn + 10], [0, 1], CLAMP);
  const titleB = spring({ frame: frame - RESIZE.browserIn - 8, fps, config: { damping: 16, stiffness: 140 } });
  const browser = spring({ frame: frame - RESIZE.browserIn, fps, config: { damping: 20, stiffness: 100 } });
  const exit = interpolate(frame, [durationInFrames - 30, durationInFrames], [0, 1], {
    ...CLAMP,
    easing: Easing.in(Easing.cubic),
  });

  // Cursor: ticks each card's "attach fitted copy" box in turn.
  const checks = DOCS.map((_, i) => checkCenter(i));
  const [t0, t1, t2] = RESIZE.ticks;
  const cursorFrames = [t0 - 16, t0 - 2, t0 + 2, t1 - 2, t1 + 2, t2 - 2, t2 + 2, t2 + 16];
  const pathOpts = { ...CLAMP, easing: Easing.inOut(Easing.cubic) };
  const cursorX = interpolate(frame, cursorFrames, [1560, checks[0].x, checks[0].x, checks[1].x, checks[1].x, checks[2].x, checks[2].x, checks[2].x + 90], pathOpts);
  const cursorY = interpolate(frame, cursorFrames, [1140, checks[0].y, checks[0].y, checks[1].y, checks[1].y, checks[2].y, checks[2].y, checks[2].y + 150], pathOpts);
  const cursorOpacity = interpolate(frame, [t0 - 16, t0 - 10, t2 + 8, t2 + 16], [0, 1, 1, 0], CLAMP);
  const pressed = Math.max(...RESIZE.ticks.map((t) => interpolate(frame, [t - 1, t + 2, t + 7], [0, 1, 0], CLAMP)));

  const title: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: 84,
    textAlign: "center",
    fontSize: 64,
    fontWeight: 800,
    letterSpacing: -1.5,
    color: COLORS.text,
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: 1 - exit, filter: exit > 0 ? `blur(${exit * 12}px)` : undefined }}>
      <div style={{ ...title, opacity: titleA * (1 - titleAExit), transform: `translateY(${(1 - titleA) * -30 - titleAExit * 30}px)` }}>
        {resizeTitle}
      </div>
      <div style={{ ...title, top: 74, opacity: titleB, transform: `translateY(${(1 - titleB) * 30}px)` }}>{uploadTitle}</div>

      {frame >= RESIZE.browserIn - 1 ? (
        <div
          style={{
            position: "absolute",
            left: BROWSER.left,
            top: BROWSER.top,
            opacity: Math.min(1, browser * 2),
            transform: `perspective(2200px) translateY(${(1 - browser) * 300}px) rotateX(${(1 - browser) * 18}deg)`,
            transformOrigin: "50% 100%",
          }}
        >
          <BrowserChrome width={BROWSER.width} height={BROWSER.height} url="recruitment-portal.example/documents">
            <PortalPage />
            <AttachPanel />
          </BrowserChrome>
        </div>
      ) : null}

      {DOCS.map((doc, i) => (
        <FitCard key={doc.kind} doc={doc} index={i} attachLabel={attachLabel} />
      ))}

      {/* Fitted copies flying into their upload boxes. */}
      {DOCS.map((doc, i) => {
        const start = flyStartFor(i);
        const end = landFor(i);
        if (frame < start || frame >= end) {
          return null;
        }
        const p = interpolate(frame, [start, end], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
        const from = { x: cardLeft(i) + CARD.w / 2, y: CARD.top + PREVIEW.y + PREVIEW.h / 2 };
        const to = slotCenter(i);
        const x = lerp(from.x, to.x, p);
        const y = lerp(from.y, to.y, p) - Math.sin(Math.PI * p) * 140;
        const scale = lerp(1.6, 1, p);
        return (
          <div
            key={doc.kind}
            style={{
              position: "absolute",
              left: x - SLOT.w / 2,
              top: y - SLOT.h / 2,
              transform: `scale(${scale}) rotate(${(1 - p) * -8}deg)`,
              filter: "drop-shadow(0 0 24px rgba(129,140,248,0.75)) drop-shadow(0 16px 24px rgba(0,0,0,0.45))",
              zIndex: 5,
            }}
          >
            <FittedThumb doc={doc} width={SLOT.w} height={SLOT.h} />
          </div>
        );
      })}

      <Cursor x={cursorX} y={cursorY} pressed={pressed} opacity={cursorOpacity} />
    </AbsoluteFill>
  );
};
