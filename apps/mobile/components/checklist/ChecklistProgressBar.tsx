/** "3 of 5 ready" as a bar. Decorative: the text beside it says the same. */

import { StyleSheet, View } from 'react-native';

import type { ChecklistProgress } from '../../lib/checklist/checklist';
import { homePalette as palette } from '../home/palette';

export function ChecklistProgressBar({ ready, total }: ChecklistProgress) {
  const share = total > 0 ? ready / total : 0;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.track}
    >
      <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: palette.progressTrack,
  },
  fill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.progressFill,
  },
});
