import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Background } from "./components/Background";
import { Soundtrack } from "./components/Soundtrack";
import { SweepTransition } from "./components/SweepTransition";
import { ALL_FITTED, ALL_LANDED, RESIZE } from "./docs-timeline";
import { AutoFillScene } from "./scenes/AutoFillScene";
import { ImpactScene } from "./scenes/ImpactScene";
import { LogoScene } from "./scenes/LogoScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { ResizeUploadScene } from "./scenes/ResizeUploadScene";
import { ScannerScene } from "./scenes/ScannerScene";
import { defaultDocsPromoProps, defaultPromoProps } from "./schema";
import { COLORS, FONT } from "./theme";
import {
  AUTOFILL,
  AUTOFILL_DONE,
  IMPACT,
  SCANNER_BEATS,
  type SfxCue,
  SWEEP_LEAD,
  SWEEP_LENGTH,
} from "./timeline";

const PREMOUNT = 30;

/*
 * Unified 41-second seamless master promo:
 * 1. Single Hook / Problem (0-5s)
 * 2. Brand Reveal (5-10s)
 * 3. AI Scanner & Extraction (10-17s)
 * 4. Document Auto-Resize & Upload (17-28s)
 * 5. 1-Click Browser Auto-Fill (28-35s)
 * 6. Single Climax & Call To Action (35-41s)
 *
 * One continuous soundtrack from start to finish, with no awkward stop-and-restart.
 */
export const UNIFIED_SCENES = {
  problem: { from: 0, durationInFrames: 150 },
  logo: { from: 150, durationInFrames: 150 },
  scanner: { from: 300, durationInFrames: 210 },
  resize: { from: 510, durationInFrames: 330 },
  autofill: { from: 840, durationInFrames: 210 },
  impact: { from: 1050, durationInFrames: 180 },
} as const;

export const COMBINED_DURATION = 1230; // 41 seconds at 30 fps

export const UNIFIED_CUTS = [
  UNIFIED_SCENES.logo.from,
  UNIFIED_SCENES.scanner.from,
  UNIFIED_SCENES.resize.from,
  UNIFIED_SCENES.autofill.from,
  UNIFIED_SCENES.impact.from,
];

const SWOOSH_LEAD = 8;

export const UNIFIED_SFX: SfxCue[] = [
  ...UNIFIED_CUTS.map(
    (cut): SfxCue => ({
      sound: "swoosh",
      frame: cut - SWOOSH_LEAD,
      volume: 0.7,
    }),
  ),
  {
    sound: "success",
    frame: UNIFIED_SCENES.scanner.from + SCANNER_BEATS.id + 2,
    volume: 0.6,
  },
  {
    sound: "success",
    frame: UNIFIED_SCENES.resize.from + ALL_FITTED,
    volume: 0.6,
  },
  {
    sound: "swoosh",
    frame: UNIFIED_SCENES.resize.from + RESIZE.flyStart,
    volume: 0.5,
  },
  {
    sound: "success",
    frame: UNIFIED_SCENES.resize.from + ALL_LANDED + 4,
    volume: 0.7,
  },
  {
    sound: "swoosh",
    frame: UNIFIED_SCENES.autofill.from + AUTOFILL.click,
    volume: 0.45,
  },
  {
    sound: "success",
    frame: UNIFIED_SCENES.autofill.from + AUTOFILL_DONE,
    volume: 0.7,
  },
  {
    sound: "success",
    frame: UNIFIED_SCENES.impact.from + IMPACT.ctaIn,
    volume: 0.8,
  },
];

export const CombinedPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.text }}>
      <Background />

      {/* 1 · Problem Hook */}
      <Sequence {...UNIFIED_SCENES.problem} name="1 · Problem Hook">
        <ProblemScene
          lead={defaultPromoProps.problemLead}
          middle={defaultPromoProps.problemMiddle}
          repeat={defaultPromoProps.problemRepeat}
        />
      </Sequence>

      {/* 2 · Logo Reveal & Brand Intro */}
      <Sequence {...UNIFIED_SCENES.logo} name="2 · Brand Reveal" premountFor={PREMOUNT}>
        <LogoScene tagline={defaultPromoProps.tagline} />
      </Sequence>

      {/* 3 · AI Document Scanner */}
      <Sequence {...UNIFIED_SCENES.scanner} name="3 · AI Scanner" premountFor={PREMOUNT}>
        <ScannerScene
          title={defaultPromoProps.scannerTitle}
          subtitle={defaultPromoProps.scannerSubtitle}
          badgeName={defaultPromoProps.badgeName}
          badgeDob={defaultPromoProps.badgeDob}
          badgeId={defaultPromoProps.badgeId}
        />
      </Sequence>

      {/* 4 · Document Auto-Resize & Upload */}
      <Sequence {...UNIFIED_SCENES.resize} name="4 · Auto-Resize Docs" premountFor={PREMOUNT}>
        <ResizeUploadScene
          resizeTitle={defaultDocsPromoProps.resizeTitle}
          uploadTitle={defaultDocsPromoProps.uploadTitle}
          attachLabel={defaultDocsPromoProps.attachLabel}
        />
      </Sequence>

      {/* 5 · 1-Click Form Auto-Fill */}
      <Sequence {...UNIFIED_SCENES.autofill} name="5 · 1-Click Auto-Fill" premountFor={PREMOUNT}>
        <AutoFillScene
          title={defaultPromoProps.autofillTitle}
          buttonLabel={defaultPromoProps.autofillButton}
        />
      </Sequence>

      {/* 6 · Grand Impact & Final CTA */}
      <Sequence {...UNIFIED_SCENES.impact} name="6 · Impact & CTA" premountFor={PREMOUNT}>
        <ImpactScene
          statOneValue={defaultPromoProps.statOneValue}
          statOneSuffix={defaultPromoProps.statOneSuffix}
          statOneLabel={defaultPromoProps.statOneLabel}
          statTwoBig={defaultPromoProps.statTwoBig}
          statTwoLabel={defaultPromoProps.statTwoLabel}
          cta={defaultPromoProps.cta}
        />
      </Sequence>

      {/* Seamless light sweep transitions between each scene */}
      {UNIFIED_CUTS.map((cut) => (
        <Sequence
          key={cut}
          from={cut - SWEEP_LEAD}
          durationInFrames={SWEEP_LENGTH}
          name="Sweep"
        >
          <SweepTransition />
        </Sequence>
      ))}

      {/* One continuous soundtrack across the entire video */}
      <Soundtrack cues={UNIFIED_SFX} duration={COMBINED_DURATION} />
    </AbsoluteFill>
  );
};
