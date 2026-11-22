/**
 * App lock settings — Profile → Security, and registration step 3 in offline builds.
 *
 * Three steps, all on this screen:
 *   choose  the phone's fingerprint / face / screen lock, a 4-digit app PIN, or off. The first
 *           is greyed out, with the reason, on a phone that has no screen lock.
 *   verify  the current app PIN, before an existing PIN lock is changed or turned off, so a
 *           phone picked up while open cannot have its lock removed. (A phone-lock is confirmed
 *           with the system prompt instead; the route opens it.)
 *   create  the new PIN, twice.
 *
 * Presentational: the route keeps the step and does the saving. Light-only branded artwork.
 */

import { StatusBar } from 'expo-status-bar';
import type { LucideIcon } from 'lucide-react-native';
import { Check, ChevronLeft, Fingerprint, KeyRound, LockOpen } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { normalisePinInput } from '../../lib/cloud/sign-in-flow';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import {
  APP_LOCK_PIN_LENGTH,
  type AppLockMethod,
  type AppPinError,
  appPinFormError,
} from '../../lib/security/app-lock';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { profilePalette as palette } from '../profile/palette';
import { OtpCodeField } from '../registration/OtpCodeField';

export type AppLockChoice = AppLockMethod | 'off';
export type AppLockStep = 'choose' | 'verify' | 'create';

const PIN_ERROR_KEYS: Record<AppPinError, string> = {
  incomplete: 'appLock.errors.incomplete',
  weak: 'appLock.errors.weak',
  mismatch: 'appLock.errors.mismatch',
};

const CHOICES: readonly { readonly key: AppLockChoice; readonly icon: LucideIcon }[] = [
  { key: 'device', icon: Fingerprint },
  { key: 'pin', icon: KeyRound },
  { key: 'off', icon: LockOpen },
];

export type AppLockSettingsScreenProps = {
  readonly current: AppLockMethod | null;
  readonly deviceAvailable: boolean;
  readonly step: AppLockStep;
  readonly busy: boolean;
  /** Already translated: a wrong current PIN, a wait, or a save that failed. */
  readonly error: string | null;
  /** Bumped by the route to empty the PIN boxes. */
  readonly resetKey: number;
  readonly onBack: () => void;
  readonly onChoose: (choice: AppLockChoice) => void;
  readonly onVerifyPin: (pin: string) => void;
  readonly onCreatePin: (pin: string) => void;
};

export function AppLockSettingsScreen(props: AppLockSettingsScreenProps) {
  const { t } = useTranslation();
  const { step, onBack } = props;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.content}>
              <View style={styles.topBar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('registration.back')}
                  hitSlop={12}
                  onPress={onBack}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <ChevronLeft color={palette.headerIcon} size={28} strokeWidth={2.2} />
                </Pressable>
                <Text accessibilityRole="header" style={styles.heading}>
                  {t('appLock.settingsTitle')}
                </Text>
              </View>

              {step === 'choose' ? <Choose {...props} /> : null}
              {step === 'verify' ? <VerifyPin {...props} key={props.resetKey} /> : null}
              {step === 'create' ? <CreatePin {...props} key={props.resetKey} /> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Choose({ current, deviceAvailable, busy, error, onChoose }: AppLockSettingsScreenProps) {
  const { t } = useTranslation();
  const selected: AppLockChoice = current ?? 'off';

  return (
    <>
      <Text style={styles.lead}>{t('appLock.settingsBody')}</Text>
      <View style={styles.choices} accessibilityRole="radiogroup">
        {CHOICES.map(({ key, icon: Icon }) => {
          const disabled = busy || (key === 'device' && !deviceAvailable);
          const isSelected = selected === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected, disabled }}
              disabled={disabled}
              onPress={() => onChoose(key)}
              style={({ pressed }) => [
                styles.choice,
                isSelected && styles.choiceSelected,
                disabled && styles.choiceDisabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.choiceIcon}>
                <Icon color={palette.brandBlue} size={24} strokeWidth={2} />
              </View>
              <View style={styles.choiceCopy}>
                <Text style={styles.choiceTitle}>{t(`appLock.choices.${key}.title`)}</Text>
                <Text style={styles.choiceBody}>
                  {key === 'device' && !deviceAvailable
                    ? t('appLock.choices.device.unavailable')
                    : t(`appLock.choices.${key}.body`)}
                </Text>
              </View>
              {isSelected ? <Check color={palette.brandBlue} size={22} strokeWidth={2.6} /> : null}
            </Pressable>
          );
        })}
      </View>
      {busy ? <ActivityIndicator style={styles.spinner} color={palette.brandBlue} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>{t('appLock.whenItLocks')}</Text>
    </>
  );
}

function VerifyPin({ busy, error, onVerifyPin }: AppLockSettingsScreenProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');

  const change = (raw: string) => {
    const next = normalisePinInput(raw);
    setPin(next);
    if (next.length === APP_LOCK_PIN_LENGTH && !busy) onVerifyPin(next);
  };

  return (
    <>
      <Text style={styles.lead}>{t('appLock.verifyBody')}</Text>
      <Text style={styles.label}>{t('appLock.currentPinLabel')}</Text>
      <OtpCodeField
        value={pin}
        onChangeCode={change}
        label={t('appLock.currentPinLabel')}
        length={APP_LOCK_PIN_LENGTH}
        secure
        hasError={error !== null}
      />
      {busy ? <ActivityIndicator style={styles.spinner} color={palette.brandBlue} /> : null}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </>
  );
}

function CreatePin({ busy, error, onCreatePin }: AppLockSettingsScreenProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [attempted, setAttempted] = useState(false);

  const formError = appPinFormError(pin, confirm);
  const shown = attempted ? formError : null;

  const submit = () => {
    setAttempted(true);
    if (formError === null && !busy) onCreatePin(pin);
  };

  return (
    <>
      <Text style={styles.lead}>{t('appLock.createBody')}</Text>
      <Text style={styles.label}>{t('appLock.newPinLabel')}</Text>
      <OtpCodeField
        value={pin}
        onChangeCode={(value) => setPin(normalisePinInput(value))}
        label={t('appLock.newPinLabel')}
        length={APP_LOCK_PIN_LENGTH}
        secure
        hasError={shown !== null && shown !== 'mismatch'}
      />
      <Text style={styles.label}>{t('appLock.confirmPinLabel')}</Text>
      <OtpCodeField
        value={confirm}
        onChangeCode={(value) => setConfirm(normalisePinInput(value))}
        onSubmitEditing={submit}
        label={t('appLock.confirmPinLabel')}
        length={APP_LOCK_PIN_LENGTH}
        secure
        autoFocus={false}
        hasError={shown === 'mismatch'}
      />
      {shown ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {t(PIN_ERROR_KEYS[shown])}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>{t('appLock.pinNote')}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={submit}
        style={({ pressed }) => [styles.save, pressed && styles.savePressed]}
      >
        {busy ? (
          <ActivityIndicator color={palette.onBrand} />
        ) : (
          <Text style={styles.saveLabel}>{t('appLock.setPin')}</Text>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 32 },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
  },
  pressed: { opacity: 0.6 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, marginLeft: -6 },
  heading: { fontSize: 22, fontWeight: '800', color: palette.heading },
  lead: { marginTop: 16, fontSize: 15, lineHeight: 21, color: palette.textSecondary },
  label: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  choices: { marginTop: 20, gap: 12 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  choiceSelected: { borderColor: palette.brandBlue },
  choiceDisabled: { opacity: 0.55 },
  choiceIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.menuIconSurface,
  },
  choiceCopy: { flex: 1 },
  choiceTitle: { fontSize: 15.5, fontWeight: '700', color: palette.textPrimary },
  choiceBody: { marginTop: 3, fontSize: 13, lineHeight: 18, color: palette.textSecondary },
  spinner: { marginTop: 16 },
  error: { marginTop: 10, fontSize: 13, lineHeight: 18, color: palette.logoutText },
  note: { marginTop: 18, fontSize: 12.5, lineHeight: 17, color: palette.textSecondary },
  save: {
    height: 54,
    marginTop: 24,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  savePressed: { backgroundColor: palette.brandBluePressed },
  saveLabel: { fontSize: 16.5, fontWeight: '700', color: palette.onBrand },
});
