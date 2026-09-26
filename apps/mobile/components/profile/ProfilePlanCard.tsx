/**
 * The plan card: a crown badge, the plan's name and pitch, and an Upgrade button.
 *
 * Plans are not in the citizen app spec, so the route only passes one in development builds and
 * Upgrade says it is not live yet.
 */

import { Crown } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { ProfilePlan } from '../../lib/profile/profile-screen';
import { profilePalette as palette } from './palette';

const BADGE_SIZE = 64;

export type ProfilePlanCardProps = {
  readonly plan: ProfilePlan;
  readonly onUpgrade: () => void;
};

export function ProfilePlanCard({ plan, onUpgrade }: ProfilePlanCardProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.badge}>
        <Crown color={palette.planIcon} fill={palette.planIcon} size={30} strokeWidth={2} />
      </View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {t(`profile.plan.${plan}.title`)}
        </Text>
        <Text numberOfLines={3} style={styles.body}>
          {t(`profile.plan.${plan}.body`)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('profile.plan.upgrade')}
        onPress={onUpgrade}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text numberOfLines={1} style={styles.buttonLabel}>
          {t('profile.plan.upgrade')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.planBorder,
    backgroundColor: palette.planSurface,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.planBadge,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 17.5,
    lineHeight: 23,
    fontWeight: '800',
    color: palette.heading,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  buttonPressed: {
    backgroundColor: palette.brandBluePressed,
  },
  buttonLabel: {
    fontSize: 15.5,
    fontWeight: '700',
    color: palette.onBrand,
  },
});
