/**
 * Security setup — "Secure Your App", step 3 of registration. PLACEHOLDER.
 *
 * No mockup has been supplied for this step yet, so this keeps the registration look (back and
 * "Skip for now", brand block and ribbon, the stepper on step 3, the skyline footer) and shows
 * the app-lock methods the spec lists (CITIZEN_MOBILE_APP_SPEC §3 Feature 2: fingerprint, face
 * unlock or a 4-digit PIN) as "coming soon". Nothing here sets up a lock: that needs the
 * local-authentication and secure-store modules and a decision on how the PIN is kept.
 * Replace the body with the real design once it exists.
 *
 * Light-only branded artwork like the rest of registration, so it does not read from
 * `useTheme()`.
 */

import { StatusBar } from 'expo-status-bar';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronLeft, ChevronRight, Clock, Fingerprint, KeyRound } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { BrandHeader } from './BrandHeader';
import { DigitalBharatRibbon } from './DigitalBharatRibbon';
import { registrationPalette as palette } from './palette';
import { RegistrationStepper } from './RegistrationStepper';
import { SkylineFooter } from './SkylineFooter';

/** Keeps the page from sprawling on tablets. */
const CONTENT_MAX_WIDTH = 560;

const LOCK_METHODS: readonly { readonly key: 'biometric' | 'pin'; readonly icon: LucideIcon }[] = [
  { key: 'biometric', icon: Fingerprint },
  { key: 'pin', icon: KeyRound },
];

export type SecuritySetupScreenProps = {
  readonly onBack: () => void;
  readonly onSkip: () => void;
  readonly onContinue: () => void;
};

export function SecuritySetupScreen({ onBack, onSkip, onContinue }: SecuritySetupScreenProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const headlineSize = Math.max(24, Math.min(30, width * 0.07));

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* ---- Ribbon (behind the brand block) ---- */}
            <DigitalBharatRibbon />

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
                accessibilityLabel={t('securitySetup.skipHint')}
                hitSlop={12}
                onPress={onSkip}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.skipLabel}>{t('securitySetup.skip')}</Text>
              </Pressable>
            </View>

            {/* ---- Brand ---- */}
            <BrandHeader logo={require('../../assets/security/bharatdoc-logo.png')} />

            {/* ---- Progress ---- */}
            <View style={styles.stepper}>
              <RegistrationStepper current="security" />
            </View>

            {/* ---- Headline ---- */}
            <Text
              accessibilityRole="header"
              style={[
                styles.headline,
                { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.2) },
              ]}
            >
              {`${t('securitySetup.headlineLead')} `}
              <Text style={{ color: palette.brandBlue }}>{t('securitySetup.headlineAccent')}</Text>
            </Text>
            <Text style={styles.subtitle}>{t('securitySetup.subtitle')}</Text>

            {/* ---- Lock methods (not available yet) ---- */}
            {LOCK_METHODS.map(({ key, icon: Icon }) => {
              const title = t(`securitySetup.options.${key}.title`);
              const body = t(`securitySetup.options.${key}.body`);
              return (
                <View
                  key={key}
                  style={styles.method}
                  accessible
                  accessibilityLabel={`${title}. ${body} ${t('securitySetup.comingSoon')}`}
                >
                  <View style={styles.methodBadge}>
                    <Icon color={palette.brandBlue} size={26} strokeWidth={2} />
                  </View>
                  <View style={styles.methodCopy}>
                    <Text style={styles.methodTitle}>{title}</Text>
                    <Text style={styles.methodBody}>{body}</Text>
                    <View style={styles.pill}>
                      <Text style={styles.pillLabel}>{t('securitySetup.comingSoon')}</Text>
                    </View>
                  </View>
                </View>
              );
            })}

            {/* ---- Notice ---- */}
            <View
              style={styles.notice}
              accessible
              accessibilityLabel={`${t('securitySetup.unavailableTitle')}. ${t('securitySetup.unavailableBody')}`}
            >
              <Clock color={palette.textSecondary} size={22} strokeWidth={2} />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>{t('securitySetup.unavailableTitle')}</Text>
                <Text style={styles.noticeBody}>{t('securitySetup.unavailableBody')}</Text>
              </View>
            </View>

            {/* ---- CTA ---- */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('securitySetup.continue')}
              onPress={onContinue}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            >
              <Text style={styles.ctaLabel}>{t('securitySetup.continue')}</Text>
              <View style={styles.ctaIcon}>
                <ChevronRight color={palette.ctaLabel} size={24} strokeWidth={2.4} />
              </View>
            </Pressable>
          </View>

          {/* ---- Skyline footer ---- */}
          <SkylineFooter />
        </ScrollView>
      </SafeAreaView>
    </View>
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

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginLeft: -6,
  },
  skipLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.link,
  },

  stepper: {
    marginTop: 20,
  },

  headline: {
    marginTop: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: palette.textPrimary,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 8,
    fontSize: 15.5,
    lineHeight: 22,
    color: palette.textSecondary,
  },

  method: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: palette.fieldBorder,
    backgroundColor: palette.fieldSurface,
  },
  methodBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.trustShieldSurface,
  },
  methodCopy: {
    flex: 1,
    marginLeft: 14,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  methodBody: {
    marginTop: 3,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
  pill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: palette.sheetDivider,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.textMuted,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardSurface,
  },
  noticeCopy: {
    flex: 1,
    marginLeft: 12,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  noticeBody: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
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
});
