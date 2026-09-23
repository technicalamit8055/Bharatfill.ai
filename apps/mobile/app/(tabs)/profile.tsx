/**
 * Profile — account and document-access settings.
 *
 * Signed-out shell only. Phone OTP sign-in and the access-mode control (spec §3 Feature 4)
 * land in a later task; no citizen identifier is read or stored here.
 */

import { ScrollView, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { useTheme } from '../../theme';

export default function ProfileScreen() {
  const { presets } = useTheme();
  const { t } = useTranslation();

  return (
    <ScrollView style={presets.screen} contentContainerStyle={presets.screenContent}>
      <View style={presets.card}>
        <Text style={presets.sectionHeader}>{t('profile.signedOutTitle')}</Text>
        <Text style={presets.textSecondary}>{t('profile.signedOutBody')}</Text>
      </View>

      <View style={presets.card}>
        <Text style={presets.sectionHeader}>{t('profile.accessTitle')}</Text>
        <Text style={presets.textSecondary}>{t('profile.accessBody')}</Text>
      </View>
    </ScrollView>
  );
}
