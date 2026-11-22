/**
 * The lock screen: "Bharatfill is locked", then either Unlock (the phone's fingerprint, face or
 * screen lock — the system prompt opens by itself the first time) or the 4-box app PIN, which is
 * checked as soon as the fourth digit is typed.
 *
 * Presentational apart from the PIN box's own text: the gate checks the PIN and runs the
 * prompt. Light-only branded artwork like registration. Shows nothing from the vault.
 */

import { Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
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

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { normalisePinInput } from '../../lib/cloud/sign-in-flow';
import { APP_LOCK_PIN_LENGTH, type AppLockMethod, formatWait } from '../../lib/security/app-lock';
import { OtpCodeField } from '../registration/OtpCodeField';
import { registrationPalette as palette } from '../registration/palette';

export type LockScreenMessage =
  | { readonly kind: 'wrong'; readonly triesLeft: number }
  | { readonly kind: 'wait'; readonly until: number }
  | null;

export type LockScreenProps = {
  readonly method: AppLockMethod;
  readonly busy: boolean;
  readonly message: LockScreenMessage;
  /** Bumped by the gate to empty the PIN boxes after a wrong PIN. */
  readonly resetKey: number;
  readonly onUnlockWithDevice: () => void;
  readonly onSubmitPin: (pin: string) => void;
  readonly onForgotPin: () => void;
};

/** Re-renders every second while a wait is showing, so the countdown moves. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function LockScreen({
  method,
  busy,
  message,
  resetKey,
  onUnlockWithDevice,
  onSubmitPin,
  onForgotPin,
}: LockScreenProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const now = useNow(message?.kind === 'wait');
  const waitMs = message?.kind === 'wait' ? Math.max(0, message.until - now) : 0;
  const waiting = waitMs > 0;

  useEffect(() => setPin(''), [resetKey]);

  const change = (raw: string) => {
    const next = normalisePinInput(raw);
    setPin(next);
    if (next.length === APP_LOCK_PIN_LENGTH && !busy && !waiting) onSubmitPin(next);
  };

  let messageText: string | null = null;
  if (message?.kind === 'wrong') {
    messageText =
      message.triesLeft > 0
        ? t(message.triesLeft === 1 ? 'appLock.wrongOne' : 'appLock.wrongOther', {
            count: message.triesLeft,
          })
        : t('appLock.wrongNoTries');
  } else if (waiting) {
    messageText = t('appLock.wait', { time: formatWait(waitMs) });
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.badge}>
              <Lock color={palette.brandBlue} size={36} strokeWidth={2.1} />
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              {t('appLock.title')}
            </Text>
            <Text style={styles.body}>
              {t(method === 'device' ? 'appLock.bodyDevice' : 'appLock.bodyPin')}
            </Text>

            {method === 'pin' ? (
              <View style={styles.pin}>
                <OtpCodeField
                  key={resetKey}
                  value={pin}
                  onChangeCode={change}
                  label={t('appLock.pinLabel')}
                  length={APP_LOCK_PIN_LENGTH}
                  secure
                  hasError={message !== null}
                />
              </View>
            ) : null}

            {messageText ? (
              <Text style={styles.message} accessibilityLiveRegion="polite">
                {messageText}
              </Text>
            ) : null}

            {busy ? <ActivityIndicator style={styles.spinner} color={palette.brandBlue} /> : null}

            {method === 'device' ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onUnlockWithDevice}
                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
              >
                <Text style={styles.ctaLabel}>{t('appLock.unlock')}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                hitSlop={10}
                onPress={onForgotPin}
                style={({ pressed }) => [styles.link, pressed && styles.pressed]}
              >
                <Text style={styles.linkLabel}>{t('appLock.forgot')}</Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  badge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.trustShieldSurface,
  },
  title: {
    marginTop: 20,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: palette.textPrimary,
  },
  body: {
    marginTop: 8,
    maxWidth: 360,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  pin: { marginTop: 28, width: '100%', maxWidth: 320 },
  message: {
    marginTop: 14,
    maxWidth: 340,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    color: palette.errorText,
  },
  spinner: { marginTop: 16 },
  cta: {
    height: 54,
    minWidth: 220,
    marginTop: 28,
    paddingHorizontal: 32,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.cta,
  },
  ctaPressed: { backgroundColor: palette.ctaPressed },
  ctaLabel: { fontSize: 17, fontWeight: '700', color: palette.ctaLabel },
  link: { marginTop: 24 },
  linkLabel: { fontSize: 15.5, fontWeight: '600', color: palette.link },
  pressed: { opacity: 0.6 },
});
