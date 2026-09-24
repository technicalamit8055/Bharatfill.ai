/**
 * The faint blue swoosh that sits behind the onboarding footer.
 *
 * Paths are taken from `assets/onboarding/bottom-wave.svg` (375x120) and stretched to the
 * screen width, so the curve keeps its shape on any handset. Decorative only.
 */

import type { ComponentType } from 'react';
import RawSvg, { Path as RawPath } from 'react-native-svg';

import { onboardingPalette } from './palette';

/** react-native-svg ships React 18 JSX types; re-cast so React 19 accepts them as elements. */
type SvgComponent = ComponentType<Record<string, unknown>>;

const Svg = RawSvg as unknown as SvgComponent;
const Path = RawPath as unknown as SvgComponent;

const BACK_PATH = 'M0 45C60 15 150 5 210 25C270 45 330 65 375 55V120H0V45Z';
const FRONT_PATH = 'M0 65C80 35 180 30 260 55C320 75 350 70 375 60V120H0V65Z';

export type BottomWaveProps = {
  readonly width: number;
  readonly height: number;
};

export function BottomWave({ width, height }: BottomWaveProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 375 120" preserveAspectRatio="none">
      <Path d={BACK_PATH} fill={onboardingPalette.waveBack} />
      <Path d={FRONT_PATH} fill={onboardingPalette.waveFront} fillOpacity={0.6} />
    </Svg>
  );
}
