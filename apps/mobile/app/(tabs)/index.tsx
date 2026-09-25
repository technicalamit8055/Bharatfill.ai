/**
 * Home tab route. The screen lives in `components/home/HomeDashboardScreen.tsx`; this route owns
 * navigation and decides what the dashboard holds.
 *
 * There is no vault store or saved profile yet, so a production build shows the empty
 * dashboard: no name, no counts, no recent documents. Development builds show the design
 * mockup's sample content instead (`components/home/demo.tsx`) so the layout can be reviewed
 * full. The Cyber Cafe / CSC banner opens the Connect tab. Features the dashboard points at that
 * do not exist yet — notifications, per-document actions — say so plainly, and nothing is sent.
 */

import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';

import { demoHomeDashboard } from '../../components/home/demo';
import { HomeDashboardScreen } from '../../components/home/HomeDashboardScreen';
import { EMPTY_HOME_DASHBOARD, type QuickScanMode } from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';

export default function HomeRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const isFocused = useIsFocused();

  const { dashboard, now } = useMemo(() => {
    const openedAt = new Date();
    return {
      now: openedAt,
      dashboard: __DEV__ ? demoHomeDashboard(openedAt, t) : EMPTY_HOME_DASHBOARD,
    };
  }, [t]);

  const comingSoon = useCallback(
    (bodyKey: string) => {
      Alert.alert(t('common.comingSoon'), t(bodyKey), [{ text: t('common.ok') }]);
    },
    [t],
  );

  const handleScan = useCallback(
    (mode: QuickScanMode) => {
      // The platform scanner has no photo or signature presets; only the page count differs.
      router.push({
        pathname: '/scanner',
        params: { mode: mode === 'multi_page' ? 'multi' : 'single' },
      });
    },
    [router],
  );

  const handleOpenVault = useCallback(() => {
    router.navigate('/vault');
  }, [router]);

  const handleOpenProfile = useCallback(() => {
    router.navigate('/profile');
  }, [router]);

  const handleOpenNotifications = useCallback(() => {
    comingSoon('home.notificationsUnavailable');
  }, [comingSoon]);

  const handleConnect = useCallback(() => {
    router.navigate('/share');
  }, [router]);

  const handleDocumentActions = useCallback(() => {
    comingSoon('home.recent.actionsUnavailable');
  }, [comingSoon]);

  return (
    <>
      {/* Home is light-only artwork; claim the status bar only while this tab is showing. */}
      {isFocused ? <StatusBar style="dark" /> : null}
      <HomeDashboardScreen
        dashboard={dashboard}
        now={now}
        onScan={handleScan}
        onOpenNotifications={handleOpenNotifications}
        onOpenProfile={handleOpenProfile}
        onConnect={handleConnect}
        onOpenVault={handleOpenVault}
        onDocumentActions={handleDocumentActions}
      />
    </>
  );
}
