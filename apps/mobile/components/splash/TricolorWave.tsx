/**
 * The flowing tricolour ribbon that closes the splash screen.
 *
 * Drawn as bezier curves rather than shipped as an image so it re-flows to any device width
 * without banding, and so the three bands stay exactly on the brand hexes. The SVG is sized in
 * a fixed 400x120 viewBox and stretched by the parent — `preserveAspectRatio="none"` is
 * deliberate here, since the ribbon is decorative and distortion reads as a wider sweep.
 *
 * react-native-svg's components are cast through `SvgComponent` because its bundled types are
 * still authored against React 18's JSX namespace; under React 19 the raw imports resolve to
 * `JSX.Element` in a way TypeScript will not accept as a valid element type.
 */

import type { ComponentType } from 'react';
import RawSvg, { Defs as RawDefs, LinearGradient as RawLinearGradient, Path as RawPath, Stop as RawStop } from 'react-native-svg';

import { splashPalette } from './palette';

/** react-native-svg ships React 18 JSX types; re-cast so React 19 accepts them as elements. */
type SvgComponent = ComponentType<Record<string, unknown>>;

const Svg = RawSvg as unknown as SvgComponent;
const Defs = RawDefs as unknown as SvgComponent;
const LinearGradient = RawLinearGradient as unknown as SvgComponent;
const Path = RawPath as unknown as SvgComponent;
const Stop = RawStop as unknown as SvgComponent;

export type TricolorWaveProps = {
  readonly width: number;
  readonly height: number;
};

export function TricolorWave({ width, height }: TricolorWaveProps) {
  return (
    <Svg width={width} height={height} viewBox="0 0 400 120" preserveAspectRatio="none">
      <Defs>
        {/* Saffron sweeping up from the left, fading before it reaches centre. */}
        <LinearGradient id="saffron" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={splashPalette.saffron} stopOpacity="1" />
          <Stop offset="0.55" stopColor={splashPalette.saffron} stopOpacity="0.55" />
          <Stop offset="1" stopColor={splashPalette.saffron} stopOpacity="0" />
        </LinearGradient>

        {/* Green sweeping in from the right, mirrored against the saffron. */}
        <LinearGradient id="green" x1="1" y1="0" x2="0" y2="0">
          <Stop offset="0" stopColor={splashPalette.green} stopOpacity="1" />
          <Stop offset="0.5" stopColor={splashPalette.green} stopOpacity="0.6" />
          <Stop offset="1" stopColor={splashPalette.green} stopOpacity="0" />
        </LinearGradient>

        {/* The soft white band that separates the two, standing in for the chakra stripe. */}
        <LinearGradient id="centre" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.15" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.15" />
        </LinearGradient>
      </Defs>

      {/* Back band — the deepest sweep, anchoring the ribbon to the bottom edge. */}
      <Path
        d="M0 58 C 70 20, 150 92, 230 62 C 300 36, 350 58, 400 44 L400 120 L0 120 Z"
        fill="url(#green)"
      />

      {/* Middle white glow, offset a few points so both colours stay visible behind it. */}
      <Path
        d="M0 70 C 80 34, 160 100, 240 72 C 310 48, 355 68, 400 56 L400 120 L0 120 Z"
        fill="url(#centre)"
      />

      {/* Front saffron crest, the highest point on the left of the ribbon. */}
      <Path
        d="M0 62 C 60 30, 130 96, 210 78 C 290 60, 340 84, 400 74 L400 120 L0 120 Z"
        fill="url(#saffron)"
      />
    </Svg>
  );
}
