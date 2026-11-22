/**
 * Profile setup — "Tell Us About Yourself", step 2 of registration.
 *
 * Layout follows the approved profile artwork: back and "Skip for now", the brand block with
 * the "Digital Bharat Stronger Citizens" ribbon on the right, the four-step progress stepper
 * on step 2, the headline, the fields, the "safe with us" card, Continue, and the monument
 * skyline closing the page.
 *
 * Two fields only — the name as on the citizen's documents, and their language. The artwork's
 * date of birth, gender and state are not asked for: the cloud vault keeps nothing else
 * (docs/VAULT_BRIDGE_DESIGN.md D10), and asking for data that is then thrown away is worse than
 * a shorter form.
 *
 * Light-only branded artwork like the rest of registration, so it does not read from
 * `useTheme()`. Everything scrolls inside a keyboard-avoiding view.
 *
 * Picking a preferred language switches the app to it straight away, so the rest of the form
 * reads in that language. The screen never stores or logs the profile: Continue hands a
 * validated `SignupProfile` to `onContinue` and leaves what happens next to the route.
 */

import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, ChevronRight, Languages, ShieldCheck, User } from 'lucide-react-native';
import { useState } from 'react';
import {
  Keyboard,
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

import { LOCALES } from '../../lib/i18n';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import {
  FULL_NAME_MAX_LENGTH,
  type FullNameError,
  fullNameError,
  type SignupProfile,
  toSignupProfile,
} from '../../lib/profile/profile';
import { BrandHeader } from './BrandHeader';
import { DigitalBharatRibbon } from './DigitalBharatRibbon';
import { IconSelectField, IconTextField } from './IconFields';
import { OptionSheet } from './OptionSheet';
import { registrationPalette as palette } from './palette';
import { RegistrationStepper } from './RegistrationStepper';
import { SkylineFooter } from './SkylineFooter';

/** Keeps the form from sprawling on tablets. */
const CONTENT_MAX_WIDTH = 560;

const NAME_ERROR_KEYS: Record<FullNameError, string> = {
  missing: 'profileSetup.errors.nameMissing',
  too_short: 'profileSetup.errors.nameTooShort',
  too_long: 'profileSetup.errors.nameTooLong',
  invalid_characters: 'profileSetup.errors.nameInvalid',
};

export type ProfileSetupScreenProps = {
  readonly onBack: () => void;
  readonly onSkip: () => void;
  /** Receives the validated, normalised profile. */
  readonly onContinue: (profile: SignupProfile) => void;
};

export function ProfileSetupScreen({ onBack, onSkip, onContinue }: ProfileSetupScreenProps) {
  const { t, locale, setLocale } = useTranslation();
  const { width } = useWindowDimensions();

  const [fullName, setFullName] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);

  const nameError = attempted ? fullNameError(fullName) : null;

  const languages = LOCALES.map((value) => ({
    value,
    label: t(`profileSetup.languages.${value}`),
  }));

  const openLanguages = () => {
    Keyboard.dismiss();
    setLanguageSheetOpen(true);
  };
  const closeLanguages = () => setLanguageSheetOpen(false);

  const submit = () => {
    setAttempted(true);
    const result = toSignupProfile(fullName, locale);
    if (result.ok) onContinue(result.profile);
  };

  const headlineSize = Math.max(24, Math.min(30, width * 0.07));

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
                  accessibilityLabel={t('profileSetup.skipHint')}
                  hitSlop={12}
                  onPress={onSkip}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={styles.skipLabel}>{t('profileSetup.skip')}</Text>
                </Pressable>
              </View>

              {/* ---- Brand ---- */}
              <BrandHeader logo={require('../../assets/profile/bharatdoc-logo.png')} />

              {/* ---- Progress ---- */}
              <View style={styles.stepper}>
                <RegistrationStepper current="profile" />
              </View>

              {/* ---- Headline ---- */}
              <Text
                accessibilityRole="header"
                style={[
                  styles.headline,
                  { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.2) },
                ]}
              >
                {`${t('profileSetup.headlineLead')} `}
                <Text style={{ color: palette.brandBlue }}>{t('profileSetup.headlineAccent')}</Text>
              </Text>
              <Text style={styles.subtitle}>{t('profileSetup.subtitle')}</Text>

              {/* ---- Full name ---- */}
              <Text style={[styles.fieldLabel, styles.firstFieldLabel]}>
                {t('profileSetup.nameLabel')}
              </Text>
              <IconTextField
                icon={User}
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('profileSetup.namePlaceholder')}
                accessibilityLabel={t('profileSetup.nameLabel')}
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect={false}
                textContentType="name"
                returnKeyType="done"
                maxLength={FULL_NAME_MAX_LENGTH}
                hasError={nameError !== null}
              />
              {nameError ? (
                <FieldError
                  message={t(NAME_ERROR_KEYS[nameError], { max: FULL_NAME_MAX_LENGTH })}
                />
              ) : null}

              {/* ---- Preferred language ---- */}
              <Text style={styles.fieldLabel}>{t('profileSetup.languageLabel')}</Text>
              <IconSelectField
                icon={Languages}
                label={t('profileSetup.languageLabel')}
                value={t(`profileSetup.languages.${locale}`)}
                placeholder={t('profileSetup.languageLabel')}
                onPress={openLanguages}
              />

              {/* ---- Trust card ---- */}
              <View
                style={styles.card}
                accessible
                accessibilityLabel={`${t('profileSetup.trustTitle')}. ${t('profileSetup.trustBody')}`}
              >
                <View style={styles.shieldBadge}>
                  <ShieldCheck
                    color={palette.trustShieldTick}
                    fill={palette.trustShield}
                    size={30}
                    strokeWidth={2}
                  />
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{t('profileSetup.trustTitle')}</Text>
                  <Text style={styles.cardBody}>{t('profileSetup.trustBody')}</Text>
                </View>
              </View>

              {/* ---- CTA ---- */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('profileSetup.continue')}
                onPress={submit}
                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
              >
                <Text style={styles.ctaLabel}>{t('profileSetup.continue')}</Text>
                <View style={styles.ctaIcon}>
                  <ChevronRight color={palette.ctaLabel} size={24} strokeWidth={2.4} />
                </View>
              </Pressable>
            </View>

            {/* ---- Skyline footer ---- */}
            <SkylineFooter />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ---- Language picker ---- */}
      {languageSheetOpen ? (
        <OptionSheet
          title={t('profileSetup.languageLabel')}
          closeLabel={t('profileSetup.sheet.close')}
          options={languages}
          selected={locale}
          onSelect={setLocale}
          onClose={closeLanguages}
        />
      ) : null}
    </View>
  );
}

function FieldError({ message }: { readonly message: string }) {
  return (
    <Text style={styles.errorText} accessibilityLiveRegion="polite">
      {message}
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
    fontSize: 15.5,
    lineHeight: 22,
    color: palette.textSecondary,
  },

  fieldLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '500',
    color: palette.textPrimary,
  },
  firstFieldLabel: {
    marginTop: 24,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 17,
    color: palette.errorText,
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
    backgroundColor: palette.trustShieldSurface,
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
