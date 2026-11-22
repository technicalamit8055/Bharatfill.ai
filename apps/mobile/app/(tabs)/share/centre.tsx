/**
 * A centre's details route, pushed from Nearby CSC Centers or the Connect tab with the centre's
 * `id`. The screen lives in `components/connect/CentreDetailsScreen.tsx`; this route finds the
 * centre and owns what each tap does.
 *
 * There is no centre directory yet, so a production build never has a centre to show and lands
 * on "not found". Development builds look the id up among the mockups' sample centres.
 *
 * Share hands the centre's public listing (name, address, hours, phone) to the phone's share
 * sheet — nothing about the citizen. Saving is in memory only (`lib/connect/saved-centres`).
 * Directions, calling, service details and Connect & Share (spec §3 Feature 3) are not built;
 * each tap says so plainly and nothing is sent. The sample phone number is never dialled.
 */

import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, SearchX } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showDialog } from '../../../lib/dialog/dialog-store';
import { CentreDetailsScreen } from '../../../components/connect/CentreDetailsScreen';
import { demoNearbyCentres } from '../../../components/connect/demo';
import { connectPalette as palette } from '../../../components/connect/palette';
import { parseCentreParams, shareMessage } from '../../../lib/connect/centre-details';
import { NO_NEARBY_CENTRES } from '../../../lib/connect/connect-screen';
import { savedCentres, useSavedCentres } from '../../../lib/connect/saved-centres';
import { useTranslation } from '../../../lib/i18n/I18nProvider';

export default function CentreDetailsRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const centreId = parseCentreParams(useLocalSearchParams());
  const saved = useSavedCentres();

  const centre = useMemo(() => {
    const nearby = __DEV__ ? demoNearbyCentres() : NO_NEARBY_CENTRES;
    if (nearby.status !== 'ready' || centreId === null) return null;
    return nearby.centres.find((each) => each.id === centreId) ?? null;
  }, [centreId]);

  const comingSoon = useCallback(
    (bodyKey: string) => {
      showDialog(t('common.comingSoon'), t(bodyKey), [{ text: t('common.ok') }], { tone: 'brand' });
    },
    [t],
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/share');
  }, [router]);

  const handleShare = useCallback(async () => {
    if (!centre) return;
    try {
      await Share.share({ title: centre.name, message: shareMessage(centre, t) });
    } catch {
      showDialog(
        t('common.errorTitle'),
        t('connect.centre.shareFailed'),
        [{ text: t('common.ok') }],
        { tone: 'danger' },
      );
    }
  }, [centre, t]);

  return (
    <>
      {/* Connect is light-only artwork; claim the status bar only while this screen is showing. */}
      {isFocused ? <StatusBar style="dark" /> : null}
      {centre ? (
        <CentreDetailsScreen
          centre={centre}
          saved={saved.has(centre.id)}
          onBack={handleBack}
          onShare={() => void handleShare()}
          onToggleSaved={() => savedCentres.toggle(centre.id)}
          onDirections={() => comingSoon('connect.unavailable.directions')}
          onCall={() => comingSoon('connect.unavailable.call')}
          onOpenService={() => comingSoon('connect.unavailable.service')}
          onConnect={() => comingSoon('connect.unavailable.share_document')}
        />
      ) : (
        <SafeAreaView style={styles.root} edges={['top']}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('connect.centre.back')}
            hitSlop={10}
            onPress={handleBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <ChevronLeft color={palette.brandBlue} size={28} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.notFound}>
            <SearchX color={palette.textMuted} size={32} strokeWidth={2} />
            <Text style={styles.notFoundText}>{t('connect.centre.notFound')}</Text>
          </View>
        </SafeAreaView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  pressed: {
    opacity: 0.6,
  },
  back: {
    width: 44,
    height: 44,
    marginLeft: 8,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  notFoundText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: palette.textSecondary,
  },
});
