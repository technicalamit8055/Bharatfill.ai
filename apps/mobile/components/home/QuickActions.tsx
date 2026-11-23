/**
 * The shortcuts under the hero: Document, Upload, ID Card, Photo, Signature, Multi-Page. Upload
 * adds a photo or PDF already on the phone; the others open the scanner. All six sit across on
 * a wide screen; on a phone the tiles keep a readable width and the row scrolls sideways,
 * bleeding to the screen edge so the next tile peeks in.
 */

import type { LucideIcon } from 'lucide-react-native';
import { FileText, FileUp, Files, IdCard, PenLine, SquareUser } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  QUICK_ACTIONS,
  type QuickAction,
  type QuickScanMode,
  rowLayout,
} from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { PAGE_PADDING } from './layout';
import { homePalette as palette } from './palette';

const TILE_MIN_WIDTH = 88;
const GAP = 10;

const ICONS: Record<QuickAction, LucideIcon> = {
  document: FileText,
  upload: FileUp,
  id_card: IdCard,
  photo: SquareUser,
  signature: PenLine,
  multi_page: Files,
};

export type QuickActionsProps = {
  /** Width of the page's content column. */
  readonly width: number;
  readonly onScan: (mode: QuickScanMode) => void;
  readonly onUpload: () => void;
};

export function QuickActions({ width, onScan, onUpload }: QuickActionsProps) {
  const { t } = useTranslation();
  const { itemWidth, scrolls } = rowLayout(width, QUICK_ACTIONS.length, TILE_MIN_WIDTH, GAP);

  return (
    <ScrollView
      horizontal
      scrollEnabled={scrolls}
      showsHorizontalScrollIndicator={false}
      style={styles.bleed}
      contentContainerStyle={styles.row}
    >
      {QUICK_ACTIONS.map((action) => {
        const Icon = ICONS[action];
        const colors = palette.quickActions[action];
        const label = t(`home.quickActions.${action}.label`);
        const caption = t(`home.quickActions.${action}.caption`);

        return (
          <Pressable
            key={action}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${caption}`}
            onPress={() => (action === 'upload' ? onUpload() : onScan(action))}
            style={({ pressed }) => [
              styles.tile,
              { width: itemWidth, backgroundColor: colors.tile, borderColor: colors.border },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.badge, { backgroundColor: colors.badge }]}>
              <Icon color={colors.icon} size={23} strokeWidth={2.2} />
            </View>
            <Text numberOfLines={1} style={styles.label}>
              {label}
            </Text>
            <Text numberOfLines={2} style={styles.caption}>
              {caption}
            </Text>
          </Pressable>
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
    // Room for the tiles' shadow, which a horizontal ScrollView would otherwise clip.
    paddingBottom: 4,
  },
  pressed: {
    opacity: 0.7,
  },

  tile: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  caption: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    textAlign: 'center',
    color: palette.textMuted,
  },
});
