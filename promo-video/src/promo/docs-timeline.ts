import type { SfxCue } from "./timeline";

/*
 * Timings for the 20-second "auto-resize & upload documents" promo. Same rule
 * as timeline.ts: every beat and its sound derive from these numbers.
 */

export const DOCS_DURATION = 600;

export const DOCS_SCENES = {
  rejected: { from: 0, durationInFrames: 120 },
  resize: { from: 120, durationInFrames: 330 },
  end: { from: 450, durationInFrames: 150 },
} as const;

export const DOCS_CUTS = [DOCS_SCENES.resize.from, DOCS_SCENES.end.from];

/** Hook scene: which portal error is on screen when, and when the stamp lands. */
export const REJECTED = { boxIn: 34, errorStep: 22, stamp: 92 } as const;

/** Resize-and-upload scene, in scene-local frames. */
export const RESIZE = {
  cardsIn: 6,
  cardStep: 6,
  fitStart: 50,
  fitStep: 8,
  fitLength: 50,
  ticks: [128, 140, 152],
  browserIn: 160,
  flyStart: 166,
  flyStep: 5,
  flyLength: 28,
} as const;

export const fitEndFor = (i: number) => RESIZE.fitStart + i * RESIZE.fitStep + RESIZE.fitLength;
export const flyStartFor = (i: number) => RESIZE.flyStart + i * RESIZE.flyStep;
export const landFor = (i: number) => flyStartFor(i) + RESIZE.flyLength;

const DOC_COUNT = 3;
export const ALL_FITTED = fitEndFor(DOC_COUNT - 1);
export const ALL_LANDED = landFor(DOC_COUNT - 1);

export const DOCS_END = { logoIn: 6, ctaIn: 26 } as const;

const SWOOSH_LEAD = 8;

export const DOCS_SFX: SfxCue[] = [
  ...DOCS_CUTS.map((cut): SfxCue => ({ sound: "swoosh", frame: cut - SWOOSH_LEAD, volume: 0.7 })),
  { sound: "success", frame: DOCS_SCENES.resize.from + ALL_FITTED, volume: 0.6 },
  { sound: "swoosh", frame: DOCS_SCENES.resize.from + RESIZE.flyStart, volume: 0.5 },
  { sound: "success", frame: DOCS_SCENES.resize.from + ALL_LANDED + 4, volume: 0.7 },
  { sound: "success", frame: DOCS_SCENES.end.from + DOCS_END.ctaIn, volume: 0.8 },
];
