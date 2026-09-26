/**
 * The crop editor's straighten dial: a ruler of degrees, −45° to 45°, that slides under a fixed
 * centre mark as the citizen drags it sideways. The angle shows above the mark; tapping it puts
 * the page back to 0°. Screen readers adjust it a degree at a time.
 */

import { useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MAX_STRAIGHTEN } from '../../lib/scan/geometry';
import { scanReviewPalette as palette } from './palette';

/** Ruler width per degree, in points. */
const STEP = 4;
/** Within this of 0°, a drag lands exactly on 0°. */
const SNAP = 0.4;
const TICKS = Array.from({ length: MAX_STRAIGHTEN * 2 + 1 }, (_, i) => i - MAX_STRAIGHTEN);

function settle(value: number): number {
  const clamped = Math.min(MAX_STRAIGHTEN, Math.max(-MAX_STRAIGHTEN, value));
  return Math.abs(clamped) < SNAP ? 0 : Math.round(clamped * 10) / 10;
}

export function formatDegrees(value: number): string {
  return `${value.toFixed(1)}°`;
}

export type StraightenDialProps = {
  readonly value: number;
  readonly label: string;
  readonly resetLabel: string;
  readonly onChange: (degrees: number) => void;
};

export function StraightenDial({ value, label, resetLabel, onChange }: StraightenDialProps) {
  const [width, setWidth] = useState(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const responder = useMemo(() => {
    let start = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start = valueRef.current;
      },
      onPanResponderMove: (_event, gesture) => {
        // Dragging the ruler left brings the higher degrees to the centre mark.
        const next = settle(start - gesture.dx / STEP);
        if (next !== valueRef.current) onChangeRef.current(next);
      },
    });
  }, []);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  // Degree 0 sits at the centre mark when the value is 0.
  const offset = width / 2 - (value + MAX_STRAIGHTEN) * STEP;

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={resetLabel}
        accessibilityState={{ disabled: value === 0 }}
        disabled={value === 0}
        hitSlop={8}
        onPress={() => onChange(0)}
        style={({ pressed }) => [styles.value, pressed && styles.pressed]}
      >
        <Text style={styles.valueLabel}>{formatDegrees(value)}</Text>
      </Pressable>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: formatDegrees(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const change = event.nativeEvent.actionName === 'increment' ? 1 : -1;
          onChange(settle(Math.round(value) + change));
        }}
        onLayout={onLayout}
        style={styles.ruler}
        {...responder.panHandlers}
      >
        {width > 0
          ? TICKS.map((degree) => {
              const major = degree % 15 === 0;
              const medium = degree % 5 === 0;
              const left = offset + (degree + MAX_STRAIGHTEN) * STEP;
              if (left < -20 || left > width + 20) return null;
              return (
                <View key={degree} pointerEvents="none" style={[styles.tickSlot, { left }]}>
                  <View
                    style={[styles.tick, medium && styles.tickMedium, major && styles.tickMajor]}
                  />
                  {major ? <Text style={styles.tickLabel}>{degree}°</Text> : null}
                </View>
              );
            })
          : null}
        <View pointerEvents="none" style={[styles.mark, { left: width / 2 - 1 }]} />
      </View>
    </View>
  );
}

const RULER_HEIGHT = 44;
const LABEL_WIDTH = 32;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  pressed: {
    opacity: 0.6,
  },
  value: {
    minWidth: 64,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: palette.dialValueSurface,
  },
  valueLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: palette.dialValue,
  },
  ruler: {
    alignSelf: 'stretch',
    height: RULER_HEIGHT,
    overflow: 'hidden',
  },
  tickSlot: {
    position: 'absolute',
    top: 0,
    width: LABEL_WIDTH,
    marginLeft: -LABEL_WIDTH / 2,
    alignItems: 'center',
  },
  tick: {
    marginTop: 8,
    width: 1.5,
    height: 6,
    borderRadius: 1,
    backgroundColor: palette.dialTick,
  },
  tickMedium: {
    marginTop: 6,
    height: 10,
  },
  tickMajor: {
    marginTop: 4,
    width: 2,
    height: 14,
    backgroundColor: palette.dialTickMajor,
  },
  tickLabel: {
    marginTop: 4,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    color: palette.dialLabel,
  },
  mark: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 22,
    borderRadius: 1,
    backgroundColor: palette.brandBlue,
  },
});
