/**
 * "Recent Documents" — the newest documents as thumbnail cards, scrolling sideways when they do
 * not all fit. With an empty vault it shows a prompt to scan the first document instead.
 *
 * Thumbnails are letterboxed ("contain"), not cropped, so a portrait passport photo or
 * marksheet is shown whole.
 */

import { EllipsisVertical, FileText } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { documentAgeMessage, type RecentDocument, rowLayout } from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { PAGE_PADDING } from './layout';
import { homePalette as palette } from './palette';

const CARD_MIN_WIDTH = 148;
const GAP = 12;
/** Cards are sized as if four share the row, so one or two documents do not stretch wide. */
const SIZING_SLOTS = 4;

export type RecentDocumentsProps = {
  /** Width of the page's content column. */
  readonly width: number;
  readonly documents: readonly RecentDocument[];
  readonly now: Date;
  readonly onDocumentActions: (document: RecentDocument) => void;
};

export function RecentDocuments({
  width,
  documents,
  now,
  onDocumentActions,
}: RecentDocumentsProps) {
  const { t } = useTranslation();

  if (documents.length === 0) {
    return (
      <View style={styles.empty}>
        <FileText color={palette.textMuted} size={28} strokeWidth={1.8} />
        <Text style={styles.emptyTitle}>{t('home.recent.emptyTitle')}</Text>
        <Text style={styles.emptyBody}>{t('home.recent.emptyBody')}</Text>
      </View>
    );
  }

  const { itemWidth } = rowLayout(width, SIZING_SLOTS, CARD_MIN_WIDTH, GAP);
  const rowWidth = documents.length * itemWidth + (documents.length - 1) * GAP;

  return (
    <ScrollView
      horizontal
      scrollEnabled={rowWidth > width}
      showsHorizontalScrollIndicator={false}
      style={styles.bleed}
      contentContainerStyle={styles.row}
    >
      {documents.map((document) => {
        const age = documentAgeMessage(document.createdAt, now);
        const ageLabel = t(age.key, age.values);

        return (
          <View key={document.id} style={[styles.card, { width: itemWidth }]}>
            <View style={[styles.thumbnail, { height: Math.round(itemWidth * 0.62) }]}>
              <Image
                source={document.thumbnail}
                style={styles.thumbnailImage}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>

            <View style={styles.footer}>
              <View
                style={styles.meta}
                accessible
                accessibilityLabel={`${document.title}, ${ageLabel}`}
              >
                <Text numberOfLines={1} style={styles.title}>
                  {document.title}
                </Text>
                <Text numberOfLines={1} style={styles.age}>
                  {ageLabel}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('home.recent.moreActions', { title: document.title })}
                hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
                onPress={() => onDocumentActions(document)}
                style={({ pressed }) => [styles.more, pressed && styles.pressed]}
              >
                <EllipsisVertical color={palette.brandBlue} size={20} strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bleed: {
    marginHorizontal: -PAGE_PADDING,
  },
  row: {
    gap: GAP,
    paddingHorizontal: PAGE_PADDING,
    // Room for the cards' shadow, which a horizontal ScrollView would otherwise clip.
    paddingBottom: 4,
  },
  pressed: {
    opacity: 0.6,
  },

  card: {
    padding: 8,
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
  thumbnail: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: palette.thumbnailSurface,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingLeft: 4,
  },
  meta: {
    flex: 1,
  },
  title: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  age: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.textMuted,
  },
  more: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: palette.emptyBorder,
    backgroundColor: palette.surface,
  },
  emptyTitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: palette.textSecondary,
  },
});
