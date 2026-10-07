import { rowCenter } from "./components/SampleIdCard";

/*
 * One place for every timing in the video. Scene cuts, in-scene beats and the
 * sound effects all derive from these numbers, so moving a beat moves its sound.
 */

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 900;

export const SCENES = {
  problem: { from: 0, durationInFrames: 150 },
  logo: { from: 150, durationInFrames: 150 },
  scanner: { from: 300, durationInFrames: 210 },
  autofill: { from: 510, durationInFrames: 210 },
  impact: { from: 720, durationInFrames: 180 },
} as const;

/** Frames where one scene hands over to the next; the light sweep is centred on each. */
export const CUTS = [
  SCENES.logo.from,
  SCENES.scanner.from,
  SCENES.autofill.from,
  SCENES.impact.from,
];
export const SWEEP_LEAD = 10;
export const SWEEP_LENGTH = 22;

/** Laser pass over the sample ID card: scanner-scene frames, card pixels. */
export const SCAN = { start: 30, end: 105, fromY: -10, toY: 490 } as const;
export const VERIFY = { start: 110, end: 134 } as const;

const scanFrameForY = (y: number) =>
  Math.round(
    SCAN.start +
      ((y - SCAN.fromY) / (SCAN.toY - SCAN.fromY)) * (SCAN.end - SCAN.start),
  );

/** Frame (scanner-local) at which the laser reaches each card row. */
export const SCANNER_BEATS = {
  name: scanFrameForY(rowCenter("name")),
  father: scanFrameForY(rowCenter("father")),
  dob: scanFrameForY(rowCenter("dob")),
  id: scanFrameForY(rowCenter("id")),
};

export const AUTOFILL = {
  cursorIn: 34,
  click: 70,
  fillStart: 80,
  fillStep: 7,
  fieldCount: 8,
} as const;
export const AUTOFILL_DONE =
  AUTOFILL.fillStart + AUTOFILL.fillStep * (AUTOFILL.fieldCount - 1) + 9;

export const IMPACT = {
  countStart: 10,
  countEnd: 54,
  statsOut: 88,
  logoIn: 98,
  ctaIn: 114,
} as const;

export type SfxCue = {
  sound: "swoosh" | "success";
  frame: number;
  volume: number;
};

/** Swooshes start a few frames early so their peak lands on the cut. */
const SWOOSH_LEAD = 8;

export const SFX_CUES: SfxCue[] = [
  ...CUTS.map(
    (cut): SfxCue => ({
      sound: "swoosh",
      frame: cut - SWOOSH_LEAD,
      volume: 0.7,
    }),
  ),
  {
    sound: "swoosh",
    frame: SCENES.autofill.from + AUTOFILL.click,
    volume: 0.45,
  },
  {
    sound: "success",
    frame: SCENES.scanner.from + SCANNER_BEATS.id + 2,
    volume: 0.6,
  },
  {
    sound: "success",
    frame: SCENES.autofill.from + AUTOFILL_DONE,
    volume: 0.7,
  },
  {
    sound: "success",
    frame: SCENES.impact.from + IMPACT.ctaIn,
    volume: 0.8,
  },
];
