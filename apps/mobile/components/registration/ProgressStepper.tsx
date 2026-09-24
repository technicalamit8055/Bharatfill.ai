/**
 * The numbered registration stepper: circles joined by a line, each with its label below.
 *
 * Steps up to and including `current` are "reached" and drawn in brand blue, along with the
 * line leading into them; the current step also gets a soft halo and a bold label. Later steps
 * are outlined in grey.
 *
 * A screen reader hears the whole stepper as one element ("Step 2 of 4: Profile Details")
 * rather than eight loose numbers and words.
 */

import { StyleSheet, Text, View } from 'react-native';

import { registrationPalette as palette } from './palette';

const CIRCLE_SIZE = 30;
const HALO_WIDTH = 4;

export type ProgressStepperProps = {
  readonly steps: readonly string[];
  /** Zero-based index of the step the citizen is on. */
  readonly current: number;
  readonly accessibilityLabel: string;
};

export function ProgressStepper({ steps, current, accessibilityLabel }: ProgressStepperProps) {
  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
      {steps.map((label, index) => {
        const reached = index <= current;
        const active = index === current;

        return (
          <View key={label} style={styles.step}>
            <View style={styles.track}>
              {/* The line runs centre to centre: each step draws its own two halves. */}
              {index > 0 ? (
                <View style={[styles.connector, styles.connectorLeft, reached && styles.reached]} />
              ) : null}
              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.connector,
                    styles.connectorRight,
                    index < current && styles.reached,
                  ]}
                />
              ) : null}

              <View style={[styles.halo, active && styles.haloActive]}>
                <View style={[styles.circle, reached ? styles.reached : styles.circleUpcoming]}>
                  <Text style={[styles.number, reached && styles.numberReached]}>{index + 1}</Text>
                </View>
              </View>
            </View>

            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  step: {
    flex: 1,
    alignItems: 'center',
  },
  track: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    height: CIRCLE_SIZE + HALO_WIDTH * 2,
  },
  connector: {
    position: 'absolute',
    top: CIRCLE_SIZE / 2 + HALO_WIDTH - 1,
    height: 2,
    width: '50%',
    backgroundColor: palette.stepConnector,
  },
  connectorLeft: {
    left: 0,
  },
  connectorRight: {
    right: 0,
  },
  halo: {
    padding: HALO_WIDTH,
    borderRadius: CIRCLE_SIZE,
  },
  haloActive: {
    backgroundColor: palette.stepActiveHalo,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleUpcoming: {
    borderWidth: 1.5,
    borderColor: palette.stepUpcomingBorder,
    backgroundColor: palette.stepUpcomingSurface,
  },
  reached: {
    backgroundColor: palette.stepReached,
  },
  number: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.stepUpcomingNumber,
  },
  numberReached: {
    color: palette.stepReachedNumber,
  },
  label: {
    marginTop: 4,
    paddingHorizontal: 2,
    fontSize: 12.5,
    lineHeight: 16,
    textAlign: 'center',
    color: palette.textMuted,
  },
  labelActive: {
    fontWeight: '700',
    color: palette.textPrimary,
  },
});
