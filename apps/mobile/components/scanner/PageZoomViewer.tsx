/**
 * The processed page full screen, for checking the scan up close. Pinch to zoom (1× to 5×) about
 * the fingers, drag to pan a zoomed page, double-tap to zoom in on a spot or back out. Zoom In /
 * Out buttons do the same for one-handed and screen-reader use.
 *
 * Built on `PanResponder` and `Animated` from React Native itself, so no gesture library is
 * needed; transforms run on the native driver.
 */

import { StatusBar } from 'expo-status-bar';
import { type LucideIcon, X, ZoomIn, ZoomOut } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Modal,
  type NativeTouchEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { fitContain, type Point, type Size } from '../../lib/scan/geometry';
import { scanReviewPalette as palette } from './palette';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
/** How far a pinch may go past the limits before it springs back. */
const OVERSHOOT = 0.15;
const DOUBLE_TAP_ZOOM = 2.5;
const BUTTON_STEP = 1.6;
const DOUBLE_TAP_MS = 280;
const TAP_MS = 220;
/** Movement, in points, beyond which a touch is a drag rather than a tap. */
const TAP_SLOP = 10;

type Transform = { readonly zoom: number; readonly x: number; readonly y: number };
const IDENTITY: Transform = { zoom: 1, x: 0, y: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function spread(touches: readonly NativeTouchEvent[]): { mid: Point; distance: number } {
  const [a, b] = touches as [NativeTouchEvent, NativeTouchEvent];
  return {
    mid: { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 },
    distance: Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)),
  };
}

export type PageZoomViewerProps = {
  readonly uri: string;
  readonly size: Size;
  readonly label: string;
  readonly onClose: () => void;
};

export function PageZoomViewer({ uri, size, label, onClose }: PageZoomViewerProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [screen, setScreen] = useState<Size>({ width: window.width, height: window.height });

  // The page fits the safe area at 1×, centred in it.
  const viewport = {
    width: screen.width,
    height: Math.max(0, screen.height - insets.top - insets.bottom),
  };
  const fit = fitContain(viewport, size);
  const base = { width: size.width * fit.scale, height: size.height * fit.scale };
  const centre = { x: screen.width / 2, y: insets.top + viewport.height / 2 };

  const zoom = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const transform = useRef<Transform>(IDENTITY);

  // Layout the gesture handlers read without being rebuilt.
  const layout = useRef({ base, viewport, centre });
  layout.current = { base, viewport, centre };

  /** Keeps a zoomed page covering the screen: no panning past its edges. */
  const bounded = (next: Transform): Transform => {
    const { base: page, viewport: area } = layout.current;
    const maxX = Math.max(0, (page.width * next.zoom - area.width) / 2);
    const maxY = Math.max(0, (page.height * next.zoom - area.height) / 2);
    return { zoom: next.zoom, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  };

  const show = (next: Transform) => {
    transform.current = next;
    zoom.setValue(next.zoom);
    pan.setValue({ x: next.x, y: next.y });
  };

  const animateTo = (next: Transform) => {
    transform.current = next;
    Animated.parallel([
      Animated.spring(zoom, { toValue: next.zoom, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(pan, {
        toValue: { x: next.x, y: next.y },
        useNativeDriver: true,
        bounciness: 0,
      }),
    ]).start();
  };

  /** Zooms to `level`, keeping the page point under `focus` (a screen point) where it is. */
  const zoomAbout = (level: number, focus: Point): Transform => {
    const { centre: middle } = layout.current;
    const now = transform.current;
    const anchor = {
      x: (focus.x - middle.x - now.x) / now.zoom,
      y: (focus.y - middle.y - now.y) / now.zoom,
    };
    return bounded({
      zoom: level,
      x: focus.x - middle.x - level * anchor.x,
      y: focus.y - middle.y - level * anchor.y,
    });
  };

  const responder = useMemo(() => {
    // Where the current gesture started from; reset whenever a finger is added or lifted.
    let start = { transform: IDENTITY, touches: 0, mid: { x: 0, y: 0 }, distance: 1 };
    let anchor: Point = { x: 0, y: 0 };
    let moved = false;
    let pinched = false;
    let downAt = 0;
    let lastTapAt = 0;

    const begin = (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches;
      const now = transform.current;
      if (touches.length >= 2) {
        const { mid, distance } = spread(touches);
        const { centre: middle } = layout.current;
        start = { transform: now, touches: touches.length, mid, distance };
        anchor = {
          x: (mid.x - middle.x - now.x) / now.zoom,
          y: (mid.y - middle.y - now.y) / now.zoom,
        };
      } else {
        const touch = touches[0];
        start = {
          transform: now,
          touches: touches.length,
          mid: { x: touch?.pageX ?? 0, y: touch?.pageY ?? 0 },
          distance: 1,
        };
      }
    };

    const finish = () => {
      const now = transform.current;
      if (now.zoom < MIN_ZOOM) animateTo(IDENTITY);
      else if (now.zoom > MAX_ZOOM) animateTo(zoomAbout(MAX_ZOOM, layout.current.centre));
      else animateTo(bounded(now));
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        moved = false;
        pinched = false;
        downAt = Date.now();
        begin(event);
      },
      onPanResponderMove: (event) => {
        const touches = event.nativeEvent.touches;
        if (touches.length !== start.touches) begin(event);

        if (touches.length >= 2) {
          pinched = true;
          moved = true;
          const { mid, distance } = spread(touches);
          const { centre: middle } = layout.current;
          const level = clamp(
            start.transform.zoom * (distance / start.distance),
            MIN_ZOOM - OVERSHOOT,
            MAX_ZOOM + OVERSHOOT,
          );
          // The page point that was under the fingers stays under them.
          show(
            bounded({
              zoom: level,
              x: mid.x - middle.x - level * anchor.x,
              y: mid.y - middle.y - level * anchor.y,
            }),
          );
          return;
        }

        const touch = touches[0];
        if (!touch) return;
        const dx = touch.pageX - start.mid.x;
        const dy = touch.pageY - start.mid.y;
        if (Math.hypot(dx, dy) > TAP_SLOP) moved = true;
        if (transform.current.zoom > MIN_ZOOM) {
          show(
            bounded({
              zoom: start.transform.zoom,
              x: start.transform.x + dx,
              y: start.transform.y + dy,
            }),
          );
        }
      },
      onPanResponderRelease: (event) => {
        const now = Date.now();
        if (!moved && !pinched && now - downAt < TAP_MS) {
          if (now - lastTapAt < DOUBLE_TAP_MS) {
            lastTapAt = 0;
            const focus = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
            animateTo(
              transform.current.zoom > MIN_ZOOM + 0.05
                ? IDENTITY
                : zoomAbout(DOUBLE_TAP_ZOOM, focus),
            );
            return;
          }
          lastTapAt = now;
        }
        finish();
      },
      onPanResponderTerminate: finish,
    });
    // Built once: the handlers read the layout and the transform through refs.
  }, []);

  const step = (factor: number) => {
    const level = clamp(transform.current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    animateTo(level === MIN_ZOOM ? IDENTITY : zoomAbout(level, layout.current.centre));
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setScreen({ width, height });
  };

  return (
    <Modal
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root} onLayout={onLayout}>
        <StatusBar style="light" />
        <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
          <Animated.Image
            source={{ uri }}
            resizeMode="contain"
            accessibilityLabel={label}
            accessibilityIgnoresInvertColors
            style={[
              styles.page,
              {
                left: centre.x - base.width / 2,
                top: centre.y - base.height / 2,
                width: base.width,
                height: base.height,
                transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: zoom }],
              },
            ]}
          />
        </View>

        <View style={[styles.bar, { top: insets.top + 12 }]} pointerEvents="box-none">
          <ZoomControl icon={X} label={t('scanReview.zoomClose')} onPress={onClose} />
          <View style={styles.steps}>
            <ZoomControl
              icon={ZoomOut}
              label={t('scanReview.zoomOut')}
              onPress={() => step(1 / BUTTON_STEP)}
            />
            <ZoomControl
              icon={ZoomIn}
              label={t('scanReview.zoomIn')}
              onPress={() => step(BUTTON_STEP)}
            />
          </View>
        </View>

        <View
          pointerEvents="none"
          style={[styles.hint, { bottom: insets.bottom + 20 }]}
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={styles.hintLabel}>{t('scanReview.zoomHint')}</Text>
        </View>
      </View>
    </Modal>
  );
}

function ZoomControl({
  icon: Icon,
  label,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.control, pressed && styles.pressed]}
    >
      <Icon color={palette.onStage} size={24} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: palette.zoomBackdrop,
  },
  page: {
    position: 'absolute',
  },
  pressed: {
    opacity: 0.6,
  },
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  steps: {
    flexDirection: 'row',
    gap: 10,
  },
  control: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.zoomControl,
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: palette.zoomHint,
  },
  hintLabel: {
    fontSize: 13,
    color: palette.onZoomHint,
  },
});
