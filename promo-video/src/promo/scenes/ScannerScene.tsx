import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ASSETS, optionalAsset } from "../assets";
import { Checkmark } from "../components/Checkmark";
import {
  ID_CARD,
  ID_CARD_FIELDS,
  type IdCardField,
  SampleIdCard,
  SampleTaxCard,
  rowCenter,
} from "../components/SampleIdCard";
import { COLORS, FONT, MONO, glass } from "../theme";
import { SCAN, SCANNER_BEATS, VERIFY } from "../timeline";
import { CLAMP } from "../utils";

const CARD_SCALE = 1.12;
const STAGE_CENTER = { x: 760, y: 610 };
const SCAN_COLOR = "#818cf8";
const VERIFY_COLOR = "#22c55e";

const Laser: React.FC<{ y: number; opacity: number; color: string; down: boolean }> = ({
  y,
  opacity,
  color,
  down,
}) => (
  <>
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: down ? y - 120 : y,
        height: 120,
        background: `linear-gradient(${down ? "to top" : "to bottom"}, ${color}55, transparent)`,
        opacity,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: -28,
        right: -28,
        top: y - 2,
        height: 4,
        borderRadius: 2,
        background: `linear-gradient(90deg, transparent, ${color} 12%, #ffffff 50%, ${color} 88%, transparent)`,
        boxShadow: `0 0 18px 4px ${color}, 0 0 60px 14px ${color}66`,
        opacity,
      }}
    />
  </>
);

const Brackets: React.FC<{ progress: number; color: string }> = ({ progress, color }) => {
  const pad = interpolate(progress, [0, 1], [60, 18]);
  const corner = (style: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: 56,
    height: 56,
    borderColor: color,
    borderStyle: "solid",
    borderWidth: 0,
    opacity: progress,
    filter: `drop-shadow(0 0 8px ${color})`,
    ...style,
  });
  return (
    <>
      <div style={corner({ left: -pad, top: -pad, borderLeftWidth: 5, borderTopWidth: 5, borderTopLeftRadius: 18 })} />
      <div style={corner({ right: -pad, top: -pad, borderRightWidth: 5, borderTopWidth: 5, borderTopRightRadius: 18 })} />
      <div style={corner({ left: -pad, bottom: -pad, borderLeftWidth: 5, borderBottomWidth: 5, borderBottomLeftRadius: 18 })} />
      <div style={corner({ right: -pad, bottom: -pad, borderRightWidth: 5, borderBottomWidth: 5, borderBottomRightRadius: 18 })} />
    </>
  );
};

const FieldHighlight: React.FC<{ field: IdCardField; verified: boolean }> = ({ field, verified }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const box = ID_CARD_FIELDS[field];
  const s = spring({ frame: frame - SCANNER_BEATS[field], fps, config: { damping: 13, stiffness: 180 } });
  const color = verified ? VERIFY_COLOR : SCAN_COLOR;
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderRadius: 12,
        border: `2.5px solid ${color}`,
        background: `${color}1f`,
        boxShadow: `0 0 22px ${color}88`,
        opacity: Math.min(1, s * 1.5),
        transform: `scale(${1.12 - 0.12 * s})`,
      }}
    />
  );
};

type Badge = { label: string; value: string; beat: number; top: number };

const ExtractionBadge: React.FC<{ badge: Badge; index: number; exit: number }> = ({ badge, index, exit }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - badge.beat - 2, fps, config: { damping: 12, stiffness: 170 } });
  const tick = spring({ frame: frame - badge.beat - 7, fps, config: { damping: 10, stiffness: 180 } });
  const bob = Math.sin((frame + index * 20) / 16) * 5;

  return (
    <div
      style={{
        position: "absolute",
        left: 1340,
        top: badge.top,
        opacity: Math.min(1, s * 1.5) * (1 - exit),
        transform: `translate(${(1 - s) * 90 - exit * 120}px, ${bob}px) scale(${0.7 + 0.3 * s})`,
        transformOrigin: "left center",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: "100%",
          top: "50%",
          width: 96,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${COLORS.green})`,
          transform: `scaleX(${s})`,
          transformOrigin: "right center",
        }}
      />
      <div
        style={{
          ...glass,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "20px 34px 20px 22px",
          borderRadius: 24,
          minWidth: 430,
        }}
      >
        <Checkmark progress={tick} size={54} />
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: COLORS.text }}>{badge.label}</div>
          <div style={{ fontFamily: MONO, fontSize: 21, color: COLORS.muted, marginTop: 4 }}>{badge.value}</div>
        </div>
      </div>
    </div>
  );
};

export const ScannerScene: React.FC<{
  title: string;
  subtitle: string;
  badgeName: string;
  badgeDob: string;
  badgeId: string;
}> = ({ title, subtitle, badgeName, badgeDob, badgeId }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const preview = optionalAsset(ASSETS.scannerPreview);

  const enter = spring({ frame: frame - 2, fps, config: { damping: 15, stiffness: 90 } });
  const backEnter = spring({ frame: frame - 10, fps, config: { damping: 16, stiffness: 90 } });
  const titleIn = spring({ frame: frame - 4, fps, config: { damping: 16, stiffness: 140 } });
  const brackets = spring({ frame: frame - 20, fps, config: { damping: 14, stiffness: 160 } });
  const exit = interpolate(frame, [194, 210], [0, 1], { ...CLAMP, easing: Easing.in(Easing.cubic) });

  const scanY = interpolate(frame, [SCAN.start, SCAN.end], [SCAN.fromY, SCAN.toY], CLAMP);
  const scanOpacity = interpolate(frame, [SCAN.start - 4, SCAN.start, SCAN.end, SCAN.end + 6], [0, 1, 1, 0], CLAMP);
  const verifyY = interpolate(frame, [VERIFY.start, VERIFY.end], [SCAN.toY, SCAN.fromY], {
    ...CLAMP,
    easing: Easing.inOut(Easing.cubic),
  });
  const verifyOpacity = interpolate(
    frame,
    [VERIFY.start - 3, VERIFY.start, VERIFY.end, VERIFY.end + 6],
    [0, 1, 1, 0],
    CLAMP,
  );
  const verifiedGlow = interpolate(frame, [VERIFY.end, VERIFY.end + 10], [0, 1], CLAMP);
  const scannedTint = interpolate(frame, [SCAN.end, SCAN.end + 20], [1, 0], CLAMP);

  const isVerified = (field: IdCardField) => frame >= VERIFY.start && verifyY <= rowCenter(field);

  const rotateY = interpolate(enter, [0, 1], [-62, -16]) + Math.sin(frame / 32) * 3;
  const rotateX = interpolate(enter, [0, 1], [22, 9]);
  const floatY = Math.sin(frame / 22) * 8;

  const badges: Badge[] = [
    { label: badgeName, value: "Rahul Sharma", beat: SCANNER_BEATS.name, top: 340 },
    { label: badgeDob, value: "14 / 08 / 1996", beat: SCANNER_BEATS.dob, top: 500 },
    { label: badgeId, value: "XXXX XXXX 4821", beat: SCANNER_BEATS.id, top: 660 },
  ];

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 92,
          opacity: titleIn * (1 - exit),
          transform: `translateX(${(1 - titleIn) * -50 - exit * 120}px)`,
        }}
      >
        <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: -1.5, color: COLORS.text }}>{title}</div>
        <div style={{ fontSize: 28, fontWeight: 500, color: COLORS.muted, marginTop: 6 }}>{subtitle}</div>
      </div>

      <div
        style={{
          position: "absolute",
          left: STAGE_CENTER.x - ID_CARD.width / 2,
          top: STAGE_CENTER.y - ID_CARD.height / 2,
          width: ID_CARD.width,
          height: ID_CARD.height,
          perspective: 1800,
          opacity: interpolate(enter, [0, 0.4], [0, 1], CLAMP) * (1 - exit),
          filter: exit > 0 ? `blur(${exit * 10}px)` : undefined,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transformStyle: "preserve-3d",
            transform: `translate(${(1 - enter) * -260 - exit * 260}px, ${floatY}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(-2deg) scale(${CARD_SCALE * interpolate(enter, [0, 1], [0.75, 1])})`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: backEnter * 0.85,
              transform: `translate3d(${110 * backEnter}px, ${-86 * backEnter}px, -150px) rotateZ(6deg)`,
            }}
          >
            <SampleTaxCard />
          </div>

          <div style={{ position: "absolute", inset: 0 }}>
            {preview ? (
              <div style={{ position: "absolute", inset: 0, borderRadius: 24, overflow: "hidden" }}>
                <Img src={preview} style={{ width: "100%", height: "100%", objectFit: "cover", maxWidth: "none" }} />
              </div>
            ) : (
              <SampleIdCard>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: scannedTint,
                    clipPath: `inset(0 0 ${Math.max(0, ID_CARD.height - scanY)}px 0)`,
                    backgroundImage: `linear-gradient(${SCAN_COLOR}22 1px, transparent 1px), linear-gradient(90deg, ${SCAN_COLOR}22 1px, transparent 1px)`,
                    backgroundSize: "24px 24px",
                  }}
                />
              </SampleIdCard>
            )}

            {/* Row highlights only line up with the drawn card, not a dropped-in screenshot. */}
            {preview
              ? null
              : (Object.keys(ID_CARD_FIELDS) as IdCardField[]).map((field) => (
                  <FieldHighlight key={field} field={field} verified={isVerified(field)} />
                ))}

            <div
              style={{
                position: "absolute",
                inset: -3,
                borderRadius: 26,
                border: `3px solid ${VERIFY_COLOR}`,
                boxShadow: `0 0 40px ${VERIFY_COLOR}aa`,
                opacity: verifiedGlow * (0.75 + 0.25 * Math.sin(frame / 5)),
              }}
            />
            <Brackets progress={brackets} color={frame >= VERIFY.end ? VERIFY_COLOR : SCAN_COLOR} />
            <Laser y={scanY} opacity={scanOpacity} color={SCAN_COLOR} down />
            <Laser y={verifyY} opacity={verifyOpacity} color={VERIFY_COLOR} down={false} />
          </div>
        </div>
      </div>

      {badges.map((badge, i) => (
        <ExtractionBadge key={badge.label} badge={badge} index={i} exit={exit} />
      ))}
    </AbsoluteFill>
  );
};
