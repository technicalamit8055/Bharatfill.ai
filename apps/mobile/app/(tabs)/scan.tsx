/**
 * Scan tab. Tapping Scan in the tab bar opens the full-screen scanner (`app/scanner.tsx`)
 * instead of switching here, so this screen is only reached by a deep link to `/scan` — it
 * offers the same scanner.
 */

import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { useTheme } from '../../theme';

export default function ScanScreen() {
  const { presets } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={presets.screen}>
      <View style={presets.emptyState}>
        <Text style={presets.sectionHeader}>{t('scan.placeholderTitle')}</Text>
        <Text style={[presets.textSecondary, { textAlign: 'center' }]}>
          {t('scan.placeholderBody')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scan.open')}
          onPress={() => router.push('/scanner')}
          style={presets.primaryButton}
        >
          <Text style={presets.primaryButtonLabel}>{t('scan.open')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
