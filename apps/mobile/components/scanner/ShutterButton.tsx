/**
 * The round shutter. In auto-capture mode a ring fills around it while the page is held steady,
 * and the photo is taken when it closes.
 */

import type { ComponentType } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import RawSvg, { Circle as RawCircle } from 'react-native-svg';

import { scannerPalette as palette } from './palette';

type SvgComponent = ComponentType<Record<string, unknown>>;
const Svg = RawSvg as unknown as SvgComponent;
const Circle = RawCircle as unknown as SvgComponent;

const SIZE = 88;
const RING = 4;
const RADIUS = (SIZE - RING) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type ShutterButtonProps = {
  readonly label: string;
  /** 0–1: how close auto-capture is to firing. */
  readonly progress: number;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
};

export function ShutterButton({ label, progress, busy, disabled, onPress }: ShutterButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={styles.root}
    >
      {({ pressed }) => (
        <>
          <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={palette.shutterRing}
              strokeWidth={RING}
              fill="none"
            />
            {progress > 0 ? (
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                stroke={palette.shutterProgress}
                strokeWidth={RING}
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, progress))}
                fill="none"
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            ) : null}
          </Svg>
          <View style={[styles.shutter, pressed && styles.shutterPressed]}>
            {busy ? <ActivityIndicator color={palette.shutterBusy} /> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
  },
  shutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.shutterFill,
  },
  shutterPressed: {
    backgroundColor: palette.shutterPressed,
    transform: [{ scale: 0.94 }],
  },
});
