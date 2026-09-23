/**
 * Home — the citizen's landing screen.
 *
 * Counts are placeholders until the vault store lands; the screen exists to pin down the
 * layout language (card + section header + primary action) that later screens reuse.
 */

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VAULT_CATEGORIES, vaultCategoryLabelKey } from '../../lib/vault/categories';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { spacing, useTheme, vaultCategory } from '../../theme';

export default function HomeScreen() {
  const { colors, presets } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={presets.screen}
      contentContainerStyle={[presets.screenContent, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View>
        <Text style={presets.textSecondary}>{t('home.greeting')}</Text>
        <Text style={presets.sectionHeader}>{t('app.name')}</Text>
        <Text style={presets.textMuted}>{t('app.tagline')}</Text>
      </View>

      <View style={presets.card}>
        <Text style={presets.sectionHeader}>{t('home.quickScanTitle')}</Text>
        <Text style={presets.textSecondary}>{t('home.quickScanBody')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.quickScanAction')}
          style={presets.primaryButton}
          onPress={() => router.navigate('/scan')}
        >
          <Text style={presets.primaryButtonLabel}>{t('home.quickScanAction')}</Text>
        </Pressable>
      </View>

      <View style={presets.card}>
        <Text style={presets.sectionHeader}>{t('home.vaultSummaryTitle')}</Text>
        <Text style={presets.textSecondary}>{t('home.vaultSummaryEmpty')}</Text>

        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {VAULT_CATEGORIES.map((category) => (
            <View
              key={category}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <View
                style={{
                  width: spacing.md,
                  height: spacing.md,
                  borderRadius: spacing.md / 2,
                  backgroundColor: vaultCategory[category],
                }}
              />
              <Text style={[presets.textPrimary, { flex: 1 }]}>
                {t(vaultCategoryLabelKey(category))}
              </Text>
              <Text style={[presets.textMuted, { color: colors.textMuted }]}>0</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
