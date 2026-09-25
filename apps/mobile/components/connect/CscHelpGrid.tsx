/**
 * "What can CSC help with?" — six pastel tiles, three to a row on a phone, each with an icon
 * well and a two-line label. They describe what centres do; they are not links.
 *
 * Narrow screens drop to two columns so the labels are not cut off.
 */

import type { LucideIcon } from 'lucide-react-native';
import {
  CloudUpload,
  FilePenLine,
  GraduationCap,
  HandHeart,
  IdCard,
  Landmark,
} from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { CSC_HELP_TOPICS, type CscHelpTopic } from '../../lib/connect/connect-screen';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { connectPalette as palette } from './palette';

const GAP = 10;
/** Below this content width the tiles go two to a row. */
const TWO_COLUMNS_BELOW = 330;

const ICONS: Record<CscHelpTopic, LucideIcon> = {
  form_filling: FilePenLine,
  document_upload: CloudUpload,
  identity_services: IdCard,
  scholarship: GraduationCap,
  pension_welfare: HandHeart,
  other_government: Landmark,
};

export function CscHelpGrid({ width }: { readonly width: number }) {
  const { t } = useTranslation();
  const columns = width < TWO_COLUMNS_BELOW ? 2 : 3;
  const tileWidth = Math.floor((width - GAP * (columns - 1)) / columns);

  return (
    <View style={styles.grid}>
      {CSC_HELP_TOPICS.map((topic) => {
        const tint = palette.services[topic];
        const Icon = ICONS[topic];
        const title = t(`connect.services.${topic}.title`);
        const caption = t(`connect.services.${topic}.caption`);
        return (
          <View
            key={topic}
            accessible
            accessibilityLabel={`${title} ${caption}`}
            style={[
              styles.tile,
              { width: tileWidth, backgroundColor: tint.tile, borderColor: tint.border },
            ]}
          >
            <View style={[styles.badge, { backgroundColor: tint.badge }]}>
              <Icon color={tint.icon} size={20} strokeWidth={2.2} />
            </View>
            <View style={styles.copy}>
              <Text numberOfLines={2} style={styles.title}>
                {title}
              </Text>
              <Text numberOfLines={2} style={styles.caption}>
                {caption}
              </Text>
            </View>
          </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 80,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    color: palette.heading,
  },
  caption: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: palette.textMuted,
  },
});
