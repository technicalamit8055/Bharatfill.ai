/**
 * A tab icon's two looks: the still outline (`TabIconOutline`) and the filled layers that play
 * the icon's sequence on the native driver (`TabIconLayers`).
 */

import type { ComponentType, ReactNode } from 'react';
import { Animated, StyleSheet } from 'react-native';
import RawSvg, { Path as RawPath } from 'react-native-svg';

import {
  TAB_ICON_CANVAS,
  TAB_ICONS,
  type TabIconLayer,
  type TabIconName,
  type TabIconPaint,
} from './tab-icons';
import { bakeTrack, ICON_POP, type TabMotionTrack } from './tab-motion';

/** react-native-svg ships React 18 JSX types; re-cast so React 19 accepts them as elements. */
type SvgComponent = ComponentType<Record<string, unknown> & { children?: ReactNode }>;
const Svg = RawSvg as unknown as SvgComponent;
const Path = RawPath as unknown as SvgComponent;

const VIEW_BOX = `0 0 ${TAB_ICON_CANVAS} ${TAB_ICON_CANVAS}`;
const OUTLINE_STROKE = 2;
const LAYER_STROKE = 2.2;

export type TabIconColors = Readonly<Record<TabIconPaint, string>>;

type TabIconProps = {
  readonly name: TabIconName;
  readonly size: number;
};

/** The unselected look: one line drawing, no motion. */
export function TabIconOutline({ name, size, color }: TabIconProps & { readonly color: string }) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      {TAB_ICONS[name].outline.map((d) => (
        <Path
          key={d}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={OUTLINE_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/** The selected look. `play` runs 0 to 1 through the icon's sequence; 1 is the finished icon. */
export function TabIconLayers({
  name,
  size,
  colors,
  play,
  pop = true,
}: TabIconProps & {
  readonly colors: TabIconColors;
  readonly play: Animated.Value;
  /** Grow into place. Off for an icon already on screen, which would jump to the small start. */
  readonly pop?: boolean;
}) {
  const unit = size / TAB_ICON_CANVAS;

  return (
    <Animated.View
      style={{ width: size, height: size, transform: pop ? [animate(play, ICON_POP, unit)] : [] }}
    >
      {TAB_ICONS[name].layers.map((layer, index) => (
        <Animated.View key={index} style={layerStyle(layer, play, unit)}>
          <Svg width={size} height={size} viewBox={VIEW_BOX}>
            {layer.paths.map((d) => (
              <Path
                key={d}
                d={d}
                fill={layer.fill ? colors[layer.fill] : 'none'}
                stroke={layer.stroke ? colors[layer.stroke] : 'none'}
                strokeWidth={layer.stroke ? LAYER_STROKE : 0}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

type AnimatedTransform = Extract<Animated.WithAnimatedValue<{ scale: number }>, { scale: unknown }>;

/** One entry of a `transform` array. */
function animate(play: Animated.Value, track: TabMotionTrack, unit: number): AnimatedTransform {
  // TypeScript cannot narrow a computed key to one of the transform shapes.
  return {
    [track.prop]: play.interpolate({ ...bakeTrack(track, unit), extrapolate: 'clamp' }),
  } as unknown as AnimatedTransform;
}

function layerStyle(layer: TabIconLayer, play: Animated.Value, unit: number) {
  return [
    StyleSheet.absoluteFill,
    layer.origin && { transformOrigin: [layer.origin[0] * unit, layer.origin[1] * unit, 0] },
    { transform: (layer.motion ?? []).map((track) => animate(play, track, unit)) },
  ];
}
