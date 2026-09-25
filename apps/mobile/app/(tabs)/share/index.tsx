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
 * Sharing documents with an operator, the access history and help requests (spec §3 Features 3
 * and 4) are not built: what an operator can see, and how the citizen approves it, is a privacy
 * decision still to be made. Those taps say so plainly; no citizen data is read or sent.
 */

import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';

import { ConnectScreen } from '../../../components/connect/ConnectScreen';
import { demoNearbyCentres } from '../../../components/connect/demo';
import {
  type ConnectAction,
  type NearbyCentre,
  NO_NEARBY_CENTRES,
} from '../../../lib/connect/connect-screen';
import type { NearbyView } from '../../../lib/connect/nearby-search';
import { useTranslation } from '../../../lib/i18n/I18nProvider';

export default function ConnectRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const isFocused = useIsFocused();

  const nearby = useMemo(() => (__DEV__ ? demoNearbyCentres() : NO_NEARBY_CENTRES), []);

  const comingSoon = useCallback(
    (bodyKey: string) => {
      Alert.alert(t('common.comingSoon'), t(bodyKey), [{ text: t('common.ok') }]);
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
    Alert.alert(t('connect.about.title'), t('connect.about.body'), [{ text: t('common.ok') }]);
  }, [t]);

  const handleAction = useCallback(
    (action: ConnectAction) => {
      if (action === 'find_nearby') openNearby();
      else comingSoon(`connect.unavailable.${action}`);
    },
    [comingSoon, openNearby],
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
