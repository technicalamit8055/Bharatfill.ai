/**
 * All / Folders / Recent / Starred. The chips share the row equally, and the chosen one fills
 * with brand blue.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { VAULT_FILTERS, type VaultFilter } from '../../lib/vault/vault-screen';
import { vaultPalette as palette } from './palette';

export type VaultFilterChipsProps = {
  readonly selected: VaultFilter;
  readonly onSelect: (filter: VaultFilter) => void;
};

export function VaultFilterChips({ selected, onSelect }: VaultFilterChipsProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {VAULT_FILTERS.map((filter) => {
        const isSelected = filter === selected;
        return (
          <Pressable
            key={filter}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(filter)}
            style={({ pressed }) => [
              styles.chip,
              isSelected && styles.chipSelected,
              pressed && !isSelected && styles.pressed,
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              style={[styles.label, isSelected && styles.labelSelected]}
            >
              {t(`vault.filters.${filter}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    height: 42,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.chipBorder,
    backgroundColor: palette.surface,
  },
  chipSelected: {
    borderColor: palette.brandBlue,
    backgroundColor: palette.brandBlue,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.chipText,
  },
  labelSelected: {
    color: palette.onBrand,
  },
});
