/**
 * Connect tab route (the `share` route, labelled Connect). The screen lives in
 * `components/connect/ConnectScreen.tsx`; this route decides which nearby centres it shows and
 * what each tap does.
 *
 * Finding a nearby centre and the map open Nearby CSC Centers (`nearby.tsx`); a centre's card
 * opens its details (`centre.tsx`). Centre search needs the phone's location and a directory of centres, neither
 * of which exists yet, so a production build shows no centres and never asks for location.
 * Development builds show the mockups' sample centres (`components/connect/demo.tsx`) so the
 * layout can be reviewed full.
 *
 * Share Document opens the counter code (`code.tsx`, design §4.2) in cloud builds. The access
 * history and help requests are not built; those taps say so plainly and send nothing.
 */

import { CircleHelp } from 'lucide-react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';

import { showDialog } from '../../../lib/dialog/dialog-store';
import { ConnectScreen } from '../../../components/connect/ConnectScreen';
import { demoNearbyCentres } from '../../../components/connect/demo';
import {
  type ConnectAction,
  type NearbyCentre,
  NO_NEARBY_CENTRES,
} from '../../../lib/connect/connect-screen';
import type { NearbyView } from '../../../lib/connect/nearby-search';
import { cloudConfig } from '../../../lib/cloud/config';
import { useTranslation } from '../../../lib/i18n/I18nProvider';

export default function ConnectRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const isFocused = useIsFocused();

  const nearby = useMemo(() => (__DEV__ ? demoNearbyCentres() : NO_NEARBY_CENTRES), []);

  const comingSoon = useCallback(
    (bodyKey: string) => {
      showDialog(t('common.comingSoon'), t(bodyKey), [{ text: t('common.ok') }], { tone: 'brand' });
    },
    [t],
  );

  const openNearby = useCallback(
    (params: { view?: NearbyView } = {}) => {
      router.push({ pathname: '/share/nearby', params });
    },
    [router],
  );

  const handleHelp = useCallback(() => {
    showDialog(t('connect.about.title'), t('connect.about.body'), [{ text: t('common.ok') }], {
      icon: CircleHelp,
    });
  }, [t]);

  const handleAction = useCallback(
    (action: ConnectAction) => {
      if (action === 'find_nearby') openNearby();
      // Cloud builds: a 6-digit code the citizen reads out at the counter (design §4.2).
      else if (action === 'share_document' && cloudConfig()) router.push('/share/code');
      else comingSoon(`connect.unavailable.${action}`);
    },
    [comingSoon, openNearby, router],
  );

  const handleViewMap = useCallback(() => openNearby({ view: 'map' }), [openNearby]);
  const handleOpenCentre = useCallback(
    (centre: NearbyCentre) => {
      router.push({ pathname: '/share/centre', params: { id: centre.id } });
    },
    [router],
  );
  const handleViewAllServices = useCallback(
    () => comingSoon('connect.unavailable.services'),
    [comingSoon],
  );

  return (
    <>
      {/* Connect is light-only artwork; claim the status bar only while this tab is showing. */}
      {isFocused ? <StatusBar style="dark" /> : null}
      <ConnectScreen
        nearby={nearby}
        onHelp={handleHelp}
        onAction={handleAction}
        onViewMap={handleViewMap}
        onOpenCentre={handleOpenCentre}
        onViewAllServices={handleViewAllServices}
      />
    </>
  );
}
