/**
 * Corner adjustment: the original photo with the page outline and a draggable handle on each
 * corner. Positions are kept in upright photo pixels; the photo is shown letterboxed ("contain"),
 * so screen points are converted with the same scale and offset.
 */

import { type ComponentType, useMemo, useRef, useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  PanResponder,
  type PanResponderInstance,
  StyleSheet,
  View,
} from 'react-native';
import RawSvg, { Polygon as RawPolygon } from 'react-native-svg';

import { clampPoint, type Point, type Quad, type Size } from '../../lib/scan/geometry';
import { scannerPalette as palette } from './palette';

type SvgComponent = ComponentType<Record<string, unknown>>;
const Svg = RawSvg as unknown as SvgComponent;
const Polygon = RawPolygon as unknown as SvgComponent;

const HANDLE_SIZE = 30;
/** Touch area around each handle, beyond its drawn size. */
const HANDLE_SLOP = 14;

export type CropEditorProps = {
  readonly photoUri: string;
  /** The photo's upright size, in pixels. */
  readonly photoSize: Size;
  readonly quad: Quad;
  readonly cornerLabels: readonly [string, string, string, string];
  readonly onChange: (quad: Quad) => void;
};

type Fit = { readonly scale: number; readonly dx: number; readonly dy: number };

function fitContain(box: Size, content: Size): Fit {
  const scale = Math.min(box.width / content.width, box.height / content.height);
  return {
    scale,
    dx: (box.width - content.width * scale) / 2,
    dy: (box.height - content.height * scale) / 2,
  };
}

export function CropEditor({ photoUri, photoSize, quad, cornerLabels, onChange }: CropEditorProps) {
  const [box, setBox] = useState<Size | null>(null);
  const [draft, setDraft] = useState<Quad>(quad);
  const [lastQuad, setLastQuad] = useState<Quad>(quad);

  // A new quad from outside (another page, a reset) replaces the draft.
  if (quad !== lastQuad) {
    setLastQuad(quad);
    setDraft(quad);
  }

  const fit = box ? fitContain(box, photoSize) : null;
  const fitRef = useRef<Fit | null>(fit);
  fitRef.current = fit;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const responders = useMemo(() => {
    const make = (index: number): PanResponderInstance => {
      let start: Point = { x: 0, y: 0 };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start = draftRef.current[index] as Point;
        },
        onPanResponderMove: (_event, gesture) => {
          const current = fitRef.current;
          if (!current) return;
          const moved = clampPoint(
            { x: start.x + gesture.dx / current.scale, y: start.y + gesture.dy / current.scale },
            photoSize,
          );
          const next = [...draftRef.current] as [Point, Point, Point, Point];
          next[index] = moved;
          setDraft(next);
        },
        onPanResponderRelease: () => onChangeRef.current(draftRef.current),
        onPanResponderTerminate: () => onChangeRef.current(draftRef.current),
      });
    };
    return [make(0), make(1), make(2), make(3)];
  }, [photoSize]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox({ width, height });
  };

  const toScreen = (p: Point): Point =>
    fit ? { x: fit.dx + p.x * fit.scale, y: fit.dy + p.y * fit.scale } : p;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {fit ? (
        <>
          <Image
            source={{ uri: photoUri }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={StyleSheet.absoluteFill}
          />
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Polygon
              points={draft.map((p) => `${toScreen(p).x},${toScreen(p).y}`).join(' ')}
              fill={palette.detectedFill}
              stroke={palette.accent}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          </Svg>
          {draft.map((point, index) => {
            const at = toScreen(point);
            return (
              <View
                key={index}
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={cornerLabels[index]}
                hitSlop={HANDLE_SLOP}
                style={[
                  styles.handle,
                  { left: at.x - HANDLE_SIZE / 2, top: at.y - HANDLE_SIZE / 2 },
                ]}
                {...(responders[index] as PanResponderInstance).panHandlers}
              />
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 3,
    borderColor: palette.accent,
    backgroundColor: palette.handle,
  },
});
