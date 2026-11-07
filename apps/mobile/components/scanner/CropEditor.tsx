/**
 * Corner adjustment: the original photo with the crop outlined, the photo outside it dimmed, and
 * a draggable handle on each corner. Positions are kept in upright photo pixels. The photo is
 * drawn turned by the page's quarter turns plus the straighten dial (`cropView`), so screen
 * points and finger movements are converted through the same turn and scale.
 *
 * While a corner is dragged, a round loupe above the finger shows the photo around that corner
 * magnified (`loupeView`), with a cross-hair on the corner, so it can be put on the paper's
 * edge precisely although the finger covers it.
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
  loupePosition,
  loupeView,
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
/** The loupe: its size on screen, its ring, how much it magnifies, and its gap above the finger. */
const LOUPE_SIZE = 116;
const LOUPE_BORDER = 3;
const LOUPE_ZOOM = 2.5;
const LOUPE_GAP = 40;
/** Half the cross-hair's length. */
const CROSS_HAIR = 9;

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
  /** The corner being dragged, for the loupe. */
  const [active, setActive] = useState<number | null>(null);

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
          setActive(index);
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
        onPanResponderRelease: () => {
          setActive(null);
          onChangeRef.current(draftRef.current);
        },
        onPanResponderTerminate: () => {
          setActive(null);
          onChangeRef.current(draftRef.current);
        },
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

  // The loupe's scene: the same photo and crop, magnified about the dragged corner.
  const loupeInner = LOUPE_SIZE - 2 * LOUPE_BORDER;
  const loupe =
    active !== null
      ? {
          at: loupePosition(shown[active] as Point, box, LOUPE_SIZE, LOUPE_GAP),
          view: loupeView(view, draft[active] as Point, LOUPE_ZOOM, loupeInner / 2),
        }
      : null;

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
      {loupe ? (
        <View pointerEvents="none" style={[styles.loupe, { left: loupe.at.x, top: loupe.at.y }]}>
          <Image
            source={{ uri: photoUri }}
            resizeMode="stretch"
            accessibilityIgnoresInvertColors
            style={[
              styles.photo,
              {
                left: loupe.view.centre.x - (photoSize.width * loupe.view.scale) / 2,
                top: loupe.view.centre.y - (photoSize.height * loupe.view.scale) / 2,
                width: photoSize.width * loupe.view.scale,
                height: photoSize.height * loupe.view.scale,
                transform: [{ rotate: `${loupe.view.degrees}deg` }],
              },
            ]}
          />
          <Svg width={loupeInner} height={loupeInner} style={StyleSheet.absoluteFill}>
            <Polygon
              points={draft
                .map((p) => photoToView(p, loupe.view))
                .map((p) => `${p.x},${p.y}`)
                .join(' ')}
              fill="none"
              stroke={palette.accent}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <Path
              d={`M${loupeInner / 2} ${loupeInner / 2 - CROSS_HAIR}V${loupeInner / 2 + CROSS_HAIR}M${
                loupeInner / 2 - CROSS_HAIR
              } ${loupeInner / 2}H${loupeInner / 2 + CROSS_HAIR}`}
              stroke={palette.handle}
              strokeWidth={1.5}
            />
          </Svg>
        </View>
      ) : null}
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
  loupe: {
    position: 'absolute',
    width: LOUPE_SIZE,
    height: LOUPE_SIZE,
    borderRadius: LOUPE_SIZE / 2,
    borderWidth: LOUPE_BORDER,
    borderColor: palette.handle,
    overflow: 'hidden',
    backgroundColor: palette.background,
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
