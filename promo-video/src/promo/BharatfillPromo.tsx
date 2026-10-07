import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Background } from "./components/Background";
import { Soundtrack } from "./components/Soundtrack";
import { SweepTransition } from "./components/SweepTransition";
import type { PromoProps } from "./schema";
import { AutoFillScene } from "./scenes/AutoFillScene";
import { ImpactScene } from "./scenes/ImpactScene";
import { LogoScene } from "./scenes/LogoScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { ScannerScene } from "./scenes/ScannerScene";
import { COLORS, FONT } from "./theme";
import { CUTS, DURATION, SCENES, SFX_CUES, SWEEP_LEAD, SWEEP_LENGTH } from "./timeline";

const PREMOUNT = 30;

export const BharatfillPromo: React.FC<PromoProps> = (props) => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.text }}>
    <Background />

    <Sequence {...SCENES.problem} name="1 · Problem">
      <ProblemScene lead={props.problemLead} middle={props.problemMiddle} repeat={props.problemRepeat} />
    </Sequence>
    <Sequence {...SCENES.logo} name="2 · Logo reveal" premountFor={PREMOUNT}>
      <LogoScene tagline={props.tagline} />
    </Sequence>
    <Sequence {...SCENES.scanner} name="3 · Scanner" premountFor={PREMOUNT}>
      <ScannerScene
        title={props.scannerTitle}
        subtitle={props.scannerSubtitle}
        badgeName={props.badgeName}
        badgeDob={props.badgeDob}
        badgeId={props.badgeId}
      />
    </Sequence>
    <Sequence {...SCENES.autofill} name="4 · Auto-fill" premountFor={PREMOUNT}>
      <AutoFillScene title={props.autofillTitle} buttonLabel={props.autofillButton} />
    </Sequence>
    <Sequence {...SCENES.impact} name="5 · Impact + CTA" premountFor={PREMOUNT}>
      <ImpactScene
        statOneValue={props.statOneValue}
        statOneSuffix={props.statOneSuffix}
        statOneLabel={props.statOneLabel}
        statTwoBig={props.statTwoBig}
        statTwoLabel={props.statTwoLabel}
        cta={props.cta}
      />
    </Sequence>

    {CUTS.map((cut) => (
      <Sequence key={cut} from={cut - SWEEP_LEAD} durationInFrames={SWEEP_LENGTH} name="Sweep">
        <SweepTransition />
      </Sequence>
    ))}

    <Soundtrack cues={SFX_CUES} duration={DURATION} />
  </AbsoluteFill>
);
