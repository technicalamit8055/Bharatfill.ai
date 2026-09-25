/**
 * "Find a nearby Common Service Center" — the hero at the top of Connect, with the blue Find
 * CSC Near You button.
 *
 * The CSC kiosk illustration is the JPEG on white that Home's banner uses. It sits bottom-right
 * in a view with `mixBlendMode: 'multiply'`, so its white takes on the card's gradient (see
 * `ScanHeroCard` for the platform caveats). The copy keeps to the left so the kiosk is never
 * covered.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { ILLUSTRATION_ASPECT_RATIO } from '../home/layout';
import { connectPalette as palette } from './palette';

export function ConnectHero({ onFindNearby }: { readonly onFindNearby: () => void }) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={palette.heroGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
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

      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('connect.hero.title')}
        </Text>
        <Text style={styles.body}>{t('connect.hero.body')}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('connect.hero.action')}
        hitSlop={2}
        onPress={onFindNearby}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Text numberOfLines={1} style={styles.ctaLabel}>
          {t('connect.hero.action')}
        </Text>
        <ArrowRight color={palette.onBrand} size={18} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    backgroundColor: palette.heroGradient[0],
  },

  art: {
    position: 'absolute',
    right: -10,
    bottom: -6,
    width: '50%',
    aspectRatio: ILLUSTRATION_ASPECT_RATIO,
    mixBlendMode: 'multiply',
    pointerEvents: 'none',
  },
  artImage: {
    width: '100%',
    height: '100%',
  },

  copy: {
    width: '56%',
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '800',
    color: palette.heading,
  },
  body: {
    marginTop: 8,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },

  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: palette.brandBlue,
    shadowColor: palette.brandBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaPressed: {
    backgroundColor: palette.brandBluePressed,
  },
  ctaLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '700',
    color: palette.onBrand,
  },
});
