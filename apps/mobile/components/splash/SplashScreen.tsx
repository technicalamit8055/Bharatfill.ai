/**
 * BharatDoc splash screen.
 *
 * Layout mirrors `assets/splash/mockup-reference.png`: Hindi watermark and tilted calligraphy
 * pinned to the top corners, the mascot icon and wordmark centred, and the monument skyline
 * with the tricolour ribbon closing the bottom.
 *
 * The screen is always light — it is the first frame a citizen sees and must match the store
 * screenshots and the native launch image regardless of the device's colour scheme, so it does
 * not read from `useTheme()`.
 *
 * Timing: the whole screen fades and springs in, then hands off automatically. Tapping
 * anywhere skips the wait, because a citizen on a slow handset should never be held on a
 * decorative frame.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { GradientSpinner } from './GradientSpinner';
import { IndiaOutline } from './IndiaOutline';
import { splashPalette } from './palette';
import { TricolorWave } from './TricolorWave';

/** How long the splash holds before it hands off on its own. */
export const SPLASH_DURATION_MS = 3200;

const ICON_SIZE = 165;
const WAVE_HEIGHT = 104;
/**
 * The skyline asset is a 576x160 crop whose lower edge already contains a slice of the
 * saffron wave. Rendering it at this height and letting the SVG ribbon overlap its bottom
 * keeps that baked-in sliver hidden behind the drawn wave.
 */
const SKYLINE_RATIO = 160 / 576;

export type SplashScreenProps = {
  /** Called once, when the timer completes or the citizen taps to skip. */
  readonly onFinish: () => void;
  /** Overridable so tests do not wait out the full hold. */
  readonly durationMs?: number;
};

export function SplashScreen({ onFinish, durationMs = SPLASH_DURATION_MS }: SplashScreenProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  /** Guards against the tap and the timer both firing a navigation. */
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 520,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(finish, durationMs);
    return () => clearTimeout(timer);
  }, [fade, scale, finish, durationMs]);

  const skylineHeight = width * SKYLINE_RATIO;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={finish}
      accessibilityRole="button"
      accessibilityLabel={t('splash.skipHint')}
      style={styles.root}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Animated.View style={[styles.content, { opacity: fade }]}>
          {/* ---- Top watermarks ---- */}
          <View style={styles.topRow}>
            <View style={styles.hindiMark}>
              <Text style={styles.hindiText}>{t('splash.hindiMark')}</Text>
              <View style={styles.miniBar}>
                <View style={[styles.miniBarSegment, { backgroundColor: splashPalette.saffron }]} />
                <View
                  style={[styles.miniBarSegment, { backgroundColor: splashPalette.neutralBar }]}
                />
                <View style={[styles.miniBarSegment, { backgroundColor: splashPalette.green }]} />
              </View>
            </View>

            <View style={styles.calligraphyWrap} accessible={false}>
              <View style={styles.mapBehind} pointerEvents="none">
                <IndiaOutline width={128} height={140} color={splashPalette.calligraphy} />
              </View>
              <Text style={styles.calligraphyText}>{t('splash.calligraphy')}</Text>
            </View>
          </View>

          {/* ---- Centre hero ---- */}
          <View style={styles.hero}>
            <Animated.View style={[styles.iconGlow, { transform: [{ scale }] }]}>
              <Image
                source={require('../../assets/splash/logo-mascot.png')}
                style={styles.icon}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </Animated.View>

            <View style={styles.titleRow}>
              <Text style={[styles.title, styles.titleNavy]}>{t('splash.brandPrimary')}</Text>
              <Text style={[styles.title, styles.titleBlue]}>{t('splash.brandAccent')}</Text>
            </View>

            <Text style={styles.subtitle}>{t('splash.subtitle')}</Text>

            <View style={styles.loaderBlock}>
              <GradientSpinner />
              <Text style={styles.loadingText}>{t('splash.loading')}</Text>
            </View>
          </View>

          {/* ---- Bottom skyline, ribbon and footer ---- */}
          <View style={styles.bottom}>
            <View style={styles.skylineLayer} pointerEvents="none">
              <Image
                source={require('../../assets/splash/monuments-bg.png')}
                style={{ width, height: skylineHeight, opacity: 0.75 }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
              <View style={styles.waveLayer}>
                <TricolorWave width={width} height={WAVE_HEIGHT} />
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('splash.footer')}</Text>
              <View style={styles.footerBar}>
                <View style={[styles.footerBarSegment, { backgroundColor: splashPalette.saffron }]} />
                <View
                  style={[styles.footerBarSegment, { backgroundColor: splashPalette.neutralBar }]}
                />
                <View style={[styles.footerBarSegment, { backgroundColor: splashPalette.green }]} />
              </View>
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: splashPalette.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },

  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 28,
    paddingTop: 24,
  },
  hindiMark: {
    alignItems: 'flex-start',
  },
  hindiText: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
    color: splashPalette.watermark,
  },
  miniBar: {
    flexDirection: 'row',
    width: 66,
    height: 3,
    marginTop: 10,
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniBarSegment: {
    flex: 1,
  },

  calligraphyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  mapBehind: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calligraphyText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    color: splashPalette.calligraphy,
    transform: [{ rotate: '-8deg' }],
  },

  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconGlow: {
    shadowColor: splashPalette.iconGlow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 26,
    elevation: 12,
    borderRadius: 38,
    // Android drops the shadow unless the layer is opaque.
    backgroundColor: splashPalette.background,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  titleRow: {
    flexDirection: 'row',
    marginTop: 26,
  },
  title: {
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  titleNavy: {
    color: splashPalette.brandNavy,
  },
  titleBlue: {
    color: splashPalette.brandBlue,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
    color: splashPalette.subtitle,
  },
  loaderBlock: {
    marginTop: 36,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '500',
    color: splashPalette.caption,
  },

  bottom: {
    justifyContent: 'flex-end',
  },
  skylineLayer: {
    justifyContent: 'flex-end',
  },
  waveLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 10,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    color: splashPalette.watermark,
  },
  footerBar: {
    flexDirection: 'row',
    width: 132,
    height: 3,
    marginTop: 9,
    borderRadius: 2,
    overflow: 'hidden',
  },
  footerBarSegment: {
    flex: 1,
  },
});
