/**
 * Scan — placeholder for the ML Kit document scanner (spec §3 Feature 1).
 */

import { Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { useTheme } from '../../theme';

export default function ScanScreen() {
  const { presets } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={presets.screen}>
      <View style={presets.emptyState}>
        <Text style={presets.sectionHeader}>{t('scan.placeholderTitle')}</Text>
        <Text style={[presets.textSecondary, { textAlign: 'center' }]}>
          {t('scan.placeholderBody')}
        </Text>
      </View>
    </View>
  );
}
