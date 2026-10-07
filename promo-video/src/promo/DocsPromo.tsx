import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Background } from "./components/Background";
import { EndCard } from "./components/EndCard";
import { Soundtrack } from "./components/Soundtrack";
import { SweepTransition } from "./components/SweepTransition";
import { DOCS_CUTS, DOCS_DURATION, DOCS_END, DOCS_SCENES, DOCS_SFX } from "./docs-timeline";
import type { DocsPromoProps } from "./schema";
import { ResizeUploadScene } from "./scenes/ResizeUploadScene";
import { UploadRejectedScene } from "./scenes/UploadRejectedScene";
import { COLORS, FONT } from "./theme";
import { SWEEP_LEAD, SWEEP_LENGTH } from "./timeline";

const PREMOUNT = 30;

/** 20-second promo for auto-resizing documents and attaching them to the form. */
export const DocsPromo: React.FC<DocsPromoProps> = (props) => (
  <AbsoluteFill style={{ fontFamily: FONT, color: COLORS.text }}>
    <Background />

    <Sequence {...DOCS_SCENES.rejected} name="1 · Upload rejected">
      <UploadRejectedScene lineOne={props.hookLineOne} lineTwo={props.hookLineTwo} stamp={props.rejectedStamp} />
    </Sequence>
    <Sequence {...DOCS_SCENES.resize} name="2 · Auto-resize + upload" premountFor={PREMOUNT}>
      <ResizeUploadScene resizeTitle={props.resizeTitle} uploadTitle={props.uploadTitle} attachLabel={props.attachLabel} />
    </Sequence>
    <Sequence {...DOCS_SCENES.end} name="3 · End card" premountFor={PREMOUNT}>
      <EndCard logoIn={DOCS_END.logoIn} ctaIn={DOCS_END.ctaIn} cta={props.cta} tagline={props.endTagline} />
    </Sequence>

    {DOCS_CUTS.map((cut) => (
      <Sequence key={cut} from={cut - SWEEP_LEAD} durationInFrames={SWEEP_LENGTH} name="Sweep">
        <SweepTransition />
      </Sequence>
    ))}

    <Soundtrack cues={DOCS_SFX} duration={DOCS_DURATION} />
  </AbsoluteFill>
);
