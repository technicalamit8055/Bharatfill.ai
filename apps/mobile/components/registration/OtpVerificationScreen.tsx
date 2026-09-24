/**
 * OTP verification — "OTP Enter Karein".
 *
 * Layout follows the approved OTP artwork: back and Help?, the brand block with the India map
 * and calligraphy watermark behind it on the right, the "OTP VERIFICATION" label, the
 * headline, the number the code went to, six code boxes, the expiry countdown, Verify OTP,
 * Resend, the privacy card, and the monument skyline closing the page.
 *
 * Light-only branded artwork like the rest of registration, so it does not read from
 * `useTheme()`. Everything scrolls inside a keyboard-avoiding view so the boxes and Verify stay
 * reachable with the number pad open on a small handset.
 *
 * The screen never stores or logs the code. It hands a complete 6-digit string to `onVerify`
 * and leaves what happens next to the route. The countdown is measured against `expiresAt`
 * rather than counted down tick by tick, so it stays right after the app was backgrounded.
 */

import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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

import { formatCountdown, isCompleteOtp, secondsRemaining } from '../../lib/auth/otp';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { BrandHeader } from './BrandHeader';
import { OtpCodeField } from './OtpCodeField';
import { registrationPalette as palette } from './palette';
import { SkylineFooter } from './SkylineFooter';

/** Keeps the form from sprawling on tablets. */
const CONTENT_MAX_WIDTH = 560;

/**
 * `india-map-watermark.jpg` is 896x1200: the map with the "Digital Bharat Stronger Citizens"
 * calligraphy baked in, on white. The page background is white too, so no box shows.
 */
const WATERMARK_ASPECT = 896 / 1200;

export type OtpVerificationScreenProps = {
  /** The citizen's own number as it should read, e.g. "+91 98765 43210". */
  readonly phoneNumber: string;
  /** Epoch ms when the sent code stops working; Resend unlocks then. */
  readonly expiresAt: number;
  readonly onBack: () => void;
  readonly onHelp: () => void;
  /** Receives a complete 6-digit code. */
  readonly onVerify: (code: string) => void;
  readonly onResend: () => void;
};

export function OtpVerificationScreen({
  phoneNumber,
  expiresAt,
  onBack,
  onHelp,
  onVerify,
  onResend,
}: OtpVerificationScreenProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const [code, setCode] = useState('');
  const [attempted, setAttempted] = useState(false);
  const remaining = useSecondsRemaining(expiresAt);

  const expired = remaining === 0;
  const showError = attempted && !isCompleteOtp(code);

  const submit = () => {
    setAttempted(true);
    if (!isCompleteOtp(code)) return;
    onVerify(code);
  };

  const headlineSize = Math.max(26, Math.min(34, width * 0.08));
  const watermarkWidth = Math.min(170, width * 0.4);

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
                  source={require('../../assets/otp/india-map-watermark.jpg')}
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
                  accessibilityLabel={t('otp.helpHint')}
                  hitSlop={12}
                  onPress={onHelp}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={styles.helpLabel}>{t('otp.help')}</Text>
                </Pressable>
              </View>

              {/* ---- Brand ---- */}
              <BrandHeader logo={require('../../assets/otp/bharatdoc-logo.png')} />

              {/* ---- Headline ---- */}
              <Text style={styles.eyebrow}>{t('otp.eyebrow')}</Text>
              <Text
                accessibilityRole="header"
                style={[
                  styles.headline,
                  { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.2) },
                ]}
              >
                <Text style={{ color: palette.brandBlue }}>{t('otp.headlineAccent')}</Text>
                {` ${t('otp.headlineRest')}`}
              </Text>
              <Text style={styles.subtitle}>{t('otp.sentTo', { phone: phoneNumber })}</Text>

              {/* ---- Code ---- */}
              <View style={styles.codeField}>
                <OtpCodeField
                  value={code}
                  onChangeCode={setCode}
                  onSubmitEditing={submit}
                  label={t('otp.codeLabel')}
                  hasError={showError}
                />
              </View>
              {showError ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {t('otp.incomplete')}
                </Text>
              ) : null}

              {/* ---- Countdown ---- */}
              {expired ? (
                <Text style={styles.timer} accessibilityLiveRegion="polite">
                  {t('otp.expired')}
                </Text>
              ) : (
                // Not a live region: a screen reader would otherwise read out every second.
                <Text style={styles.timer}>
                  {t('otp.expiresPrefix')}
                  <Text style={styles.timerValue}>{formatCountdown(remaining)}</Text>
                  {t('otp.expiresSuffix')}
                </Text>
              )}

              {/* ---- CTA ---- */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('otp.verify')}
                onPress={submit}
                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
              >
                <Text style={styles.ctaLabel}>{t('otp.verify')}</Text>
                <View style={styles.ctaIcon}>
                  <ChevronRight color={palette.ctaLabel} size={24} strokeWidth={2.4} />
                </View>
              </Pressable>

              {/* ---- Resend ---- */}
              <View style={styles.resendRow}>
                <Text style={styles.resendPrompt}>{t('otp.notReceived')} </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={expired ? t('otp.resend') : t('otp.resendWait')}
                  accessibilityState={{ disabled: !expired }}
                  disabled={!expired}
                  hitSlop={10}
                  onPress={onResend}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={[styles.resendLink, !expired && styles.resendLinkDisabled]}>
                    {t('otp.resend')}
                  </Text>
                </Pressable>
              </View>

              {/* ---- Privacy card ---- */}
              <View
                style={styles.card}
                accessible
                accessibilityLabel={`${t('otp.secureTitle')}. ${t('otp.secureBody')}`}
              >
                <View style={styles.shieldBadge}>
                  <ShieldCheck color={palette.shield} size={28} strokeWidth={2.2} />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{t('otp.secureTitle')}</Text>
                  <Text style={styles.cardBody}>{t('otp.secureBody')}</Text>
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

/** Whole seconds until `expiresAt`, re-read from the clock every second until it hits zero. */
function useSecondsRemaining(expiresAt: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Re-sync at once so a fresh `expiresAt` (after Resend) never shows a stale reading.
    setNow(Date.now());
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= expiresAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return secondsRemaining(expiresAt, now);
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
    top: 28,
    right: 0,
    opacity: 0.9,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginLeft: -6,
  },
  helpLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: palette.navLabel,
  },

  eyebrow: {
    marginTop: 30,
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 2,
    color: palette.eyebrow,
  },
  headline: {
    marginTop: 8,
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

  codeField: {
    marginTop: 26,
  },
  errorText: {
    marginTop: 8,
    fontSize: 12.5,
    lineHeight: 17,
    color: palette.errorText,
  },

  timer: {
    marginTop: 16,
    fontSize: 14.5,
    lineHeight: 20,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  timerValue: {
    fontWeight: '700',
    color: palette.brandBlue,
  },

  cta: {
    height: 56,
    marginTop: 22,
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

  resendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  resendPrompt: {
    fontSize: 14.5,
    color: palette.textSecondary,
  },
  resendLink: {
    fontSize: 14.5,
    fontWeight: '700',
    color: palette.link,
  },
  resendLinkDisabled: {
    color: palette.linkDisabled,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 26,
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
