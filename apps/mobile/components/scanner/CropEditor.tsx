/**
 * Corner adjustment: the original photo with the crop outlined, the photo outside it dimmed, and
 * a draggable handle on each corner. Positions are kept in upright photo pixels. The photo is
 * drawn turned by the page's quarter turns plus the straighten dial (`cropView`), so screen
 * points and finger movements are converted through the same turn and scale.
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
import RawSvg, { Path as RawPath, Polygon as RawPolygon } from 'react-native-svg';

import {
  clampPoint,
  type CropView,
  cropView,
  type PageRotation,
  type Point,
  photoToView,
  type Quad,
  type Size,
  viewDeltaToPhoto,
} from '../../lib/scan/geometry';
import { scannerPalette as palette } from './palette';

type SvgComponent = ComponentType<Record<string, unknown>>;
const Svg = RawSvg as unknown as SvgComponent;
const Path = RawPath as unknown as SvgComponent;
const Polygon = RawPolygon as unknown as SvgComponent;

const HANDLE_SIZE = 26;
/** Touch area around each handle, beyond its drawn size. */
const HANDLE_SLOP = 18;
/** Room between the photo and the stage's edge, so handles on the photo's edge stay whole. */
const STAGE_INSET = HANDLE_SIZE / 2 + 4;

export type CropEditorProps = {
  readonly photoUri: string;
  /** The photo's upright size, in pixels. */
  readonly photoSize: Size;
  readonly quad: Quad;
  /** The page's quarter turns, clockwise. */
  readonly rotation: PageRotation;
  /** The straighten dial, in degrees clockwise. */
  readonly straighten: number;
  /** Top-left, top-right, bottom-right, bottom-left, as seen on screen. */
  readonly cornerLabels: readonly [string, string, string, string];
  readonly onChange: (quad: Quad) => void;
};

export function CropEditor({
  photoUri,
  photoSize,
  quad,
  rotation,
  straighten,
  cornerLabels,
  onChange,
}: CropEditorProps) {
  const [box, setBox] = useState<Size | null>(null);
  const [draft, setDraft] = useState<Quad>(quad);
  const [lastQuad, setLastQuad] = useState<Quad>(quad);

  // A new quad from outside (another page, a reset, the dial) replaces the draft.
  if (quad !== lastQuad) {
    setLastQuad(quad);
    setDraft(quad);
  }

  const view = box ? cropView(box, photoSize, rotation, straighten, STAGE_INSET) : null;
  const viewRef = useRef<CropView | null>(view);
  viewRef.current = view;
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
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start = draftRef.current[index] as Point;
        },
        onPanResponderMove: (_event, gesture) => {
          const current = viewRef.current;
          if (!current) return;
          const delta = viewDeltaToPhoto({ x: gesture.dx, y: gesture.dy }, current);
          const moved = clampPoint({ x: start.x + delta.x, y: start.y + delta.y }, photoSize);
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

  if (!view || !box) return <View style={styles.root} onLayout={onLayout} />;

  const shown = draft.map((p) => photoToView(p, view));
  const points = shown.map((p) => `${p.x},${p.y}`).join(' ');
  // Everything but the crop: the stage's rectangle with the crop cut out of it.
  const mask = `M0 0H${box.width}V${box.height}H0Z M${shown
    .map((p) => `${p.x} ${p.y}`)
    .join(' L')}Z`;
  const photoWidth = photoSize.width * view.scale;
  const photoHeight = photoSize.height * view.scale;
  // Which on-screen corner each photo corner lands on after the quarter turns.
  const quarterTurns = rotation / 90;

  return (
    <View style={styles.root} onLayout={onLayout}>
      <Image
        source={{ uri: photoUri }}
        resizeMode="stretch"
        accessibilityIgnoresInvertColors
        style={[
          styles.photo,
          {
            left: view.centre.x - photoWidth / 2,
            top: view.centre.y - photoHeight / 2,
            width: photoWidth,
            height: photoHeight,
            transform: [{ rotate: `${view.degrees}deg` }],
          },
        ]}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={mask} fill={palette.cropMask} fillRule="evenodd" />
        <Polygon
          points={points}
          fill="none"
          stroke={palette.accent}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </Svg>
      {shown.map((at, index) => (
        <View
          key={index}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={cornerLabels[(index + quarterTurns) % 4]}
          hitSlop={HANDLE_SLOP}
          style={[styles.handle, { left: at.x - HANDLE_SIZE / 2, top: at.y - HANDLE_SIZE / 2 }]}
          {...(responders[index] as PanResponderInstance).panHandlers}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  photo: {
    position: 'absolute',
  },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    borderWidth: 3,
    borderColor: palette.handle,
    backgroundColor: palette.accent,
  },
});
