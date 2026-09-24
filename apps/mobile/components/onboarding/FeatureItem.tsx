/**
 * One row of the onboarding feature list: a pastel icon badge beside a title and one line of
 * supporting copy. The row is read as a single element by screen readers; the icon is
 * decorative.
 */

import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { onboardingPalette } from './palette';

const BADGE_SIZE = 46;

export type FeatureItemProps = {
  readonly icon: LucideIcon;
  readonly color: string;
  readonly surface: string;
  readonly title: string;
  readonly body: string;
};

export function FeatureItem({ icon: Icon, color, surface, title, body }: FeatureItemProps) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={[styles.badge, { backgroundColor: surface }]}>
        <Icon color={color} size={22} strokeWidth={2.2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    color: onboardingPalette.textPrimary,
  },
  body: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 15,
    color: onboardingPalette.textSecondary,
  },
});
