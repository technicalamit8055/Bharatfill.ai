/**
 * One centre on Nearby CSC Centers: photo, name with a bookmark, "● Open Now • 1.2 km", the
 * address, up to three services with "+N", and Get Directions beside Connect — or Notify Me
 * when the centre is closed. The centre picked on the map has a blue border; tapping the card
 * opens its details.
 */

import { Bell, Bookmark, MapPin, Navigation, Store, UsersRound } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  distanceMessage,
  type NearbyCentre,
  offeringChips,
} from '../../lib/connect/connect-screen';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { connectPalette as palette } from './palette';

const PHOTO_WIDTH = 104;
const PHOTO_HEIGHT = 84;

export type NearbyCentreCardProps = {
  readonly centre: NearbyCentre;
  readonly selected: boolean;
  readonly bookmarked: boolean;
  readonly onOpen: (centre: NearbyCentre) => void;
  readonly onToggleBookmark: (centre: NearbyCentre) => void;
  readonly onDirections: (centre: NearbyCentre) => void;
  readonly onConnect: (centre: NearbyCentre) => void;
  readonly onNotify: (centre: NearbyCentre) => void;
};

export function NearbyCentreCard({
  centre,
  selected,
  bookmarked,
  onOpen,
  onToggleBookmark,
  onDirections,
  onConnect,
  onNotify,
}: NearbyCentreCardProps) {
  const { t } = useTranslation();
  const distance = distanceMessage(centre.distanceMeters, 'short');
  const distanceLabel = t(distance.key, distance.values);
  const status = t(centre.openNow ? 'connect.nearby.openNow' : 'connect.finder.closedNow');
  const chips = offeringChips(centre.offerings);

  return (
    <View
      style={[
        styles.card,
        selected && { borderColor: palette.finder.cardSelectedBorder, borderWidth: 1.5 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[centre.name, status, distanceLabel, centre.address].join(', ')}
        accessibilityHint={t('connect.nearby.openHint')}
        accessibilityState={{ selected }}
        onPress={() => onOpen(centre)}
        style={styles.top}
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
          <View style={styles.nameRow}>
            <Text numberOfLines={2} style={styles.name}>
              {centre.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                bookmarked ? 'connect.finder.unbookmark' : 'connect.finder.bookmark',
                { name: centre.name },
              )}
              accessibilityState={{ selected: bookmarked }}
              hitSlop={10}
              onPress={() => onToggleBookmark(centre)}
              style={({ pressed }) => [styles.bookmark, pressed && styles.pressed]}
            >
              <Bookmark
                color={palette.finder.bookmark}
                fill={bookmarked ? palette.finder.bookmark : 'none'}
                size={22}
                strokeWidth={2}
              />
            </Pressable>
          </View>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: centre.openNow
                    ? palette.status.openDot
                    : palette.status.closedDot,
                },
              ]}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.statusText,
                { color: centre.openNow ? palette.status.openText : palette.status.closedText },
              ]}
            >
              {status}
            </Text>
            <Text style={styles.separator}>•</Text>
            <Text numberOfLines={1} style={styles.distance}>
              {distanceLabel}
            </Text>
          </View>

          <View style={styles.addressRow}>
            <MapPin color={palette.textMuted} size={15} strokeWidth={2.2} />
            <Text numberOfLines={2} style={styles.address}>
              {centre.address}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.chips}>
        {chips.shown.map((offering) => (
          <View key={offering} style={styles.chip}>
            <Text numberOfLines={1} style={styles.chipLabel}>
              {t(`connect.offerings.${offering}`)}
            </Text>
          </View>
        ))}
        {chips.more > 0 ? (
          <View
            style={styles.chip}
            accessible
            accessibilityLabel={t('connect.nearby.moreServices', { count: chips.more })}
          >
            <Text style={styles.chipLabel}>{`+${chips.more}`}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.buttons}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('connect.finder.directionsTo', { name: centre.name })}
          onPress={() => onDirections(centre)}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: pressed
                ? palette.secondaryButton.pressed
                : palette.secondaryButton.background,
            },
          ]}
        >
          <Navigation color={palette.secondaryButton.text} size={18} strokeWidth={2.2} />
          <Text numberOfLines={1} style={[styles.buttonLabel, styles.secondaryLabel]}>
            {t('connect.finder.directions')}
          </Text>
        </Pressable>

        {centre.openNow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('connect.finder.connectTo', { name: centre.name })}
            onPress={() => onConnect(centre)}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: pressed ? palette.brandBluePressed : palette.brandBlue },
            ]}
          >
            <UsersRound color={palette.onBrand} size={18} strokeWidth={2.2} />
            <Text numberOfLines={1} style={[styles.buttonLabel, styles.primaryLabel]}>
              {t('connect.finder.connect')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('connect.finder.notifyFor', { name: centre.name })}
            onPress={() => onNotify(centre)}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: pressed
                  ? palette.mutedButton.pressed
                  : palette.mutedButton.background,
              },
            ]}
          >
            <Bell color={palette.mutedButton.text} size={18} strokeWidth={2.2} />
            <Text numberOfLines={1} style={[styles.buttonLabel, styles.mutedLabel]}>
              {t('connect.finder.notify')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 12,
    borderRadius: 18,
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
    opacity: 0.6,
  },

  top: {
    flexDirection: 'row',
    gap: 12,
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
    gap: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  name: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: palette.heading,
  },
  bookmark: {
    paddingTop: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: '600',
  },
  separator: {
    fontSize: 13,
    color: palette.textMuted,
  },
  distance: {
    fontSize: 13.5,
    color: palette.textSecondary,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  address: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    color: palette.textSecondary,
  },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: palette.serviceChip.background,
  },
  chipLabel: {
    fontSize: 12.5,
    fontWeight: '500',
    color: palette.serviceChip.text,
  },

  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  buttonLabel: {
    flexShrink: 1,
    fontSize: 14.5,
    fontWeight: '700',
  },
  secondaryLabel: {
    color: palette.secondaryButton.text,
  },
  primaryLabel: {
    color: palette.onBrand,
  },
  mutedLabel: {
    color: palette.mutedButton.text,
  },
});
