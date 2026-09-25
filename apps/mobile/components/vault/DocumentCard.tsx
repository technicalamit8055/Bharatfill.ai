/**
 * One document in the vault list: thumbnail, title, "JPG • 2.4 MB • 12 Sep 2026", a category
 * tag and a grey type tag, then the star and a more-options button. The grid variant stacks the
 * same pieces under a larger thumbnail.
 */

import { EllipsisVertical, Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { metaLine, type VaultItem, type VaultLayout } from '../../lib/vault/vault-screen';
import { DocumentThumbnail } from './DocumentThumbnail';
import { vaultPalette as palette } from './palette';

export type DocumentCardProps = {
  readonly item: VaultItem;
  readonly layout: VaultLayout;
  readonly loadThumbnail: (documentId: string) => Promise<string>;
  readonly onToggleStar: (item: VaultItem) => void;
  readonly onMore: (item: VaultItem) => void;
};

export function DocumentCard({
  item,
  layout,
  loadThumbnail,
  onToggleStar,
  onMore,
}: DocumentCardProps) {
  const { t } = useTranslation();
  const meta = metaLine(item, t);
  const grid = layout === 'grid';

  return (
    <View style={[styles.card, grid ? styles.gridCard : styles.listCard]}>
      <DocumentThumbnail
        documentId={item.id}
        thumbnail={item.thumbnail}
        loadThumbnail={loadThumbnail}
        style={grid ? styles.gridThumbnail : styles.listThumbnail}
      />

      <View style={styles.details} accessible accessibilityLabel={`${item.title}, ${meta}`}>
        <Text numberOfLines={1} style={[styles.title, grid && styles.gridTitle]}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, grid && styles.gridMeta]}>
          {meta}
        </Text>
        <Tags item={item} />
      </View>

      <View style={[styles.actions, grid && styles.gridActions]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: item.starred }}
          accessibilityLabel={t(item.starred ? 'vault.unstar' : 'vault.star', {
            title: item.title,
          })}
          hitSlop={6}
          onPress={() => onToggleStar(item)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Star
            color={item.starred ? palette.star : palette.starOff}
            fill={item.starred ? palette.star : 'transparent'}
            size={24}
            strokeWidth={2}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('vault.moreActions', { title: item.title })}
          hitSlop={6}
          onPress={() => onMore(item)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <EllipsisVertical color={palette.headerIcon} size={22} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

function Tags({ item }: { readonly item: VaultItem }) {
  const { t } = useTranslation();
  if (item.category === null && item.tag === null) return null;

  const colors = item.category === null ? null : palette.categories[item.category];

  return (
    <View style={styles.tags}>
      {item.category !== null && colors !== null ? (
        <Text
          numberOfLines={1}
          style={[styles.tag, { backgroundColor: colors.tag, color: colors.tagText }]}
        >
          {t(`home.vault.categories.${item.category}`)}
        </Text>
      ) : null}
      {item.tag !== null ? (
        <Text numberOfLines={1} style={[styles.tag, styles.neutralTag]}>
          {item.tag}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  pressed: {
    opacity: 0.55,
  },

  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 4,
  },
  listThumbnail: {
    width: 88,
    height: 68,
  },

  gridCard: {
    padding: 10,
    gap: 10,
  },
  gridThumbnail: {
    width: '100%',
    aspectRatio: 4 / 3,
  },

  details: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    color: palette.heading,
  },
  gridTitle: {
    fontSize: 15.5,
    lineHeight: 21,
  },
  meta: {
    marginTop: 3,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textMuted,
  },
  gridMeta: {
    fontSize: 12.5,
    lineHeight: 17,
  },

  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  neutralTag: {
    backgroundColor: palette.neutralTag.background,
    color: palette.neutralTag.text,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridActions: {
    justifyContent: 'space-between',
    marginTop: -4,
    marginHorizontal: -6,
  },
  iconButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
