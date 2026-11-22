/**
 * Home tab route. The screen lives in `components/home/HomeDashboardScreen.tsx`; this route owns
 * navigation and decides what the dashboard holds.
 *
 * The dashboard comes from the encrypted on-device vault, re-read every time the tab comes into
 * focus (as the Vault tab does): document counts per category and the newest documents, whose
 * first pages are decrypted into memory only, as thumbnails. Tapping one opens its details.
 * There is no saved profile, so the greeting has no name. A vault that cannot be read shows the
 * empty dashboard.
 *
 * Development builds show the design mockup's sample content (`components/home/demo.tsx`) while
 * the phone's vault is empty, so the layout can be reviewed full. The quick actions open the
 * scanner or one of its presets (ID card, photo, signature). Features the dashboard points at
 * that do not exist yet — notifications — say so plainly, and nothing is sent.
 */

import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';

import { showDialog } from '../../lib/dialog/dialog-store';
import { demoHomeDashboard } from '../../components/home/demo';
import { HomeDashboardScreen } from '../../components/home/HomeDashboardScreen';
import {
  EMPTY_HOME_DASHBOARD,
  type HomeDashboard,
  type QuickScanMode,
  quickScanParams,
  type RecentDocument,
  vaultDashboardSummary,
} from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { VaultDocument } from '../../lib/vault/vault-index';
import { listDocuments, readPageDataUri } from '../../lib/vault/vault-storage';

/** A thumbnail that cannot be decrypted is left blank rather than failing the dashboard. */
async function thumbnailOf(document: VaultDocument): Promise<RecentDocument['thumbnail']> {
  try {
    return { uri: await readPageDataUri(document, 0) };
  } catch {
    return {};
  }
}

export default function HomeRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const isFocused = useIsFocused();

  const [now, setNow] = useState(() => new Date());
  const [dashboard, setDashboard] = useState<HomeDashboard>(EMPTY_HOME_DASHBOARD);
  /** Ids of the real vault documents on screen; anything else is sample content. */
  const vaultIds = useRef<ReadonlySet<string>>(new Set());
  /** Drops the result of a read that a newer one has overtaken. */
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latestLoad.current;
    let documents: readonly VaultDocument[];
    try {
      documents = await listDocuments();
    } catch {
      documents = [];
    }
    const openedAt = new Date();

    if (__DEV__ && documents.length === 0) {
      if (ticket !== latestLoad.current) return;
      vaultIds.current = new Set();
      setNow(openedAt);
      setDashboard(demoHomeDashboard(openedAt, t));
      return;
    }

    const { documentCounts, recent } = vaultDashboardSummary(documents);
    const recentDocuments = await Promise.all(
      recent.map(async (document): Promise<RecentDocument> => ({
        id: document.id,
        title: document.title ?? t(`vault.untitled.${document.source}`),
        createdAt: new Date(document.createdAt),
        thumbnail: await thumbnailOf(document),
      })),
    );
    if (ticket !== latestLoad.current) return;
    vaultIds.current = new Set(recent.map((document) => document.id));
    setNow(openedAt);
    setDashboard({ ...EMPTY_HOME_DASHBOARD, documentCounts, recentDocuments });
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const comingSoon = useCallback(
    (bodyKey: string) => {
      showDialog(t('common.comingSoon'), t(bodyKey), [{ text: t('common.ok') }], { tone: 'brand' });
    },
    [t],
  );

  const handleScan = useCallback(
    (mode: QuickScanMode) => {
      router.push({ pathname: '/scanner', params: quickScanParams(mode) });
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

  const handleDocumentActions = useCallback(
    (document: RecentDocument) => {
      if (vaultIds.current.has(document.id)) {
        router.push({ pathname: '/document-details', params: { id: document.id } });
      } else {
        comingSoon('home.recent.actionsUnavailable');
      }
    },
    [comingSoon, router],
  );

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
