/**
 * A soft-3D BharatDoc icon for a main tile. Purely decorative: the tile around it carries the
 * label, so the icon is hidden from screen readers.
 *
 * The artwork is generated; edit `scripts/generate-art-icons.mjs`, not the data. For arrows,
 * close buttons, settings rows, long lists and the tab bar use a line icon instead.
 */

import { type ComponentType, type ReactNode, useId } from 'react';
import { View } from 'react-native';
import RawSvg, {
  Defs as RawDefs,
  LinearGradient as RawLinearGradient,
  Path as RawPath,
  Stop as RawStop,
} from 'react-native-svg';

import { ART_ICON_CANVAS, ART_ICONS, type ArtIconName } from './art-icons.generated';
import type { ArtIconArt, ArtPaint } from './types';

/** react-native-svg ships React 18 JSX types; re-cast so React 19 accepts them as elements. */
type SvgComponent = ComponentType<Record<string, unknown> & { children?: ReactNode }>;
const Svg = RawSvg as unknown as SvgComponent;
const Defs = RawDefs as unknown as SvgComponent;
const LinearGradient = RawLinearGradient as unknown as SvgComponent;
const Path = RawPath as unknown as SvgComponent;
const Stop = RawStop as unknown as SvgComponent;

export type ArtIconProps = {
  readonly name: ArtIconName;
  /** Width and height; the artwork is drawn to read from 24 up. */
  readonly size?: number;
};

export function ArtIcon({ name, size = 32 }: ArtIconProps) {
  // Two copies of an icon on one screen must not share gradient ids. `useId` is unique per
  // copy; its punctuation is not safe inside `url(#…)`.
  const prefix = `art-${name}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const art: ArtIconArt = ART_ICONS[name];
  const paint = (value: ArtPaint | undefined) =>
    value === undefined ? 'none' : value.startsWith('#') ? value : `url(#${prefix}-${value})`;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${ART_ICON_CANVAS} ${ART_ICON_CANVAS}`}>
        <Defs>
          {art.gradients.map(([from, to], index) => (
            <LinearGradient key={index} id={`${prefix}-g${index}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          ))}
        </Defs>
        {art.shapes.map((shape, index) => (
          <Path
            key={index}
            d={shape.d}
            fill={paint(shape.fill)}
            stroke={paint(shape.stroke)}
            strokeWidth={shape.strokeWidth ?? 0}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={shape.opacity ?? 1}
          />
        ))}
      </Svg>
    </View>
  );
}
