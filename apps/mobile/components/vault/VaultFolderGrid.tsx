/**
 * One pastel tile per vault category with its document count. Tapping a tile narrows the list
 * to that category; tapping it again shows every category. Four across when the labels fit at a
 * readable size (tablets), two by two on a phone.
 */

import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { documentCountMessage, rowLayout } from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { VAULT_CATEGORIES, type VaultCategoryKey } from '../../lib/vault/categories';
import { VAULT_CATEGORY_ICONS } from './categoryIcons';
import { vaultPalette as palette } from './palette';

const FOUR_ACROSS_MIN_WIDTH = 112;
const GAP = 12;

export type VaultFolderGridProps = {
  /** Width of the page's content column. */
  readonly width: number;
  readonly counts: Readonly<Record<VaultCategoryKey, number>>;
  readonly selected: VaultCategoryKey | null;
  readonly onSelect: (category: VaultCategoryKey | null) => void;
};

export function VaultFolderGrid({ width, counts, selected, onSelect }: VaultFolderGridProps) {
  const { t } = useTranslation();

  const fourAcross = !rowLayout(width, 4, FOUR_ACROSS_MIN_WIDTH, GAP).scrolls;
  const { itemWidth } = rowLayout(width, fourAcross ? 4 : 2, 0, GAP);

  return (
    <View style={styles.grid}>
      {VAULT_CATEGORIES.map((category) => {
        const Icon = VAULT_CATEGORY_ICONS[category];
        const colors = palette.categories[category];
        const isSelected = category === selected;
        const label = t(`home.vault.categories.${category}`);
        const count = documentCountMessage(counts[category]);
        const countLabel = t(count.key, count.values);

        return (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${label}, ${countLabel}`}
            accessibilityHint={t('vault.folderHint')}
            onPress={() => onSelect(isSelected ? null : category)}
            style={({ pressed }) => [
              styles.tile,
              {
                width: itemWidth,
                backgroundColor: colors.tile,
                borderColor: isSelected ? colors.icon : colors.border,
              },
              isSelected && styles.tileSelected,
              pressed && styles.pressed,
            ]}
          >
            <Icon color={colors.icon} size={34} strokeWidth={2} />
            <View style={styles.text}>
              <Text numberOfLines={1} style={styles.label}>
                {label}
              </Text>
              <View style={styles.countRow}>
                <Text numberOfLines={1} style={styles.count}>
                  {countLabel}
                </Text>
                <ChevronRight color={palette.textSecondary} size={16} strokeWidth={2.4} />
              </View>
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
  tile: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  tileSelected: {
    borderWidth: 2,
    paddingTop: 17,
    paddingBottom: 13,
    paddingHorizontal: 13,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    alignSelf: 'stretch',
    marginTop: 14,
  },
  label: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  count: {
    flexShrink: 1,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textMuted,
  },
});
