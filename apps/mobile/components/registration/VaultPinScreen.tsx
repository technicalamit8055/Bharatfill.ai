/**
 * Vault PIN — step 3 of cloud sign-up ("create"), and the new-phone unlock ("restore").
 * docs/VAULT_BRIDGE_DESIGN.md §3.1, §3.3.
 *
 * create   Set a 4-digit Vault PIN (typed twice), agree to the terms, choose whether documents
 *          sync to the cloud (on by default), then "Create my vault".
 * restore  This number already has a vault but this phone does not hold its key: type the Vault
 *          PIN to unlock it here. Old-phone approval and the 7-day wait are named as the other
 *          ways in, and marked as coming soon until they are built.
 * change   Signed in: type the current Vault PIN, then a new one twice (design D17). The
 *          subtitle says other phones get signed out.
 *
 * Registration look (back, brand block and ribbon, stepper, skyline footer); light-only like
 * the rest of registration. The screen never stores, logs or sends the PIN — `onSubmit` gets it
 * and the route decides. Weak PINs (one digit repeated, 1234, 9876) are refused here as well as
 * on the server, so the citizen hears about it before a round trip.
 */

import { StatusBar } from 'expo-status-bar';
import { Check, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VAULT_PIN_LENGTH } from '@assistigo/core';

import {
  normalisePinInput,
  type PinFormError,
  vaultPinFormError,
} from '../../lib/cloud/sign-in-flow';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { BrandHeader } from './BrandHeader';
import { DigitalBharatRibbon } from './DigitalBharatRibbon';
import { OtpCodeField } from './OtpCodeField';
import { registrationPalette as palette } from './palette';
import { RegistrationStepper } from './RegistrationStepper';
import { SkylineFooter } from './SkylineFooter';

const CONTENT_MAX_WIDTH = 560;

const PIN_ERROR_KEYS: Record<PinFormError, string> = {
  incomplete: 'vaultPin.errors.incomplete',
  weak: 'vaultPin.errors.weak',
  mismatch: 'vaultPin.errors.mismatch',
};

export type VaultPinCreateSubmit = { readonly pin: string; readonly cloudSync: boolean };

type CommonProps = {
  readonly onBack: () => void;
  /** True while the request is in flight: the button shows a spinner and ignores taps. */
  readonly busy: boolean;
  /** Already translated; shown under the button. */
  readonly serverError: string | null;
};

export type VaultPinScreenProps =
  | (CommonProps & {
      readonly mode: 'create';
      readonly onSubmit: (input: VaultPinCreateSubmit) => void;
    })
  | (CommonProps & { readonly mode: 'restore'; readonly onSubmit: (pin: string) => void })
  | (CommonProps & {
      readonly mode: 'change';
      readonly onSubmit: (input: VaultPinChangeSubmit) => void;
    });

export type VaultPinChangeSubmit = { readonly currentPin: string; readonly newPin: string };

export function VaultPinScreen(props: VaultPinScreenProps) {
  const { mode, onBack, busy, serverError } = props;
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [cloudSync, setCloudSync] = useState(true);
  const [attempted, setAttempted] = useState(false);

  const pinError: PinFormError | null =
    mode === 'restore'
      ? pin.length < VAULT_PIN_LENGTH
        ? 'incomplete'
        : null
      : vaultPinFormError(pin, confirm);
  // Change only: the current PIN, and a new one that is not the same.
  const currentError: 'incomplete' | 'same' | null =
    mode !== 'change'
      ? null
      : currentPin.length < VAULT_PIN_LENGTH
        ? 'incomplete'
        : currentPin === pin
          ? 'same'
          : null;
  const consentMissing = mode === 'create' && !agreed;
  const shownPinError = attempted ? pinError : null;
  const shownCurrentError = attempted ? currentError : null;

  const submit = () => {
    if (busy) return;
    setAttempted(true);
    if (pinError || currentError || consentMissing) return;
    if (props.mode === 'create') props.onSubmit({ pin, cloudSync });
    else if (props.mode === 'change') props.onSubmit({ currentPin, newPin: pin });
    else props.onSubmit(pin);
  };

  const headlineSize = Math.max(24, Math.min(30, width * 0.07));
  const prefix = `vaultPin.${mode}`;

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
              <DigitalBharatRibbon />

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
              </View>

              <BrandHeader logo={require('../../assets/security/bharatdoc-logo.png')} />

              {mode === 'create' ? (
                <View style={styles.stepper}>
                  <RegistrationStepper current="security" />
                </View>
              ) : null}

              <Text
                accessibilityRole="header"
                style={[
                  styles.headline,
                  { fontSize: headlineSize, lineHeight: Math.round(headlineSize * 1.2) },
                ]}
              >
                {`${t(`${prefix}.headlineLead`)} `}
                <Text style={{ color: palette.brandBlue }}>{t(`${prefix}.headlineAccent`)}</Text>
              </Text>
              <Text style={styles.subtitle}>{t(`${prefix}.subtitle`)}</Text>

              {mode === 'change' ? (
                <>
                  <Text style={styles.fieldLabel}>{t('vaultPin.change.currentLabel')}</Text>
                  <OtpCodeField
                    value={currentPin}
                    onChangeCode={(value) => setCurrentPin(normalisePinInput(value))}
                    label={t('vaultPin.change.currentLabel')}
                    length={VAULT_PIN_LENGTH}
                    secure
                    hasError={shownCurrentError === 'incomplete'}
                  />
                  {shownCurrentError === 'incomplete' ? (
                    <Text style={styles.errorText} accessibilityLiveRegion="polite">
                      {t('vaultPin.errors.incomplete')}
                    </Text>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.fieldLabel}>{t(`${prefix}.pinLabel`)}</Text>
              <OtpCodeField
                value={pin}
                onChangeCode={(value) => setPin(normalisePinInput(value))}
                label={t(`${prefix}.pinLabel`)}
                length={VAULT_PIN_LENGTH}
                secure
                autoFocus={mode !== 'change'}
                hasError={
                  (shownPinError !== null && shownPinError !== 'mismatch') ||
                  shownCurrentError === 'same'
                }
              />

              {mode !== 'restore' ? (
                <>
                  <Text style={styles.fieldLabel}>{t(`${prefix}.confirmLabel`)}</Text>
                  <OtpCodeField
                    value={confirm}
                    onChangeCode={(value) => setConfirm(normalisePinInput(value))}
                    label={t(`${prefix}.confirmLabel`)}
                    length={VAULT_PIN_LENGTH}
                    secure
                    autoFocus={false}
                    hasError={shownPinError === 'mismatch'}
                  />
                </>
              ) : null}

              {shownPinError ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {t(PIN_ERROR_KEYS[shownPinError])}
                </Text>
              ) : shownCurrentError === 'same' ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {t('vaultPin.errors.same')}
                </Text>
              ) : null}

              <View style={styles.card}>
                <View style={styles.shieldBadge}>
                  <ShieldCheck
                    color={palette.trustShieldTick}
                    fill={palette.trustShield}
                    size={26}
                    strokeWidth={2}
                  />
                </View>
                <Text style={styles.cardBody}>{t(`${prefix}.pinHint`)}</Text>
              </View>

              {mode === 'create' ? (
                <>
                  <View style={styles.row}>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{t('vaultPin.create.syncTitle')}</Text>
                      <Text style={styles.rowBody}>{t('vaultPin.create.syncBody')}</Text>
                    </View>
                    <Switch
                      value={cloudSync}
                      onValueChange={setCloudSync}
                      accessibilityLabel={t('vaultPin.create.syncTitle')}
                      trackColor={{ true: palette.brandBlue, false: palette.fieldBorder }}
                    />
                  </View>

                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: agreed }}
                    accessibilityLabel={t('vaultPin.create.consent')}
                    onPress={() => setAgreed((value) => !value)}
                    style={styles.consentRow}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        agreed && styles.checkboxOn,
                        attempted && consentMissing && styles.checkboxError,
                      ]}
                    >
                      {agreed ? <Check color={palette.ctaLabel} size={16} strokeWidth={3} /> : null}
                    </View>
                    <Text style={styles.consentText}>{t('vaultPin.create.consent')}</Text>
                  </Pressable>
                  {attempted && consentMissing ? (
                    <Text style={styles.errorText}>{t('vaultPin.errors.consent')}</Text>
                  ) : null}
                </>
              ) : mode === 'restore' ? (
                <Text style={styles.otherWays}>{t('vaultPin.restore.otherWays')}</Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(`${prefix}.submit`)}
                accessibilityState={{ busy, disabled: busy }}
                onPress={submit}
                style={({ pressed }) => [
                  styles.cta,
                  busy && styles.ctaBusy,
                  pressed && !busy && styles.ctaPressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={palette.ctaLabel} />
                ) : (
                  <>
                    <Text style={styles.ctaLabel}>{t(`${prefix}.submit`)}</Text>
                    <View style={styles.ctaIcon}>
                      <ChevronRight color={palette.ctaLabel} size={24} strokeWidth={2.4} />
                    </View>
                  </>
                )}
              </Pressable>

              {serverError ? (
                <Text
                  style={[styles.errorText, styles.serverError]}
                  accessibilityLiveRegion="polite"
                >
                  {serverError}
                </Text>
              ) : null}
            </View>

            <SkylineFooter />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  pressed: { opacity: 0.6 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, marginLeft: -6 },
  stepper: { marginTop: 20 },
  headline: {
    marginTop: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: palette.textPrimary,
  },
  subtitle: { marginTop: 6, fontSize: 15.5, lineHeight: 22, color: palette.textSecondary },
  fieldLabel: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '500',
    color: palette.textPrimary,
  },
  errorText: { marginTop: 8, fontSize: 13, lineHeight: 18, color: palette.errorText },
  serverError: { textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardSurface,
  },
  shieldBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.trustShieldSurface,
  },
  cardBody: {
    flex: 1,
    marginLeft: 12,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: palette.fieldBorder,
    backgroundColor: palette.fieldSurface,
  },
  rowCopy: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: palette.textPrimary },
  rowBody: { marginTop: 3, fontSize: 13, lineHeight: 18, color: palette.textSecondary },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 18 },
  checkbox: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: 6,
    borderWidth: 1.6,
    borderColor: palette.fieldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.fieldSurface,
  },
  checkboxOn: { borderColor: palette.cta, backgroundColor: palette.cta },
  checkboxError: { borderColor: palette.fieldBorderError },
  consentText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
  otherWays: { marginTop: 18, fontSize: 13.5, lineHeight: 19, color: palette.textSecondary },
  cta: {
    height: 56,
    marginTop: 24,
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
  ctaPressed: { backgroundColor: palette.ctaPressed },
  ctaBusy: { backgroundColor: palette.ctaDisabled },
  ctaLabel: { fontSize: 17, fontWeight: '700', color: palette.ctaLabel },
  ctaIcon: { position: 'absolute', right: 20 },
});
