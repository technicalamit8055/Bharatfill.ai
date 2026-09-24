/**
 * Mobile-number registration — "Apna Mobile Number Dalein".
 *
 * Layout follows the approved registration artwork: back and Skip, the brand block with the
 * India Gate watermark behind it on the right, the headline, the +91 field, Get OTP, the legal
 * line, a privacy reassurance card, and the monument skyline closing the page.
 *
 * Light-only branded artwork like the splash and onboarding, so it does not read from
 * `useTheme()`. Everything scrolls inside a keyboard-avoiding view so the field and Get OTP stay
 * reachable with the number pad open on a small handset.
 *
 * The screen never stores or logs the number. It hands a validated E.164 string to
 * `onRequestOtp` and leaves what happens next to the route.
 */

import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { mobileNumberStatus, toE164 } from '../../lib/auth/phone';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { BrandHeader } from './BrandHeader';
import { registrationPalette as palette } from './palette';
import { SkylineFooter } from './SkylineFooter';
import { PhoneNumberField } from './PhoneNumberField';

/** Keeps the form from sprawling on tablets. */
const CONTENT_MAX_WIDTH = 560;

/** `india-gate-tricolor.jpg` is 1376x768. */
const WATERMARK_ASPECT = 1376 / 768;

export type MobileNumberScreenProps = {
  readonly onBack: () => void;
  readonly onSkip: () => void;
  /** Receives a validated `+91XXXXXXXXXX` number. */
  readonly onRequestOtp: (e164: string) => void;
  /** Omitted while the legal pages are not published; the names then render as plain text. */
  readonly onOpenTerms?: () => void;
  readonly onOpenPrivacy?: () => void;
};

export function MobileNumberScreen({
  onBack,
  onSkip,
  onRequestOtp,
  onOpenTerms,
  onOpenPrivacy,
}: MobileNumberScreenProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const [digits, setDigits] = useState('');
  const [attempted, setAttempted] = useState(false);

  const status = mobileNumberStatus(digits);
  const showError = status === 'invalid' || (attempted && status !== 'valid');

  const submit = () => {
    setAttempted(true);
    if (status !== 'valid') return;
    onRequestOtp(toE164(digits));
  };

  const headlineSize = Math.max(26, Math.min(34, width * 0.08));
  const watermarkWidth = Math.min(240, width * 0.54);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              {/* ---- Watermark (behind everything that follows) ---- */}
              <View style={styles.watermark} pointerEvents="none" accessible={false}>
                <Image
                  source={require('../../assets/registration/india-gate-tricolor.jpg')}
                  style={{ width: watermarkWidth, height: watermarkWidth / WATERMARK_ASPECT }}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>

              {/* ---- Top bar ---- */}
              <View style={styles.topBar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('registration.back')}
                  hitSlop={12}
                  onPress={onBack}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <ChevronLeft color={palette.navIcon} size={28} strokeWidth={2.2} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('registration.skipHint')}
                  hitSlop={12}
                  onPress={onSkip}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={styles.skipLabel}>{t('registration.skip')}</Text>
                </Pressable>
              </View>

              {/* ---- Brand ---- */}
              <BrandHeader logo={require('../../assets/registration/bharatdoc-logo.png')} />

              {/* ---- Headline ---- */}
              <Text
                accessibilityRole="header"
                style={[
                  styles.headline,
                  { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.2) },
                ]}
              >
                {t('registration.headlineLead')}
                {'\n'}
                <Text style={{ color: palette.brandBlue }}>{t('registration.headlineAccent')}</Text>
              </Text>
              <Text style={styles.subtitle}>{t('registration.subtitle')}</Text>

              {/* ---- Phone field ---- */}
              <Text style={styles.fieldLabel}>{t('registration.fieldLabel')}</Text>
              <PhoneNumberField
                value={digits}
                onChangeDigits={setDigits}
                onSubmitEditing={submit}
                label={t('registration.fieldLabel')}
                countryLabel={t('registration.country')}
                placeholder={t('registration.placeholder')}
                hasError={showError}
              />
              {showError ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {t('registration.invalidNumber')}
                </Text>
              ) : null}

              {/* ---- CTA ---- */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('registration.getOtp')}
                onPress={submit}
                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
              >
                <Text style={styles.ctaLabel}>{t('registration.getOtp')}</Text>
                <View style={styles.ctaIcon}>
                  <ChevronRight color={palette.ctaLabel} size={24} strokeWidth={2.4} />
                </View>
              </Pressable>

              {/* ---- Legal ---- */}
              <Text style={styles.legal}>
                {t('registration.legalPrefix')}
                {'\n'}
                <LegalLink label={t('registration.terms')} onPress={onOpenTerms} />
                {` ${t('registration.and')} `}
                <LegalLink label={t('registration.privacyPolicy')} onPress={onOpenPrivacy} />
                {t('registration.legalSuffix')}
              </Text>

              {/* ---- Privacy card ---- */}
              <View
                style={styles.card}
                accessible
                accessibilityLabel={`${t('registration.privacyTitle')}. ${t('registration.privacyBody')}`}
              >
                <View style={styles.shieldBadge}>
                  <ShieldCheck color={palette.shield} size={28} strokeWidth={2.2} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{t('registration.privacyTitle')}</Text>
                  <Text style={styles.cardBody}>{t('registration.privacyBody')}</Text>
                </View>
              </View>
            </View>

            {/* ---- Skyline footer ---- */}
            <SkylineFooter />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

/** A Terms/Privacy name inside the legal sentence; a link only when there is somewhere to go. */
function LegalLink({ label, onPress }: { readonly label: string; readonly onPress?: () => void }) {
  if (!onPress) return <Text style={styles.legalName}>{label}</Text>;
  return (
    <Text style={styles.legalName} accessibilityRole="link" onPress={onPress} suppressHighlighting>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  pressed: {
    opacity: 0.6,
  },

  watermark: {
    position: 'absolute',
    top: 92,
    right: -18,
    opacity: 0.5,
    transform: [{ rotate: '-8deg' }],
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginLeft: -6,
  },
  skipLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: palette.navLabel,
  },

  headline: {
    marginTop: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: palette.textPrimary,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15.5,
    lineHeight: 22,
    color: palette.textSecondary,
  },

  fieldLabel: {
    marginTop: 28,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '500',
    color: palette.textPrimary,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 17,
    color: palette.errorText,
  },

  cta: {
    height: 56,
    marginTop: 20,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.cta,
    shadowColor: palette.cta,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaPressed: {
    backgroundColor: palette.ctaPressed,
  },
  ctaLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.ctaLabel,
  },
  ctaIcon: {
    position: 'absolute',
    right: 20,
  },

  legal: {
    marginTop: 20,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  legalName: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.link,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardSurface,
  },
  shieldBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.shieldSurface,
  },
  cardCopy: {
    flex: 1,
    marginLeft: 14,
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  cardBody: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
  },
});
