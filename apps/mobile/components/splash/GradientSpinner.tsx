/**
 * The loading ring under the wordmark.
 *
 * React Native has no conic gradient, so the "gradient ring" is built as a full-circle track
 * with a partial arc stroked over it: a dash pattern exposes roughly 70% of the circumference,
 * and a two-stop linear gradient along the arc fades its tail out. Rotating the whole SVG then
 * reads as a gradient chasing its own tail.
 *
 * The animation runs on the native driver, so it keeps spinning smoothly while the JS thread
 * is busy doing the startup work the splash is covering for.
 */

import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import { Animated, Easing } from 'react-native';
import RawSvg, { Circle as RawCircle, Defs as RawDefs, LinearGradient as RawLinearGradient, Stop as RawStop } from 'react-native-svg';

import { splashPalette } from './palette';

/** react-native-svg ships React 18 JSX types; re-cast so React 19 accepts them as elements. */
type SvgComponent = ComponentType<Record<string, unknown>>;

const Svg = RawSvg as unknown as SvgComponent;
const Circle = RawCircle as unknown as SvgComponent;
const Defs = RawDefs as unknown as SvgComponent;
const LinearGradient = RawLinearGradient as unknown as SvgComponent;
const Stop = RawStop as unknown as SvgComponent;

const AnimatedSvg = Animated.createAnimatedComponent(
  Svg as ComponentType<Record<string, unknown>>,
);

const SIZE = 46;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Fraction of the ring the moving arc covers. */
const ARC_SWEEP = 0.7;

export type GradientSpinnerProps = {
  /** Milliseconds for one full rotation. */
  readonly durationMs?: number;
};

export function GradientSpinner({ durationMs = 1100 }: GradientSpinnerProps) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, durationMs]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <AnimatedSvg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ transform: [{ rotate }] }}
      accessibilityRole="progressbar"
    >
      <Defs>
        <LinearGradient id="spinnerArc" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={splashPalette.spinnerArc} stopOpacity="1" />
          <Stop offset="1" stopColor={splashPalette.spinnerArc} stopOpacity="0.1" />
        </LinearGradient>
      </Defs>

      {/* Static track the arc travels over. */}
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        stroke={splashPalette.spinnerTrack}
        strokeWidth={STROKE}
        fill="none"
      />

      {/* The moving arc — dash on for ARC_SWEEP, off for the remainder. */}
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        stroke="url(#spinnerArc)"
        strokeWidth={STROKE}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${CIRCUMFERENCE * ARC_SWEEP} ${CIRCUMFERENCE}`}
      />
    </AnimatedSvg>
  );
}
