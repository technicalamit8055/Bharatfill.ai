/**
 * "My Documents" heading with round search and more-options buttons. Search opens a field in
 * place of the heading; closing it clears the search.
 */

import { EllipsisVertical, Search, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { vaultPalette as palette } from './palette';

const BUTTON_SIZE = 48;

export type VaultHeaderProps = {
  readonly searching: boolean;
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
  readonly onOpenSearch: () => void;
  readonly onCloseSearch: () => void;
  readonly onMore: () => void;
};

export function VaultHeader({
  searching,
  search,
  onSearchChange,
  onOpenSearch,
  onCloseSearch,
  onMore,
}: VaultHeaderProps) {
  const { t } = useTranslation();
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);

  if (searching) {
    return (
      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Search color={palette.textMuted} size={20} strokeWidth={2.2} />
          <TextInput
            ref={input}
            value={search}
            onChangeText={onSearchChange}
            placeholder={t('vault.searchPlaceholder')}
            placeholderTextColor={palette.textMuted}
            accessibilityLabel={t('vault.search')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={styles.searchInput}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('vault.closeSearch')}
          onPress={onCloseSearch}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <X color={palette.headerIcon} size={22} strokeWidth={2.2} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.heading}>
          {t('vault.heading')}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {t('vault.subtitle')}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('vault.search')}
          onPress={onOpenSearch}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Search color={palette.headerIcon} size={22} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('vault.more')}
          onPress={onMore}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <EllipsisVertical color={palette.headerIcon} size={22} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
  },
  titles: {
    flex: 1,
    marginRight: 12,
  },
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: palette.heading,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 21,
    color: palette.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.headerButton,
  },
  pressed: {
    opacity: 0.6,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: BUTTON_SIZE,
    paddingHorizontal: 14,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 1,
    borderColor: palette.chipBorder,
    backgroundColor: palette.surface,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 15.5,
    color: palette.textPrimary,
  },
});
