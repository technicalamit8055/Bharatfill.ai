/**
 * "My Document Vault" — one card per vault category with its document count. Four across
 * when the labels fit at a readable size (tablets), two by two on a phone.
 */

import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { documentCountMessage, rowLayout } from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { VAULT_CATEGORIES, type VaultCategoryKey } from '../../lib/vault/categories';
import { VAULT_CATEGORY_ICONS as ICONS } from '../vault/categoryIcons';
import { homePalette as palette } from './palette';

const FOUR_ACROSS_MIN_WIDTH = 104;
const GAP = 10;

export type VaultCategoryGridProps = {
  /** Width of the page's content column. */
  readonly width: number;
  readonly counts: Readonly<Record<VaultCategoryKey, number>>;
  readonly onOpenVault: () => void;
};

export function VaultCategoryGrid({ width, counts, onOpenVault }: VaultCategoryGridProps) {
  const { t } = useTranslation();

  const fourAcross = !rowLayout(width, 4, FOUR_ACROSS_MIN_WIDTH, GAP).scrolls;
  const { itemWidth } = rowLayout(width, fourAcross ? 4 : 2, 0, GAP);

  return (
    <View style={styles.grid}>
      {VAULT_CATEGORIES.map((category) => {
        const Icon = ICONS[category];
        const colors = palette.vaultCategories[category];
        const label = t(`home.vault.categories.${category}`);
        const count = documentCountMessage(counts[category]);
        const countLabel = t(count.key, count.values);

        return (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${countLabel}`}
            onPress={onOpenVault}
            style={({ pressed }) => [styles.card, { width: itemWidth }, pressed && styles.pressed]}
          >
            <View style={[styles.badge, { backgroundColor: colors.badge }]}>
              <Icon color={colors.icon} size={26} strokeWidth={2.1} />
            </View>
            <Text numberOfLines={1} style={styles.label}>
              {label}
            </Text>
            <View style={styles.countRow}>
              <Text numberOfLines={1} style={styles.count}>
                {countLabel}
              </Text>
              <ChevronRight color={palette.textMuted} size={15} strokeWidth={2.4} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  pressed: {
    opacity: 0.7,
  },

  card: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 10,
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  count: {
    flexShrink: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: palette.textMuted,
  },
});
