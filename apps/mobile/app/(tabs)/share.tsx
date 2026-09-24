/**
 * Share — placeholder for sharing documents with a Cyber Cafe / CSC operator and controlling
 * their access (spec §3 Features 3 and 4).
 *
 * Nothing is shared from here yet: what an operator can see, and how the citizen approves it,
 * is a privacy decision still to be made. No citizen data is read or sent.
 */

import { Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { useTheme } from '../../theme';

export default function ShareScreen() {
  const { presets } = useTheme();
  const { t } = useTranslation();

  return (
    <View style={presets.screen}>
      <View style={presets.emptyState}>
        <Text style={presets.sectionHeader}>{t('share.placeholderTitle')}</Text>
        <Text style={[presets.textSecondary, { textAlign: 'center' }]}>
          {t('share.placeholderBody')}
        </Text>
      </View>
    </View>
  );
}
