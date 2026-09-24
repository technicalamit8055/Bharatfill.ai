/**
 * "Form Bharna Ab Aur Bhi Aasaan" — the banner that points the citizen at sharing documents with
 * a nearby Cyber Cafe / CSC (spec §3 Feature 3). The kiosk illustration sits bottom-left,
 * blended into the card the same way as the hero (see `ScanHeroCard`).
 *
 * On a wide screen Connect Now sits beside the copy as in the mockup; on a phone there is no
 * room for that, so it goes under the copy.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { ILLUSTRATION_ASPECT_RATIO } from './layout';
import { homePalette as palette } from './palette';

/** Below this content width the button moves under the copy. */
const SIDE_BY_SIDE_MIN_WIDTH = 480;

export type CscConnectBannerProps = {
  /** Width of the page's content column. */
  readonly width: number;
  readonly onConnect: () => void;
};

export function CscConnectBanner({ width, onConnect }: CscConnectBannerProps) {
  const { t } = useTranslation();
  const sideBySide = width >= SIDE_BY_SIDE_MIN_WIDTH;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={palette.bannerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.art}>
        <Image
          source={require('../../assets/home/csc-kiosk-banner.jpg')}
          style={styles.artImage}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>

      <View style={[styles.body, sideBySide && styles.bodySideBySide]}>
        <View style={sideBySide && styles.copySideBySide}>
          <Text accessibilityRole="header" style={styles.title}>
            {t('home.connect.title')}
          </Text>
          <Text style={styles.text}>{t('home.connect.body')}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.connect.action')}
          hitSlop={6}
          onPress={onConnect}
          style={({ pressed }) => [
            styles.cta,
            sideBySide ? styles.ctaSideBySide : styles.ctaBelow,
            pressed && styles.pressed,
          ]}
        >
          <Text numberOfLines={1} style={styles.ctaLabel}>
            {t('home.connect.action')}
          </Text>
          <ChevronRight color={palette.brandBlue} size={17} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: palette.bannerGradient[0],
  },
  pressed: {
    opacity: 0.7,
  },

  art: {
    position: 'absolute',
    left: -6,
    bottom: -4,
    width: '36%',
    aspectRatio: ILLUSTRATION_ASPECT_RATIO,
    mixBlendMode: 'multiply',
    pointerEvents: 'none',
  },
  artImage: {
    width: '100%',
    height: '100%',
  },

  body: {
    marginLeft: '33%',
    paddingVertical: 14,
    paddingRight: 14,
  },
  bodySideBySide: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
  },
  copySideBySide: {
    flex: 1,
  },
  title: {
    fontSize: 15.5,
    lineHeight: 21,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  text: {
    marginTop: 4,
    fontSize: 12.5,
    lineHeight: 18,
    color: palette.textSecondary,
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingLeft: 16,
    paddingRight: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.bannerButtonBorder,
    backgroundColor: palette.surface,
  },
  ctaBelow: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  ctaSideBySide: {
    marginLeft: 12,
  },
  ctaLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.brandBlue,
  },
});
