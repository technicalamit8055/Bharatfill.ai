/**
 * A faint outline of the map of India, sitting behind the top-right calligraphy.
 *
 * Deliberately a low-fidelity silhouette: at the size and opacity it renders here it reads as
 * a watermark, not a map, and a simplified path keeps the bundle free of a geo dataset. It is
 * decorative only, so it is hidden from the accessibility tree by the parent.
 *
 * Not a survey-accurate boundary — never reuse this for anything that depicts territory.
 */

import type { ComponentType } from 'react';
import RawSvg, { Path as RawPath } from 'react-native-svg';

/** react-native-svg ships React 18 JSX types; re-cast so React 19 accepts them as elements. */
type SvgComponent = ComponentType<Record<string, unknown>>;

const Svg = RawSvg as unknown as SvgComponent;
const Path = RawPath as unknown as SvgComponent;

/** Simplified national outline, normalised to a 100x110 viewBox. */
const INDIA_PATH =
  'M30 8 C 38 4, 47 6, 54 10 C 60 13, 66 12, 72 10 C 78 8, 84 11, 86 17 ' +
  'C 88 23, 84 28, 79 31 C 74 34, 71 38, 72 44 C 73 50, 78 53, 80 59 ' +
  'C 82 66, 76 71, 70 76 C 63 82, 58 90, 54 99 C 51 105, 47 108, 43 105 ' +
  'C 39 102, 38 96, 36 90 C 33 81, 28 74, 22 68 C 16 62, 11 55, 10 47 ' +
  'C 9 39, 13 32, 18 26 C 23 20, 26 14, 30 8 Z';

export type IndiaOutlineProps = {
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly opacity?: number;
};

export function IndiaOutline({ width, height, color, opacity = 0.18 }: IndiaOutlineProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 100 110" opacity={opacity}>
      <Path d={INDIA_PATH} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}
