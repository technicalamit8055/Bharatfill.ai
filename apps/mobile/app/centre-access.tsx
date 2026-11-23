/**
 * Centre access route — `/centre-access`, from Profile → Centre access (migration 0042).
 *
 * Loads the citizen's sessions, and confirms before Stop (the centre loses access at once) and
 * before Trust / Renew (the centre keeps access for 30 days without asking again); and before
 * Lock / Unlock of a centre that created their profile (migration 0046).
 */

import { useRouter } from 'expo-router';
import { BadgeCheck, Lock, ShieldOff, Unlock } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';

import { type CentreAccessBusy, CentreAccessScreen } from '../components/access/CentreAccessScreen';
import { MAX_TRUSTED_CENTRES } from '../lib/access/centre-access';
import type { CentreAccess, CentreProfile } from '../lib/cloud/citizen-api';
import { citizenApi } from '../lib/cloud/session';
import { useCentreAccess } from '../lib/cloud/use-centre-access';
import { showDialog } from '../lib/dialog/dialog-store';
import { useTranslation } from '../lib/i18n/I18nProvider';

export default function CentreAccessRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state, refresh } = useCentreAccess();
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState<CentreAccessBusy | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The countdowns tick between polls.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (state.status !== 'loading') setRefreshing(false);
    setNow(new Date());
  }, [state]);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router]);

  const failed = useCallback(
    (messageKey: string) => {
      showDialog(
        t('common.errorTitle'),
        t(messageKey, { max: MAX_TRUSTED_CENTRES }),
        [{ text: t('common.ok') }],
        { tone: 'warning' },
      );
    },
    [t],
  );

  const stop = useCallback(
    (session: CentreAccess) => {
      const centre = session.centreName || t('centreAccess.unknownCentre');
      showDialog(
        t('centreAccess.stopConfirmTitle'),
        t('centreAccess.stopConfirmBody', { centre }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('centreAccess.stop'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const api = citizenApi();
                if (!api) return;
                setBusy({ grantId: session.grantId, action: 'stop' });
                const result = await api.stopCentreAccess(session.grantId);
                setBusy(null);
                refresh();
                if (!result.ok) {
                  failed(result.error.messageKey);
                  return;
                }
                showDialog(
                  t('centreAccess.stoppedTitle'),
                  t('centreAccess.stoppedBody', { centre }),
                  [{ text: t('common.ok') }],
                  { tone: 'success', icon: ShieldOff },
                );
              })();
            },
          },
        ],
        { tone: 'danger' },
      );
    },
    [failed, refresh, t],
  );

  const trust = useCallback(
    (session: CentreAccess) => {
      const centre = session.centreName || t('centreAccess.unknownCentre');
      const renewing = session.trusted;
      showDialog(
        t(renewing ? 'centreAccess.renewConfirmTitle' : 'centreAccess.trustConfirmTitle'),
        t('centreAccess.trustConfirmBody', { centre }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t(renewing ? 'centreAccess.renew' : 'centreAccess.trust'),
            onPress: () => {
              void (async () => {
                const api = citizenApi();
                if (!api) return;
                setBusy({ grantId: session.grantId, action: 'trust' });
                const result = await api.trustCentreAccess(session.grantId);
                setBusy(null);
                refresh();
                if (!result.ok) {
                  failed(result.error.messageKey);
                  return;
                }
                showDialog(
                  t('centreAccess.trustedTitle'),
                  t('centreAccess.trustedBody', { centre }),
                  [{ text: t('common.ok') }],
                  { tone: 'success', icon: BadgeCheck },
                );
              })();
            },
          },
        ],
        { tone: 'brand' },
      );
    },
    [failed, refresh, t],
  );

  const changeLock = useCallback(
    (centre: CentreProfile, action: 'lock' | 'unlock') => {
      const name = centre.centreName || t('centreAccess.unknownCentre');
      const locking = action === 'lock';
      showDialog(
        t(locking ? 'centreAccess.lockConfirmTitle' : 'centreAccess.unlockConfirmTitle'),
        t(locking ? 'centreAccess.lockConfirmBody' : 'centreAccess.unlockConfirmBody', {
          centre: name,
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t(locking ? 'centreAccess.lock' : 'centreAccess.unlock'),
            style: locking ? 'destructive' : 'default',
            onPress: () => {
              void (async () => {
                const api = citizenApi();
                if (!api) return;
                setBusy({ customerId: centre.customerId, action });
                const result = locking
                  ? await api.lockCentreProfile(centre.customerId)
                  : await api.unlockCentreProfile(centre.customerId);
                setBusy(null);
                refresh();
                if (!result.ok) {
                  failed(result.error.messageKey);
                  return;
                }
                showDialog(
                  t(locking ? 'centreAccess.lockedTitle' : 'centreAccess.unlockedTitle'),
                  t(locking ? 'centreAccess.lockedBody' : 'centreAccess.unlockedBody', {
                    centre: name,
                  }),
                  [{ text: t('common.ok') }],
                  { tone: 'success', icon: locking ? Lock : Unlock },
                );
              })();
            },
          },
        ],
        { tone: locking ? 'danger' : 'brand' },
      );
    },
    [failed, refresh, t],
  );

  return (
    <CentreAccessScreen
      state={state}
      now={now}
      busy={busy}
      refreshing={refreshing}
      onBack={back}
      onRefresh={() => {
        setRefreshing(true);
        refresh();
      }}
      onStop={stop}
      onTrust={trust}
      onLock={(centre) => changeLock(centre, 'lock')}
      onUnlock={(centre) => changeLock(centre, 'unlock')}
      onSignIn={() => router.push('/(auth)/mobile-number')}
    />
  );
}
