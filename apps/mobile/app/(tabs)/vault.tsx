/**
 * Vault — the categorised document list.
 *
 * Empty-state only at this stage. No document data is fetched or cached here yet, so nothing
 * on this screen touches citizen PII.
 */

import { ScrollView, Text, View } from 'react-native';

import { VAULT_CATEGORIES, vaultCategoryLabelKey } from '../../lib/vault/categories';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { spacing, useTheme, vaultCategory } from '../../theme';

export default function VaultScreen() {
  const { presets } = useTheme();
  const { t } = useTranslation();

  return (
    <ScrollView style={presets.screen} contentContainerStyle={presets.screenContent}>
      <View style={presets.card}>
        <Text style={presets.sectionHeader}>{t('vault.emptyTitle')}</Text>
        <Text style={presets.textSecondary}>{t('vault.emptyBody')}</Text>
      </View>

      {VAULT_CATEGORIES.map((category) => (
        <View key={category} style={presets.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View
              style={{
                width: spacing.xs,
                alignSelf: 'stretch',
                borderRadius: spacing.xxs,
                backgroundColor: vaultCategory[category],
              }}
            />
            <Text style={[presets.sectionHeader, { flex: 1 }]}>
              {t(vaultCategoryLabelKey(category))}
            </Text>
          </View>
          <Text style={presets.textMuted}>0</Text>
        </View>
      ))}
    </ScrollView>
  );
}
