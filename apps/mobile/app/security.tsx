/**
 * App lock settings route — `/security`, from Profile → Security, and `/security?from=setup`
 * from registration step 3 (offline builds), which goes on into the app when done.
 *
 * Changing or removing an existing lock first proves it is the owner: the system prompt for a
 * phone-lock, the current PIN for an app PIN. Turning a phone-lock on runs the system prompt
 * once too, so a lock the citizen cannot pass is never saved.
 */

import { ShieldCheck } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import {
  type AppLockChoice,
  AppLockSettingsScreen,
  type AppLockStep,
} from '../components/security/AppLockSettingsScreen';
import { showDialog } from '../lib/dialog/dialog-store';
import { useTranslation } from '../lib/i18n/I18nProvider';
import { formatWait } from '../lib/security/app-lock';
import {
  authenticateWithDevice,
  checkAppPin,
  deviceAuthAvailable,
  disableAppLock,
  enableDeviceLock,
  enablePinLock,
  loadAppLock,
} from '../lib/security/app-lock-storage';
import { appLockStore, useAppLock } from '../lib/security/app-lock-store';

export default function SecurityRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSetup = from === 'setup';
  const { config } = useAppLock();
  const current = config?.method ?? null;

  const [deviceAvailable, setDeviceAvailable] = useState(false);
  const [step, setStep] = useState<AppLockStep>('choose');
  const [pending, setPending] = useState<AppLockChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    void deviceAuthAvailable().then(setDeviceAvailable);
  }, []);

  const back = useCallback(() => {
    if (step !== 'choose') {
      setStep('choose');
      setError(null);
      return;
    }
    if (fromSetup) router.replace('/(tabs)');
    else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [fromSetup, router, step]);

  const finish = useCallback(
    (on: boolean) => {
      setStep('choose');
      setPending(null);
      setError(null);
      if (fromSetup) {
        router.replace('/(tabs)');
        return;
      }
      showDialog(
        t(on ? 'appLock.savedOnTitle' : 'appLock.savedOffTitle'),
        t(on ? 'appLock.savedOnBody' : 'appLock.savedOffBody'),
        [{ text: t('common.ok') }],
        { tone: 'success', icon: ShieldCheck },
      );
    },
    [fromSetup, router, t],
  );

  const prompt = useCallback(
    () =>
      authenticateWithDevice({
        promptMessage: t('appLock.promptTitle'),
        cancelLabel: t('common.cancel'),
      }),
    [t],
  );

  /** Applies a choice once ownership (if a lock was set) has been shown. */
  const apply = useCallback(
    async (choice: AppLockChoice) => {
      setError(null);
      if (choice === 'pin') {
        setStep('create');
        setResetKey((key) => key + 1);
        return;
      }
      setBusy(true);
      try {
        if (choice === 'off') {
          await disableAppLock();
          appLockStore.configured(null);
          finish(false);
        } else if (await prompt()) {
          await enableDeviceLock();
          appLockStore.configured(await loadAppLock());
          finish(true);
        }
      } catch {
        setError(t('appLock.errors.saveFailed'));
      } finally {
        setBusy(false);
      }
    },
    [finish, prompt, t],
  );

  const choose = useCallback(
    async (choice: AppLockChoice) => {
      if (busy) return;
      // Nothing to change — except the PIN itself, which choosing PIN again changes; and "off"
      // during setup, which just carries on into the app.
      if (choice === current && choice !== 'pin') return;
      if (choice === 'off' && current === null) {
        if (fromSetup) router.replace('/(tabs)');
        return;
      }
      if (current === 'pin') {
        setPending(choice);
        setStep('verify');
        setResetKey((key) => key + 1);
        return;
      }
      if (current === 'device' && !(await prompt())) return;
      await apply(choice);
    },
    [apply, busy, current, fromSetup, prompt, router],
  );

  const verifyPin = useCallback(
    async (pin: string) => {
      if (config?.method !== 'pin' || !pending) return;
      setBusy(true);
      const check = await checkAppPin(config, pin);
      setBusy(false);
      if (check.result === 'ok') {
        await apply(pending);
        return;
      }
      setResetKey((key) => key + 1);
      if (check.waitMs > 0) setError(t('appLock.wait', { time: formatWait(check.waitMs) }));
      else if (check.result === 'wrong' && check.triesLeft > 0)
        setError(
          t(check.triesLeft === 1 ? 'appLock.wrongOne' : 'appLock.wrongOther', {
            count: check.triesLeft,
          }),
        );
      else setError(t('appLock.wrongNoTries'));
    },
    [apply, config, pending, t],
  );

  const createPin = useCallback(
    async (pin: string) => {
      setBusy(true);
      try {
        await enablePinLock(pin);
        appLockStore.configured(await loadAppLock());
        finish(true);
      } catch {
        setError(t('appLock.errors.saveFailed'));
      } finally {
        setBusy(false);
      }
    },
    [finish, t],
  );

  return (
    <AppLockSettingsScreen
      current={current}
      deviceAvailable={deviceAvailable}
      step={step}
      busy={busy}
      error={error}
      resetKey={resetKey}
      onBack={back}
      onChoose={(choice) => void choose(choice)}
      onVerifyPin={(pin) => void verifyPin(pin)}
      onCreatePin={(pin) => void createPin(pin)}
    />
  );
}
