/**
 * Timing for the tab bar's micro-animations, and the keyframe maths behind them.
 *
 * Each tab is driven by two native-driver values. `select` (0 to 1) only fades: colour, pill and
 * label. `play` (0 to 1) only moves: every scale and slide. Keeping them apart means a deselected
 * tab just fades back to its still outline, and "remove animations" is simply `play` held at 1.
 *
 * The native driver ignores easing inside an interpolation, so eased keyframes are baked into
 * short straight segments here. No React Native imports: this file is unit tested in Node.
 */

export type TabMotionProp = 'translateX' | 'translateY' | 'scale' | 'scaleX' | 'scaleY';

/** A moment (0 to 1 through the sequence) and the value held at it. */
export type TabKeyframe = readonly [at: number, value: number];

export type TabMotionTrack = {
  readonly prop: TabMotionProp;
  /** Slides are in icon units (the 24-unit canvas), so they scale with the icon. */
  readonly keys: readonly TabKeyframe[];
};

export const TAB_MOTION = {
  /** Colour, pill and label fading in on selection, and out on deselection. */
  selectMs: 180,
  deselectMs: 140,
  /** The vector sequence, once per selection. */
  playMs: 520,
  /** Scale of the tab's icon while a finger is down. */
  pressScale: 0.9,
} as const;

/** The whole icon growing into its selected size. */
export const ICON_POP: TabMotionTrack = {
  prop: 'scale',
  keys: [
    [0, 0.82],
    [0.4, 1.12],
    [0.7, 0.98],
    [1, 1],
  ],
};

/** The highlight pill opening from the middle. */
export const PILL_OPEN: TabMotionTrack = {
  prop: 'scaleX',
  keys: [
    [0, 0.45],
    [0.45, 1.06],
    [0.75, 1],
    [1, 1],
  ],
};

/** The value that leaves a layer exactly as it was drawn. */
export function restValue(prop: TabMotionProp): number {
  return prop === 'translateX' || prop === 'translateY' ? 0 : 1;
}

const SAMPLES_PER_SEGMENT = 6;

/** Ease in and out, flat at both ends so consecutive segments join without a kink. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Turns a track into ranges for `Animated.Value.interpolate`. `unit` scales slides to pixels. */
export function bakeTrack(
  track: TabMotionTrack,
  unit = 1,
): { inputRange: number[]; outputRange: number[] } {
  const factor = restValue(track.prop) === 0 ? unit : 1;
  const inputRange: number[] = [];
  const outputRange: number[] = [];

  track.keys.forEach(([at, value], index) => {
    const previous = track.keys[index - 1];
    if (previous) {
      const [fromAt, fromValue] = previous;
      for (let step = 1; step < SAMPLES_PER_SEGMENT; step += 1) {
        const t = step / SAMPLES_PER_SEGMENT;
        inputRange.push(fromAt + (at - fromAt) * t);
        outputRange.push((fromValue + (value - fromValue) * smoothstep(t)) * factor);
      }
    }
    inputRange.push(at);
    outputRange.push(value * factor);
  });

  return { inputRange, outputRange };
}
