/**
 * "Nearby CSC for You" — a white card with a View Map link and a paging carousel of centres,
 * one per page, with dots underneath. Each centre shows its photo, distance, whether it is
 * open, and up to three of its services with a "+N" chip for the rest.
 *
 * Until centre search exists the card says so instead of listing anything; the route decides
 * which it gets. Nothing here reads the phone's location.
 */

import type { LucideIcon } from 'lucide-react-native';
import {
  ChevronRight,
  FileText,
  Fingerprint,
  Map as MapIcon,
  MapPin,
  Store,
  UserRound,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  type CscOffering,
  distanceMessage,
  type NearbyCentre,
  type NearbyCentres,
  offeringChips,
  pageAt,
} from '../../lib/connect/connect-screen';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { connectPalette as palette } from './palette';

const CARD_BORDER = 1;
const PHOTO_WIDTH = 92;
const PHOTO_HEIGHT = 84;

const OFFERING_ICONS: Partial<Record<CscOffering, { icon: LucideIcon; color: string }>> = {
  aadhaar: { icon: Fingerprint, color: palette.offeringIcons.aadhaar },
  pan: { icon: FileText, color: palette.offeringIcons.pan },
  voter_id: { icon: UserRound, color: palette.offeringIcons.voter_id },
};
const DEFAULT_OFFERING_ICON = { icon: FileText, color: palette.offeringIcons.other };

export type NearbyCentresCardProps = {
  /** Width of the page's content column. One carousel page is the card's inner width. */
  readonly width: number;
  readonly nearby: NearbyCentres;
  readonly onViewMap: () => void;
  readonly onOpenCentre: (centre: NearbyCentre) => void;
};

export function NearbyCentresCard({
  width,
  nearby,
  onViewMap,
  onOpenCentre,
}: NearbyCentresCardProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);

  const centres = nearby.status === 'ready' ? nearby.centres : [];
  const pageWidth = width - CARD_BORDER * 2;

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(pageAt(event.nativeEvent.contentOffset.x, pageWidth, centres.length));
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {t('connect.nearby.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('connect.nearby.viewMap')}
          hitSlop={12}
          onPress={onViewMap}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          <MapIcon color={palette.brandBlue} size={18} strokeWidth={2.2} />
          <Text style={styles.headerActionLabel}>{t('connect.nearby.viewMap')}</Text>
          <ChevronRight color={palette.brandBlue} size={17} strokeWidth={2.4} />
        </Pressable>
      </View>

      {centres.length === 0 ? (
        <View style={styles.empty}>
          <Store color={palette.textMuted} size={26} strokeWidth={2} />
          <Text style={styles.emptyText}>
            {t(nearby.status === 'ready' ? 'connect.nearby.none' : 'connect.nearby.unavailable')}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            decelerationRate="fast"
          >
            {centres.map((centre) => (
              <CentreRow key={centre.id} centre={centre} width={pageWidth} onOpen={onOpenCentre} />
            ))}
          </ScrollView>

          {centres.length > 1 ? (
            <View
              style={styles.dots}
              accessible
              accessibilityLabel={t('connect.nearby.page', {
                page: page + 1,
                count: centres.length,
              })}
            >
              {centres.map((centre, index) => (
                <View key={centre.id} style={[styles.dot, index === page && styles.dotActive]} />
              ))}
            </View>
          ) : (
            <View style={styles.noDots} />
          )}
        </>
      )}
    </View>
  );
}

type CentreRowProps = {
  readonly centre: NearbyCentre;
  readonly width: number;
  readonly onOpen: (centre: NearbyCentre) => void;
};

function CentreRow({ centre, width, onOpen }: CentreRowProps) {
  const { t } = useTranslation();
  const distance = distanceMessage(centre.distanceMeters);
  const distanceLabel = t(distance.key, distance.values);
  const status = t(centre.openNow ? 'connect.nearby.openNow' : 'connect.nearby.closed');
  const chips = offeringChips(centre.offerings);
  const statusColors = centre.openNow ? palette.openBadge : palette.closedBadge;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[centre.name, distanceLabel, status].join(', ')}
      accessibilityHint={t('connect.nearby.openHint')}
      onPress={() => onOpen(centre)}
      style={({ pressed }) => [styles.row, { width }, pressed && styles.pressed]}
    >
      <View style={styles.photo}>
        {centre.photos[0] ? (
          <Image
            source={centre.photos[0]}
            style={styles.photoImage}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Store color={palette.textMuted} size={30} strokeWidth={1.8} />
        )}
      </View>

      <View style={styles.details}>
        <Text numberOfLines={2} style={styles.name}>
          {centre.name}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.distance}>
            <MapPin color={palette.textSecondary} size={16} strokeWidth={2.2} />
            <Text numberOfLines={1} style={styles.distanceLabel}>
              {distanceLabel}
            </Text>
          </View>
          <View style={[styles.status, { backgroundColor: statusColors.background }]}>
            <Text numberOfLines={1} style={[styles.statusLabel, { color: statusColors.text }]}>
              {status}
            </Text>
          </View>
        </View>

        <View style={styles.chips}>
          {chips.shown.map((offering) => {
            const { icon: Icon, color } = OFFERING_ICONS[offering] ?? DEFAULT_OFFERING_ICON;
            return (
              <View key={offering} style={styles.chip}>
                <Icon color={color} size={14} strokeWidth={2.2} />
                <Text numberOfLines={1} style={styles.chipLabel}>
                  {t(`connect.offerings.${offering}`)}
                </Text>
              </View>
            );
          })}
          {chips.more > 0 ? (
            <View
              style={styles.chip}
              accessible
              accessibilityLabel={t('connect.nearby.moreServices', { count: chips.more })}
            >
              <Text style={styles.chipMore}>{`+${chips.more}`}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.chevron}>
        <ChevronRight color={palette.chevronIcon} size={20} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: CARD_BORDER,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: 'hidden',
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  pressed: {
    opacity: 0.7,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  title: {
    flex: 1,
    marginRight: 8,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
    color: palette.heading,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.brandBlue,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  photo: {
    width: PHOTO_WIDTH,
    height: PHOTO_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.photoWell,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  details: {
    flex: 1,
    gap: 6,
  },
  name: {
    fontSize: 15.5,
    lineHeight: 20,
    fontWeight: '800',
    color: palette.heading,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  distance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceLabel: {
    fontSize: 13,
    color: palette.textSecondary,
  },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: palette.offeringChip.background,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: palette.offeringChip.text,
  },
  chipMore: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.headerButton,
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 14,
    paddingBottom: 14,
  },
  noDots: {
    height: 14,
  },
  dot: {
    width: 8,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.dot,
  },
  dotActive: {
    width: 18,
    backgroundColor: palette.dotActive,
  },

  empty: {
    alignItems: 'center',
    gap: 10,
    margin: 14,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: palette.emptyBorder,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: palette.textSecondary,
  },
});
