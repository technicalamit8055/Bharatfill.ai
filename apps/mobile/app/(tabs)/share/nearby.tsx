/**
 * Nearby CSC Centers route, pushed from the Connect tab. The screen lives in
 * `components/connect/NearbyCentresScreen.tsx`; this route reads which view and centre to open
 * with, decides which centres exist, and owns what each tap does. Tapping a centre's card opens
 * its details (`centre.tsx`).
 *
 * Centre search needs the phone's location and a directory of centres, neither of which exists
 * yet, so a production build shows no centres and never asks for location. Development builds
 * show the mockups' sample centres (`components/connect/demo.tsx`).
 *
 * Using the phone's location, directions (which hand a place to a maps app), connecting to a
 * centre (spec §3 Feature 3) and opening-time alerts are not built; each tap says so plainly and
 * nothing is read, sent or shared. Bookmarks are kept in memory only (`lib/connect/saved-centres`).
 */

import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';

import { demoNearbyCentres } from '../../../components/connect/demo';
import { NearbyCentresScreen } from '../../../components/connect/NearbyCentresScreen';
import { type NearbyCentre, NO_NEARBY_CENTRES } from '../../../lib/connect/connect-screen';
import { parseNearbyParams } from '../../../lib/connect/nearby-search';
import { savedCentres, useSavedCentres } from '../../../lib/connect/saved-centres';
import { useTranslation } from '../../../lib/i18n/I18nProvider';

export default function NearbyCentresRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const params = parseNearbyParams(useLocalSearchParams());

  const nearby = useMemo(() => (__DEV__ ? demoNearbyCentres() : NO_NEARBY_CENTRES), []);
  const bookmarks = useSavedCentres();

  const comingSoon = useCallback(
    (bodyKey: string) => {
      Alert.alert(t('common.comingSoon'), t(bodyKey), [{ text: t('common.ok') }]);
    },
    [t],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/share');
  }, [router]);

  const handleHelp = useCallback(() => {
    Alert.alert(t('connect.about.title'), t('connect.about.body'), [{ text: t('common.ok') }]);
  }, [t]);

  const toggleBookmark = useCallback((centre: NearbyCentre) => {
    savedCentres.toggle(centre.id);
  }, []);

  const openCentre = useCallback(
    (centre: NearbyCentre) => {
      router.push({ pathname: '/share/centre', params: { id: centre.id } });
    },
    [router],
  );

  return (
    <>
      {/* Connect is light-only artwork; claim the status bar only while this screen is showing. */}
      {isFocused ? <StatusBar style="dark" /> : null}
      <NearbyCentresScreen
        nearby={nearby}
        initialView={params.view}
        initialCentreId={params.centreId}
        bookmarks={bookmarks}
        onBack={handleBack}
        onHelp={handleHelp}
        onUseLocation={() => comingSoon('connect.unavailable.location')}
        onToggleBookmark={toggleBookmark}
        onOpenCentre={openCentre}
        onDirections={() => comingSoon('connect.unavailable.directions')}
        onConnect={() => comingSoon('connect.unavailable.share_document')}
        onNotify={() => comingSoon('connect.unavailable.notify')}
      />
    </>
  );
}
