/**
 * Onboarding — the "Scan Karo. Save Karo." explainer.
 *
 * Layout follows the approved explainer artwork: brand header with a Skip pill, a three-line
 * headline, then a split body — four feature rows on the left, the scanner hero on the right —
 * and a footer with the step dots and the Next button over a soft blue swoosh.
 *
 * Like the splash, this screen is light-only artwork and does not read from `useTheme()`.
 * The body scrolls so small handsets and large accessibility font sizes never clip copy; the
 * footer is pinned so Next is always reachable.
 *
 * The dots show the planned three steps; Next hands off to mobile-number registration,
 * which is the second of them.
 */

import { StatusBar } from 'expo-status-bar';
import { ChevronRight, Scan, ShieldCheck, Users, Zap, type LucideIcon } from 'lucide-react-native';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { BottomWave } from './BottomWave';
import { FeatureItem } from './FeatureItem';
import { onboardingPalette as palette } from './palette';

const STEP_COUNT = 3;
const CURRENT_STEP = 0;

/** Intrinsic size of `hero-scanner-composition.jpg`. */
const HERO_ASPECT = 768 / 1376;
const WAVE_HEIGHT = 140;
/** Keeps the split layout from sprawling on tablets. */
const CONTENT_MAX_WIDTH = 560;

type Feature = {
  readonly key: 'scan' | 'vault' | 'forms' | 'reach';
  readonly icon: LucideIcon;
  readonly color: string;
  readonly surface: string;
};

const FEATURES: readonly Feature[] = [
  { key: 'scan', icon: Scan, color: palette.featureScan, surface: palette.featureScanSurface },
  {
    key: 'vault',
    icon: ShieldCheck,
    color: palette.featureVault,
    surface: palette.featureVaultSurface,
  },
  { key: 'forms', icon: Zap, color: palette.featureForms, surface: palette.featureFormsSurface },
  { key: 'reach', icon: Users, color: palette.featureReach, surface: palette.featureReachSurface },
];

export type OnboardingScreenProps = {
  /** Called when the citizen taps Next. */
  readonly onNext: () => void;
  /** Called when the citizen taps Skip. */
  readonly onSkip: () => void;
};

export function OnboardingScreen({ onNext, onSkip }: OnboardingScreenProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  // Scale the headline with the screen so "Har Jagah Kaam Aayega." holds one line on common
  // handsets; it wraps rather than clips on the narrowest ones.
  const headlineSize = Math.max(24, Math.min(32, width * 0.072));

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.waveLayer} pointerEvents="none">
        <BottomWave width={width} height={WAVE_HEIGHT} />
      </View>

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* ---- Header ---- */}
        <View style={[styles.header, styles.constrained]}>
          <View style={styles.brand}>
            <Image
              source={require('../../assets/onboarding/bharatdoc-logo-128.png')}
              style={styles.logo}
              accessibilityIgnoresInvertColors
            />
            <View style={styles.brandCopy}>
              <Text style={styles.wordmark} accessibilityRole="header">
                <Text style={{ color: palette.brandNavy }}>{t('splash.brandPrimary')}</Text>
                <Text style={{ color: palette.brandBlue, fontWeight: '800' }}>
                  {t('splash.brandAccent')}
                </Text>
              </Text>
              <Text style={styles.brandSubtitle} numberOfLines={2}>
                {t('onboarding.brandSubtitle')}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.skipHint')}
            hitSlop={8}
            onPress={onSkip}
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
          >
            <Text style={styles.skipLabel}>{t('onboarding.skip')}</Text>
            <ChevronRight color={palette.skipLabel} size={14} strokeWidth={2.4} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, styles.constrained]}
          showsVerticalScrollIndicator={false}
        >
          {/* ---- Headline ---- */}
          <Text
            accessibilityRole="header"
            style={[
              styles.headline,
              { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.2) },
            ]}
          >
            <Text style={{ color: palette.accentScan }}>{t('onboarding.headlineScan')}</Text>
            {t('onboarding.headlineKaro')}
            {'\n'}
            <Text style={{ color: palette.accentSave }}>{t('onboarding.headlineSave')}</Text>
            {t('onboarding.headlineKaro')}
            {'\n'}
            {t('onboarding.headlineEverywhere')}
          </Text>

          <Text style={styles.subtitle}>{t('onboarding.subtitle')}</Text>

          {/* ---- Split body: features left, hero right ---- */}
          <View style={styles.split}>
            <View style={styles.features}>
              {FEATURES.map((feature) => (
                <FeatureItem
                  key={feature.key}
                  icon={feature.icon}
                  color={feature.color}
                  surface={feature.surface}
                  title={t(`onboarding.features.${feature.key}.title`)}
                  body={t(`onboarding.features.${feature.key}.body`)}
                />
              ))}
            </View>

            <View style={styles.hero}>
              <Image
                source={require('../../assets/onboarding/hero-scanner-composition.jpg')}
                style={styles.heroImage}
                resizeMode="contain"
                accessible={false}
                accessibilityIgnoresInvertColors
              />
            </View>
          </View>
        </ScrollView>

        {/* ---- Footer ---- */}
        <View style={[styles.footer, styles.constrained]}>
          <View
            style={styles.dots}
            accessible
            accessibilityLabel={t('onboarding.progress', {
              current: CURRENT_STEP + 1,
              total: STEP_COUNT,
            })}
          >
            {Array.from({ length: STEP_COUNT }, (_, index) => (
              <View
                key={index}
                style={[styles.dot, index === CURRENT_STEP ? styles.dotActive : styles.dotInactive]}
              />
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.next')}
            onPress={onNext}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaLabel}>{t('onboarding.next')}</Text>
            <ChevronRight color={palette.ctaLabel} size={20} strokeWidth={2.6} />
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  waveLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  safeArea: {
    flex: 1,
  },
  constrained: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  pressed: {
    opacity: 0.7,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  brandCopy: {
    flex: 1,
    marginLeft: 10,
  },
  wordmark: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    marginTop: 1,
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
    color: palette.textSecondary,
  },
  skip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: palette.skipSurface,
  },
  skipLabel: {
    marginRight: 2,
    fontSize: 13,
    fontWeight: '600',
    color: palette.skipLabel,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headline: {
    fontWeight: '800',
    letterSpacing: -0.5,
    color: palette.textPrimary,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textSecondary,
  },

  split: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  features: {
    flex: 48,
    gap: 18,
  },
  hero: {
    flex: 52,
    marginLeft: 8,
  },
  heroImage: {
    width: '100%',
    height: undefined,
    aspectRatio: HERO_ASPECT,
    borderRadius: 20,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 24,
    backgroundColor: palette.dotActive,
  },
  dotInactive: {
    width: 6,
    backgroundColor: palette.dotInactive,
  },
  cta: {
    height: 54,
    borderRadius: 28,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.cta,
    shadowColor: palette.cta,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaPressed: {
    backgroundColor: palette.ctaPressed,
  },
  ctaLabel: {
    marginRight: 6,
    fontSize: 17,
    fontWeight: '700',
    color: palette.ctaLabel,
  },
});
