/**
 * Drawn over the live camera: the detected page's outline with a corner mark at each corner, or,
 * while no page is in view, the static guide brackets from the mockup.
 */

import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import RawSvg, { Circle as RawCircle, Polygon as RawPolygon } from 'react-native-svg';

import type { Quad } from '../../lib/scan/geometry';
import { scannerPalette as palette } from './palette';

/** react-native-svg ships React 18 JSX types; re-cast so React 19 accepts them as elements. */
type SvgComponent = ComponentType<Record<string, unknown>>;
const Svg = RawSvg as unknown as SvgComponent;
const Polygon = RawPolygon as unknown as SvgComponent;
const Circle = RawCircle as unknown as SvgComponent;

export function ScanOverlay({ outline }: { readonly outline: Quad | null }) {
  if (!outline) return <GuideFrame />;

  const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Polygon
          points={points}
          fill={palette.detectedFill}
          stroke={palette.accent}
          strokeWidth={3}
          strokeLinejoin="round"
        />
        {outline.map((p, index) => (
          <Circle
            key={index}
            cx={p.x}
            cy={p.y}
            r={9}
            fill={palette.textPrimary}
            stroke={palette.accent}
            strokeWidth={3}
          />
        ))}
      </Svg>
    </View>
  );
}

const CORNER_SIZE = 46;
const CORNER_WIDTH = 5;

/** The mockup's four glowing brackets, shown while the camera looks for a page. */
function GuideFrame() {
  return (
    <View style={styles.guideArea} pointerEvents="none">
      <View style={styles.guide}>
        <View style={[styles.corner, styles.cornerTopLeft]} />
        <View style={[styles.corner, styles.cornerTopRight]} />
        <View style={[styles.corner, styles.cornerBottomLeft]} />
        <View style={[styles.corner, styles.cornerBottomRight]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  guideArea: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: {
    width: '78%',
    aspectRatio: 0.78,
    maxHeight: '52%',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: palette.accent,
    shadowColor: palette.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: 18,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: 18,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: 18,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: 18,
  },
});
