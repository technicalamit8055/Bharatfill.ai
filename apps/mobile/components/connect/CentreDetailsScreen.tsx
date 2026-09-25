/**
 * A centre's details, pushed from Nearby CSC Centers or the Connect tab: a photo header with
 * back, share and save buttons; the name, open status, distance and address with Get
 * Directions; working hours, contact and verification; a banner; the services the centre
 * offers; and Get Directions / Connect & Share pinned above the tab bar.
 *
 * The photo runs under the status bar, so the round buttons sit below the safe-area inset.
 * Available Services shows five rows until View All; View All expands the list in place.
 *
 * Presentational apart from view state (photo page, expanded list): the route decides what
 * each tap does. Light-only branded artwork like the rest of Connect, so it does not read from
 * `useTheme()`.
 */

import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import {
  Award,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudUpload,
  CreditCard,
  FileText,
  Fingerprint,
  GraduationCap,
  HandHeart,
  Heart,
  Images,
  MapPin,
  Navigation,
  Phone,
  Receipt,
  ScrollText,
  Share2,
  ShieldCheck,
  Store,
  UsersRound,
  Wheat,
} from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { detailServices, fullAddress, hoursLines } from '../../lib/connect/centre-details';
import {
  type CscOffering,
  distanceMessage,
  type NearbyCentre,
  pageAt,
} from '../../lib/connect/connect-screen';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { CONTENT_MAX_WIDTH, ILLUSTRATION_ASPECT_RATIO, PAGE_PADDING } from '../home/layout';
import { connectPalette as palette } from './palette';

const OVERLAY_BUTTON = 46;
/** How far the details sheet rises over the bottom of the photo. */
const SHEET_OVERLAP = 24;
/** Photo height as a share of its width. */
const PHOTO_ASPECT = 0.62;

const SERVICE_ICONS: Record<CscOffering, LucideIcon> = {
  form_filling: FileText,
  document_upload: CloudUpload,
  aadhaar: Fingerprint,
  pan: CreditCard,
  voter_id: UsersRound,
  ration_card: Wheat,
  pension: HandHeart,
  scholarship: GraduationCap,
  certificates: Award,
  bill_payment: Receipt,
  caste_certificate: ScrollText,
};

export type CentreDetailsScreenProps = {
  readonly centre: NearbyCentre;
  readonly saved: boolean;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onToggleSaved: () => void;
  readonly onDirections: () => void;
  readonly onCall: () => void;
  readonly onOpenService: (offering: CscOffering) => void;
  readonly onConnect: () => void;
};

export function CentreDetailsScreen({
  centre,
  saved,
  onBack,
  onShare,
  onToggleSaved,
  onDirections,
  onCall,
  onOpenService,
  onConnect,
}: CentreDetailsScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const photoWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH);
  const photoHeight = Math.round(photoWidth * PHOTO_ASPECT);

  const [photoPage, setPhotoPage] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const distance = distanceMessage(centre.distanceMeters);
  const status = t(centre.openNow ? 'connect.nearby.openNow' : 'connect.finder.closedNow');
  const hours = hoursLines(centre.hours, t);
  const services = detailServices(centre.offerings, expanded);
  const canExpand = expanded || services.hidden > 0;

  const onPhotoScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPhotoPage(pageAt(event.nativeEvent.contentOffset.x, photoWidth, centre.photos.length));
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.photoFrame, { width: photoWidth, height: photoHeight }]}>
          {centre.photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onPhotoScrollEnd}
            >
              {centre.photos.map((photo, index) => (
                <Image
                  key={index}
                  source={photo}
                  style={{ width: photoWidth, height: photoHeight }}
                  resizeMode="cover"
                  accessibilityLabel={t('connect.centre.photo', {
                    name: centre.name,
                    page: index + 1,
                    count: centre.photos.length,
                  })}
                  accessibilityIgnoresInvertColors
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Store color={palette.textMuted} size={48} strokeWidth={1.6} />
            </View>
          )}

          <View style={[styles.overlayRow, { top: insets.top + 8 }]}>
            <OverlayButton label={t('connect.centre.back')} onPress={onBack}>
              <ChevronLeft color={palette.details.overlayIcon} size={26} strokeWidth={2.4} />
            </OverlayButton>
            <View style={styles.overlayActions}>
              <OverlayButton label={t('connect.centre.share')} onPress={onShare}>
                <Share2 color={palette.details.overlayIcon} size={22} strokeWidth={2.2} />
              </OverlayButton>
              <OverlayButton
                label={t(saved ? 'connect.centre.unsave' : 'connect.centre.save')}
                selected={saved}
                onPress={onToggleSaved}
              >
                <Heart
                  color={saved ? palette.details.favourite : palette.details.overlayIcon}
                  fill={saved ? palette.details.favourite : 'none'}
                  size={22}
                  strokeWidth={2.2}
                />
              </OverlayButton>
            </View>
          </View>

          {centre.photos.length > 1 ? (
            <View style={styles.counter} accessibilityElementsHidden>
              <Images color={palette.details.onCounter} size={15} strokeWidth={2.2} />
              <Text style={styles.counterLabel}>{`${photoPage + 1}/${centre.photos.length}`}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <View style={styles.titleCopy}>
              <Text accessibilityRole="header" style={styles.name}>
                {centre.name}
              </Text>
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
                  style={[
                    styles.statusText,
                    {
                      color: centre.openNow ? palette.status.openText : palette.status.closedText,
                    },
                  ]}
                >
                  {status}
                </Text>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.distance}>{t(distance.key, distance.values)}</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('connect.finder.directionsTo', { name: centre.name })}
              onPress={onDirections}
              style={({ pressed }) => [
                styles.directionsChip,
                {
                  backgroundColor: pressed
                    ? palette.secondaryButton.pressed
                    : palette.secondaryButton.background,
                },
              ]}
            >
              <Navigation color={palette.secondaryButton.text} size={18} strokeWidth={2.2} />
              <Text numberOfLines={2} style={styles.directionsChipLabel}>
                {t('connect.finder.directions')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.addressRow}>
            <MapPin color={palette.headerIcon} size={18} strokeWidth={2} />
            <Text style={styles.address}>{fullAddress(centre)}</Text>
          </View>

          <View style={styles.infoCard}>
            <InfoColumn
              icon={Clock}
              tint={palette.details.hours}
              title={t('connect.centre.hours')}
              lines={hours ? [hours.days, hours.times] : [t('connect.centre.notListed')]}
            />
            <View style={styles.infoDivider} />
            <InfoColumn
              icon={Phone}
              tint={palette.details.contact}
              title={t('connect.centre.contact')}
              lines={[centre.phone ?? t('connect.centre.notListed')]}
              linkLabel={
                centre.phone ? t('connect.centre.call', { phone: centre.phone }) : undefined
              }
              onPress={centre.phone ? onCall : undefined}
            />
            {centre.verified ? (
              <>
                <View style={styles.infoDivider} />
                <InfoColumn
                  icon={ShieldCheck}
                  tint={palette.details.verified}
                  title={t('connect.centre.verified')}
                  lines={[t('connect.centre.verifiedBody')]}
                  muted
                />
              </>
            ) : null}
          </View>

          <View style={styles.banner}>
            <LinearGradient
              colors={palette.details.bannerGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.bannerArt}>
              <Image
                source={require('../../assets/home/csc-kiosk-banner.jpg')}
                style={styles.bannerImage}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View style={styles.bannerCopy}>
              <Text style={styles.bannerTitle}>{t('connect.centre.bannerTitle')}</Text>
              <Text style={styles.bannerBody}>{t('connect.centre.bannerBody')}</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.sectionTitle}>
              {t('connect.centre.services')}
            </Text>
            {canExpand ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  expanded ? 'connect.centre.showFewer' : 'connect.services.viewAll',
                )}
                accessibilityState={{ expanded }}
                hitSlop={14}
                onPress={() => setExpanded(!expanded)}
                style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
              >
                <Text style={styles.sectionActionLabel}>
                  {t(expanded ? 'connect.centre.showFewer' : 'connect.services.viewAll')}
                </Text>
                <ChevronRight
                  color={palette.brandBlue}
                  size={17}
                  strokeWidth={2.4}
                  style={expanded ? styles.chevronUp : undefined}
                />
              </Pressable>
            ) : null}
          </View>

          {services.shown.length === 0 ? (
            <Text style={styles.noServices}>{t('connect.centre.noServices')}</Text>
          ) : (
            <View style={styles.serviceList}>
              {services.shown.map((offering) => (
                <ServiceRow
                  key={offering}
                  offering={offering}
                  onPress={() => onOpenService(offering)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('connect.finder.directionsTo', { name: centre.name })}
          onPress={onDirections}
          style={({ pressed }) => [
            styles.footerButton,
            styles.outlineButton,
            pressed && styles.pressed,
          ]}
        >
          <Navigation color={palette.brandBlue} size={22} strokeWidth={2.2} />
          <Text numberOfLines={1} style={styles.outlineLabel}>
            {t('connect.finder.directions')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('connect.centre.connectShare')}
          accessibilityHint={t('connect.centre.connectShareBody')}
          onPress={onConnect}
          style={({ pressed }) => [
            styles.footerButton,
            { backgroundColor: pressed ? palette.brandBluePressed : palette.brandBlue },
          ]}
        >
          <UsersRound color={palette.onBrand} size={24} strokeWidth={2.2} />
          <View style={styles.connectCopy}>
            <Text numberOfLines={1} style={styles.connectLabel}>
              {t('connect.centre.connectShare')}
            </Text>
            <Text numberOfLines={1} style={styles.connectBody}>
              {t('connect.centre.connectShareBody')}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

type OverlayButtonProps = {
  readonly label: string;
  readonly selected?: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
};

function OverlayButton({ label, selected, onPress, children }: OverlayButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.overlayButton, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

type InfoColumnProps = {
  readonly icon: LucideIcon;
  readonly tint: { readonly badge: string; readonly icon: string };
  readonly title: string;
  readonly lines: readonly string[];
  /** Makes the column a button, e.g. to call the listed number. */
  readonly onPress?: () => void;
  readonly linkLabel?: string;
  readonly muted?: boolean;
};

function InfoColumn({
  icon: Icon,
  tint,
  title,
  lines,
  onPress,
  linkLabel,
  muted,
}: InfoColumnProps) {
  const body = (
    <>
      <View style={[styles.infoBadge, { backgroundColor: tint.badge }]}>
        <Icon color={tint.icon} size={20} strokeWidth={2.2} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoTitle}>{title}</Text>
        {lines.map((line) => (
          <Text
            key={line}
            style={[styles.infoLine, onPress && styles.infoLink, muted && styles.infoLineMuted]}
          >
            {line}
          </Text>
        ))}
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.infoColumn} accessible accessibilityLabel={[title, ...lines].join(', ')}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={linkLabel ?? [title, ...lines].join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.infoColumn, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

function ServiceRow({
  offering,
  onPress,
}: {
  readonly offering: CscOffering;
  readonly onPress: () => void;
}) {
  const { t } = useTranslation();
  const tint = palette.detailServices[offering];
  const Icon = SERVICE_ICONS[offering];
  const title = t(`connect.centre.offerings.${offering}.title`);
  const caption = t(`connect.centre.offerings.${offering}.caption`);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${caption}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceRow,
        { backgroundColor: tint.tile, borderColor: tint.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.serviceBadge, { backgroundColor: tint.badge }]}>
        <Icon color={tint.icon} size={24} strokeWidth={2.2} />
      </View>
      <View style={styles.serviceCopy}>
        <Text numberOfLines={1} style={styles.serviceTitle}>
          {title}
        </Text>
        <Text numberOfLines={2} style={styles.serviceCaption}>
          {caption}
        </Text>
      </View>
      <ChevronRight color={palette.headerIcon} size={20} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  pressed: {
    opacity: 0.7,
  },

  photoFrame: {
    alignSelf: 'center',
    backgroundColor: palette.photoWell,
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayRow: {
    position: 'absolute',
    left: PAGE_PADDING,
    right: PAGE_PADDING,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  overlayActions: {
    flexDirection: 'row',
    gap: 10,
  },
  overlayButton: {
    width: OVERLAY_BUTTON,
    height: OVERLAY_BUTTON,
    borderRadius: OVERLAY_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.details.overlayButton,
    shadowColor: palette.details.overlayShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  counter: {
    position: 'absolute',
    right: PAGE_PADDING,
    bottom: SHEET_OVERLAP + 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: palette.details.counter,
  },
  counterLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.details.onCounter,
  },

  sheet: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    marginTop: -SHEET_OVERLAP,
    gap: 16,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: palette.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleCopy: {
    flex: 1,
    gap: 6,
  },
  name: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '800',
    color: palette.heading,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  bullet: {
    fontSize: 14,
    color: palette.textMuted,
  },
  distance: {
    fontSize: 14.5,
    color: palette.textSecondary,
  },
  directionsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 150,
    minHeight: 44,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  directionsChipLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: palette.secondaryButton.text,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -6,
  },
  address: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    color: palette.textPrimary,
  },

  infoCard: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  infoColumn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  infoDivider: {
    width: 1,
    marginHorizontal: 2,
    backgroundColor: palette.details.divider,
  },
  infoBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCopy: {
    flex: 1,
    gap: 2,
  },
  infoTitle: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '700',
    color: palette.heading,
  },
  infoLine: {
    fontSize: 12,
    lineHeight: 16,
    color: palette.textPrimary,
  },
  infoLink: {
    fontWeight: '700',
    color: palette.details.phoneText,
  },
  infoLineMuted: {
    color: palette.textMuted,
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 120,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: palette.details.bannerGradient[0],
  },
  bannerArt: {
    width: '38%',
    aspectRatio: ILLUSTRATION_ASPECT_RATIO,
    mixBlendMode: 'multiply',
    pointerEvents: 'none',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerCopy: {
    flex: 1,
    gap: 6,
    paddingVertical: 14,
    paddingRight: 14,
  },
  bannerTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: palette.heading,
  },
  bannerBody: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    color: palette.heading,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionActionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.brandBlue,
  },
  chevronUp: {
    transform: [{ rotate: '-90deg' }],
  },
  noServices: {
    fontSize: 14.5,
    color: palette.textSecondary,
  },
  serviceList: {
    gap: 10,
    marginTop: -4,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  serviceBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCopy: {
    flex: 1,
    gap: 2,
  },
  serviceTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: palette.heading,
  },
  serviceCaption: {
    fontSize: 13.5,
    lineHeight: 18,
    color: palette.textSecondary,
  },

  footer: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: palette.background,
  },
  footerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: palette.details.outlineButtonBorder,
    backgroundColor: palette.surface,
  },
  outlineLabel: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: palette.brandBlue,
  },
  connectCopy: {
    flexShrink: 1,
  },
  connectLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.onBrand,
  },
  connectBody: {
    fontSize: 11.5,
    color: palette.onBrand,
  },
});
