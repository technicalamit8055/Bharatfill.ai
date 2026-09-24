/**
 * The blue "Scan करें, Secure रखें, कभी भी, कहीं भी" hero with the Scan Document button.
 *
 * The illustration is a JPEG on white. It sits in a view with `mixBlendMode: 'multiply'`, so
 * its white takes on the card's gradient instead of showing as a box. Blending needs the New
 * Architecture (on in `app.json`) and Android 10+; older Android shows the white edge, which
 * the pale right end of the gradient keeps faint. The arm in the artwork runs off the bottom
 * edge, so the image is anchored bottom-right.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Camera } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { ILLUSTRATION_ASPECT_RATIO } from './layout';
import { homePalette as palette } from './palette';

export function ScanHeroCard({ onScan }: { readonly onScan: () => void }) {
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
          source={require('../../assets/home/home-hero-scanner.jpg')}
          style={styles.artImage}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>

      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('home.hero.title')}
        </Text>
        <Text style={styles.body}>{t('home.hero.body')}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.hero.action')}
        hitSlop={2}
        onPress={onScan}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <Camera color={palette.onBrand} size={20} strokeWidth={2.2} />
        <Text numberOfLines={1} style={styles.ctaLabel}>
          {t('home.hero.action')}
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
    right: -6,
    bottom: -2,
    width: '54%',
    aspectRatio: ILLUSTRATION_ASPECT_RATIO,
    mixBlendMode: 'multiply',
    pointerEvents: 'none',
  },
  artImage: {
    width: '100%',
    height: '100%',
  },

  // The copy keeps clear of the artwork; the button below may run past it on narrow phones.
  copy: {
    width: '56%',
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: palette.heroTitle,
  },
  body: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: palette.textSecondary,
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    height: 44,
    marginTop: 14,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: palette.brandBlue,
    shadowColor: palette.brandBlue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  ctaPressed: {
    backgroundColor: palette.brandBluePressed,
  },
  ctaLabel: {
    flexShrink: 1,
    fontSize: 15.5,
    fontWeight: '700',
    color: palette.onBrand,
  },
});
