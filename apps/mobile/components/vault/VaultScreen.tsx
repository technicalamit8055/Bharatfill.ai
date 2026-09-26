/**
 * Vault tab — "My Documents": header with search, the All / Folders / Recent / Starred chips,
 * one tile per vault category, then every document with its star and more-options button.
 *
 * Presentational apart from view state (filter, category, search, sort, list or grid): the
 * route decides which documents exist and what starring, the menus and scanning do. Light-only
 * branded artwork like Home, so it does not read from `useTheme()`.
 *
 * A virtualised `FlatList`, so only the rows on screen decrypt their thumbnails.
 */

import { ChevronDown, LayoutGrid, List, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { VaultCategoryKey } from '../../lib/vault/categories';
import {
  categoryCounts,
  emptyListMessage,
  VAULT_SORTS,
  type VaultFilter,
  type VaultItem,
  type VaultLayout,
  type VaultQuery,
  type VaultSort,
  visibleItems,
} from '../../lib/vault/vault-screen';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { OptionSheet } from '../registration/OptionSheet';
import { DocumentCard } from './DocumentCard';
import { vaultPalette as palette } from './palette';
import { VaultFilterChips } from './VaultFilterChips';
import { VaultFolderGrid } from './VaultFolderGrid';
import { VaultHeader } from './VaultHeader';

const GRID_GAP = 12;

export type VaultScreenState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly items: readonly VaultItem[] };

export type VaultScreenProps = {
  readonly state: VaultScreenState;
  /** The moment "Recent" is measured from. */
  readonly now: Date;
  readonly loadThumbnail: (documentId: string) => Promise<string>;
  readonly onOpenDocument: (item: VaultItem) => void;
  readonly onToggleStar: (item: VaultItem) => void;
  readonly onDocumentActions: (item: VaultItem) => void;
  readonly onMore: () => void;
  readonly onScan: () => void;
  readonly onRetry: () => void;
};

export function VaultScreen({
  state,
  now,
  loadThumbnail,
  onOpenDocument,
  onToggleStar,
  onDocumentActions,
  onMore,
  onScan,
  onRetry,
}: VaultScreenProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - PAGE_PADDING * 2;

  const [filter, setFilter] = useState<VaultFilter>('all');
  const [category, setCategory] = useState<VaultCategoryKey | null>(null);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<VaultSort>('newest');
  const [layout, setLayout] = useState<VaultLayout>('list');
  const [sortOpen, setSortOpen] = useState(false);

  const items = state.status === 'ready' ? state.items : [];
  const query = useMemo<VaultQuery>(
    () => ({ filter, category, search, sort, now }),
    [filter, category, search, sort, now],
  );
  const visible = useMemo(() => visibleItems(items, query), [items, query]);
  const counts = useMemo(() => categoryCounts(items), [items]);

  const showFolders = filter === 'all' || filter === 'folders';
  const showList = filter !== 'folders' || category !== null;

  const selectFilter = (next: VaultFilter) => {
    setFilter(next);
    if (next !== 'folders' && next !== 'all') setCategory(null);
  };

  const closeSearch = () => {
    setSearching(false);
    setSearch('');
  };

  const header = (
    <View style={styles.header}>
      <VaultHeader
        searching={searching}
        search={search}
        onSearchChange={setSearch}
        onOpenSearch={() => setSearching(true)}
        onCloseSearch={closeSearch}
        onMore={onMore}
      />

      <VaultFilterChips selected={filter} onSelect={selectFilter} />

      {showFolders ? (
        <VaultFolderGrid
          width={contentWidth}
          counts={counts}
          selected={category}
          onSelect={setCategory}
        />
      ) : null}

      {showList ? (
        <View style={styles.listHeader}>
          <View style={styles.listTitleRow}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.listTitle}>
              {category === null ? t('vault.allDocuments') : t(`home.vault.categories.${category}`)}
            </Text>
            {category !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('vault.clearCategory')}
                hitSlop={10}
                onPress={() => setCategory(null)}
                style={({ pressed }) => [styles.clearCategory, pressed && styles.pressed]}
              >
                <X color={palette.textSecondary} size={16} strokeWidth={2.6} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('vault.sort.label', { sort: t(`vault.sort.options.${sort}`) })}
            hitSlop={8}
            onPress={() => setSortOpen(true)}
            style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.sortLabel}>
              {t('vault.sort.label', { sort: t(`vault.sort.options.${sort}`) })}
            </Text>
            <ChevronDown color={palette.textSecondary} size={18} strokeWidth={2.4} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(layout === 'list' ? 'vault.layout.grid' : 'vault.layout.list')}
            hitSlop={8}
            onPress={() => setLayout(layout === 'list' ? 'grid' : 'list')}
            style={({ pressed }) => [styles.layoutButton, pressed && styles.pressed]}
          >
            {layout === 'list' ? (
              <LayoutGrid color={palette.headerIcon} size={22} strokeWidth={2.2} />
            ) : (
              <List color={palette.headerIcon} size={24} strokeWidth={2.2} />
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const empty = (() => {
    if (!showList) return null;
    if (state.status === 'loading') {
      return (
        <View style={styles.status}>
          <ActivityIndicator color={palette.brandBlue} accessibilityLabel={t('common.loading')} />
        </View>
      );
    }
    if (state.status === 'error') {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyBody}>{t('vault.loadError')}</Text>
          <PrimaryButton label={t('common.retry')} onPress={onRetry} />
        </View>
      );
    }
    const message = emptyListMessage(items.length, query);
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyBody}>{t(message.key, message.values)}</Text>
        {items.length === 0 ? (
          <PrimaryButton label={t('vault.emptyAction')} onPress={onScan} />
        ) : null}
      </View>
    );
  })();

  const grid = layout === 'grid';
  const gridCardWidth = Math.floor((contentWidth - GRID_GAP) / 2);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        // Changing the column count needs a fresh list.
        key={layout}
        data={showList ? visible : []}
        keyExtractor={(item) => item.id}
        numColumns={grid ? 2 : 1}
        columnWrapperStyle={grid ? styles.gridRow : undefined}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <View style={grid ? { width: gridCardWidth } : undefined}>
            <DocumentCard
              item={item}
              layout={layout}
              loadThumbnail={loadThumbnail}
              onOpen={onOpenDocument}
              onToggleStar={onToggleStar}
              onMore={onDocumentActions}
            />
          </View>
        )}
        ItemSeparatorComponent={grid ? null : ListSeparator}
        style={styles.list}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={7}
      />

      {sortOpen ? (
        <OptionSheet
          title={t('vault.sort.title')}
          closeLabel={t('vault.sort.close')}
          options={VAULT_SORTS.map((value) => ({
            value,
            label: t(`vault.sort.options.${value}`),
          }))}
          selected={sort}
          onSelect={setSort}
          onClose={() => setSortOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ListSeparator() {
  return <View style={styles.separator} />;
}

function PrimaryButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  list: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 6,
    paddingBottom: 24,
  },
  pressed: {
    opacity: 0.6,
  },

  header: {
    gap: 20,
    marginBottom: 14,
  },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  listTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 8,
  },
  listTitle: {
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: palette.heading,
  },
  clearCategory: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.neutralTag.background,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  sortLabel: {
    flexShrink: 1,
    fontSize: 14.5,
    color: palette.textSecondary,
  },
  layoutButton: {
    width: 40,
    height: 40,
    marginLeft: 10,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  separator: {
    height: 12,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },

  status: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 26,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: palette.emptyBorder,
    backgroundColor: palette.surface,
  },
  emptyBody: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  primaryButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.onBrand,
  },
});
