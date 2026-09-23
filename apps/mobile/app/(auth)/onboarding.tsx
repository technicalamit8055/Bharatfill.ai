/**
 * Onboarding — placeholder.
 *
 * The splash navigates here, so the route has to exist or the hand-off dead-ends. The real
 * onboarding flow (language choice, vault explainer, consent) is not in scope yet; this keeps
 * the navigation graph honest and gives the citizen a way into the app in the meantime.
 */

import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { spacing, useTheme } from '../../theme';

export default function OnboardingScreen() {
  const { presets } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={[presets.screen, { justifyContent: 'center', padding: spacing.xl }]}>
      <Text style={presets.sectionHeader}>{t('app.name')}</Text>
      <Text style={[presets.textSecondary, { marginTop: spacing.sm }]}>{t('app.tagline')}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.continue')}
        style={[presets.primaryButton, { marginTop: spacing.xl }]}
        onPress={() => router.replace('/(tabs)')}
      >
        <Text style={presets.primaryButtonLabel}>{t('onboarding.continue')}</Text>
      </Pressable>
    </View>
  );
}
