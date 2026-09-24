/**
 * Mars (♂) and Venus (♀) glyphs for the gender choices, drawn to lucide's `mars` and `venus`
 * geometry. Those two icons arrived in lucide after the pinned `lucide-react-native` 0.453,
 * so they are inlined here rather than bumping the dependency for two paths.
 */

import Svg, { Circle, Path } from 'react-native-svg';

type GlyphProps = {
  readonly color: string;
  readonly size?: number;
  readonly strokeWidth?: number;
};

export function MarsIcon({ color, size = 24, strokeWidth = 2 }: GlyphProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M16 3h5v5" />
      <Path d="m21 3-6.75 6.75" />
      <Circle cx="10" cy="14" r="6" />
    </Svg>
  );
}

export function VenusIcon({ color, size = 24, strokeWidth = 2 }: GlyphProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 15v7" />
      <Path d="M9 19h6" />
      <Circle cx="12" cy="9" r="6" />
    </Svg>
  );
}
