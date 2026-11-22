/**
 * Covers the whole app while it is locked (`lib/security/app-lock-store.ts`). Mounted once in
 * the root layout, above every route, so whatever was open — a scan in review, a document —
 * is still there underneath after unlocking.
 *
 * A `Modal`, so the Android back button cannot navigate the app behind it and screen readers
 * cannot reach it. Popups opened from here (Forgot PIN) are newer Modals and draw above it.
 *
 * Forgot PIN: the phone's screen lock vouches for the citizen when there is one; otherwise the
 * only way in is to reset — remove the app lock, sign this phone out of the cloud and remove
 * the documents on it (cloud copies untouched), so whoever resets gets an empty app and never
 * someone else's documents or account.
 */

import { KeyRound } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';

import { logOut } from '../../lib/cloud/account';
import { showDialog } from '../../lib/dialog/dialog-store';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { forgotPinPath } from '../../lib/security/app-lock';
import {
  authenticateWithDevice,
  checkAppPin,
  deviceAuthAvailable,
  disableAppLock,
  loadAppLock,
  pinWaitRemaining,
} from '../../lib/security/app-lock-storage';
import { appLockStore, useAppLock } from '../../lib/security/app-lock-store';
import { registrationPalette as palette } from '../registration/palette';
import { LockScreen, type LockScreenMessage } from './LockScreen';

export function AppLockGate() {
  const { t } = useTranslation();
  const { phase, config } = useAppLock();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<LockScreenMessage>(null);
  const [resetKey, setResetKey] = useState(0);
  const prompted = useRef(false);

  // Read the lock once at launch, then follow the app in and out of the foreground.
  useEffect(() => {
    void loadAppLock().then((stored) => appLockStore.started(stored));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') appLockStore.wentToBackground(Date.now());
      else if (state === 'active') appLockStore.cameToForeground(Date.now());
    });
    return () => subscription.remove();
  }, []);

  const unlockWithDevice = useCallback(async () => {
    setBusy(true);
    const passed = await authenticateWithDevice({
      promptMessage: t('appLock.promptTitle'),
      cancelLabel: t('common.cancel'),
    });
    setBusy(false);
    if (passed) appLockStore.unlocked();
  }, [t]);

  // Each time the lock appears: open the system prompt by itself once, or show a running wait.
  useEffect(() => {
    if (phase !== 'locked') {
      prompted.current = false;
      setMessage(null);
      return;
    }
    if (config?.method === 'device' && !prompted.current) {
      prompted.current = true;
      void unlockWithDevice();
    }
    if (config?.method === 'pin') {
      void pinWaitRemaining().then((waitMs) =>
        setMessage(waitMs > 0 ? { kind: 'wait', until: Date.now() + waitMs } : null),
      );
    }
  }, [config, phase, unlockWithDevice]);

  const submitPin = useCallback(
    async (pin: string) => {
      if (config?.method !== 'pin') return;
      setBusy(true);
      const check = await checkAppPin(config, pin);
      setBusy(false);
      if (check.result === 'ok') {
        appLockStore.unlocked();
        return;
      }
      setResetKey((key) => key + 1);
      setMessage(
        check.waitMs > 0
          ? { kind: 'wait', until: Date.now() + check.waitMs }
          : { kind: 'wrong', triesLeft: check.result === 'wrong' ? check.triesLeft : 0 },
      );
    },
    [config],
  );

  const reset = useCallback(async () => {
    setBusy(true);
    try {
      await logOut({ removeDocuments: true, untitled: (source) => t(`vault.untitled.${source}`) });
      await disableAppLock();
      appLockStore.configured(null);
      showDialog(t('appLock.resetDoneTitle'), t('appLock.resetDoneBody'), [
        { text: t('common.ok') },
      ]);
    } catch {
      showDialog(t('cloud.errors.title'), t('profile.leave.failed'), [{ text: t('common.ok') }]);
    } finally {
      setBusy(false);
    }
  }, [t]);

  const forgotPin = useCallback(async () => {
    if (forgotPinPath(await deviceAuthAvailable()) === 'device') {
      await unlockWithDevice();
      return;
    }
    showDialog(
      t('appLock.resetTitle'),
      t('appLock.resetBody'),
      [
        { text: t('appLock.resetConfirm'), style: 'destructive', onPress: () => void reset() },
        { text: t('common.cancel'), style: 'cancel' },
      ],
      { tone: 'danger', icon: KeyRound },
    );
  }, [reset, t, unlockWithDevice]);

  if (phase === 'unlocked') return null;

  return (
    <Modal visible animationType="none" statusBarTranslucent onRequestClose={() => undefined}>
      {phase === 'starting' || !config ? (
        <View style={styles.cover} />
      ) : (
        <LockScreen
          method={config.method}
          busy={busy}
          message={message}
          resetKey={resetKey}
          onUnlockWithDevice={() => void unlockWithDevice()}
          onSubmitPin={(pin) => void submitPin(pin)}
          onForgotPin={() => void forgotPin()}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  cover: { flex: 1, backgroundColor: palette.background },
});
