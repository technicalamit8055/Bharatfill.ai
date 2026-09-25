/**
 * Vault tab route. The screen lives in `components/vault/VaultScreen.tsx`; this route reads the
 * encrypted on-device vault, turns its documents into list items, and owns what starring,
 * deleting and the menus do.
 *
 * The vault is re-read every time the tab comes into focus, so a document saved from the
 * scanner shows up straight away. Documents carry the name, type, folder and tags chosen on the
 * Save Document screen; ones saved before it existed are listed as "Scanned document" /
 * "Imported document" without a folder. Thumbnails are decrypted into memory only, one row at
 * a time.
 *
 * Development builds show the mockup's sample documents while the phone's vault is empty
 * (`components/vault/demo.tsx`); starring or deleting those only changes what is on screen.
 */

import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { DEMO_ID_PREFIX, demoVaultItems } from '../../components/vault/demo';
import { VaultScreen, type VaultScreenState } from '../../components/vault/VaultScreen';
import type { Translate } from '../../lib/i18n';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { documentTypeLabelKey } from '../../lib/vault/save-document';
import type { VaultDocument } from '../../lib/vault/vault-index';
import type { VaultItem } from '../../lib/vault/vault-screen';
import {
  deleteDocument,
  documentSizeBytes,
  listDocuments,
  readPageDataUri,
  setStarred,
} from '../../lib/vault/vault-storage';

function sizeOf(document: VaultDocument): number | null {
  try {
    return documentSizeBytes(document);
  } catch {
    return null;
  }
}

function toItem(document: VaultDocument, t: Translate): VaultItem {
  return {
    id: document.id,
    title: document.title ?? t(`vault.untitled.${document.source}`),
    category: document.category ?? null,
    tag: document.documentType
      ? t(documentTypeLabelKey(document.documentType))
      : t(`vault.source.${document.source}`),
    tags: document.tags ?? [],
    createdAt: new Date(document.createdAt),
    pageCount: document.pages.length,
    mimeType: document.pages[0]?.mimeType ?? 'image/jpeg',
    sizeBytes: sizeOf(document),
    starred: document.starred === true,
    thumbnail: { kind: 'vault' },
  };
}

function isDemo(item: VaultItem): boolean {
  return item.id.startsWith(DEMO_ID_PREFIX);
}

export default function VaultRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const isFocused = useIsFocused();

  const [state, setState] = useState<VaultScreenState>({ status: 'loading' });
  const [now, setNow] = useState(() => new Date());
  /** The vault documents behind the items on screen, for decrypting their thumbnails. */
  const documents = useRef<ReadonlyMap<string, VaultDocument>>(new Map());
  /** Drops the result of a read that a newer one has overtaken. */
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latestLoad.current;
    try {
      const listed = await listDocuments();
      if (ticket !== latestLoad.current) return;

      const openedAt = new Date();
      documents.current = new Map(listed.map((document) => [document.id, document]));
      setNow(openedAt);
      setState({
        status: 'ready',
        items:
          __DEV__ && listed.length === 0
            ? demoVaultItems(openedAt, t)
            : listed.map((document) => toItem(document, t)),
      });
    } catch {
      if (ticket === latestLoad.current) setState({ status: 'error' });
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void load();
  }, [load]);

  const loadThumbnail = useCallback(async (documentId: string) => {
    const document = documents.current.get(documentId);
    if (!document) throw new RangeError('No such document.');
    return readPageDataUri(document, 0);
  }, []);

  const updateItems = useCallback((change: (items: readonly VaultItem[]) => VaultItem[]) => {
    setState((current) =>
      current.status === 'ready' ? { status: 'ready', items: change(current.items) } : current,
    );
  }, []);

  const toggleStar = useCallback(
    async (item: VaultItem) => {
      const starred = !item.starred;
      const mark = (value: boolean) =>
        updateItems((items) =>
          items.map((each) => (each.id === item.id ? { ...each, starred: value } : each)),
        );

      mark(starred);
      if (isDemo(item)) return;
      try {
        await setStarred(item.id, starred);
      } catch {
        mark(!starred);
        Alert.alert(t('common.errorTitle'), t('vault.starFailed'), [{ text: t('common.ok') }]);
      }
    },
    [t, updateItems],
  );

  const remove = useCallback(
    async (item: VaultItem) => {
      if (isDemo(item)) {
        updateItems((items) => items.filter((each) => each.id !== item.id));
        return;
      }
      try {
        await deleteDocument(item.id);
      } catch {
        Alert.alert(t('common.errorTitle'), t('vault.deleteFailed'), [{ text: t('common.ok') }]);
      }
      await load();
    },
    [load, t, updateItems],
  );

  const confirmDelete = useCallback(
    (item: VaultItem) => {
      Alert.alert(
        t('vault.actions.deleteTitle'),
        t('vault.actions.deleteBody', { title: item.title }),
        [
          { text: t('vault.actions.cancel'), style: 'cancel' },
          {
            text: t('vault.actions.delete'),
            style: 'destructive',
            onPress: () => void remove(item),
          },
        ],
      );
    },
    [remove, t],
  );

  const documentActions = useCallback(
    (item: VaultItem) => {
      Alert.alert(item.title, undefined, [
        { text: t('vault.actions.cancel'), style: 'cancel' },
        {
          text: t(item.starred ? 'vault.actions.unstar' : 'vault.actions.star'),
          onPress: () => void toggleStar(item),
        },
        {
          text: t('vault.actions.delete'),
          style: 'destructive',
          onPress: () => confirmDelete(item),
        },
      ]);
    },
    [confirmDelete, t, toggleStar],
  );

  const scan = useCallback(
    (mode: 'single' | 'multi' = 'single') => {
      router.push({ pathname: '/scanner', params: { mode } });
    },
    [router],
  );

  const more = useCallback(() => {
    Alert.alert(t('vault.more'), undefined, [
      { text: t('vault.actions.cancel'), style: 'cancel' },
      { text: t('vault.actions.scan'), onPress: () => scan('single') },
      { text: t('vault.actions.scanMulti'), onPress: () => scan('multi') },
    ]);
  }, [scan, t]);

  return (
    <>
      {/* The vault is light-only artwork; claim the status bar only while this tab is showing. */}
      {isFocused ? <StatusBar style="dark" /> : null}
      <VaultScreen
        state={state}
        now={now}
        loadThumbnail={loadThumbnail}
        onToggleStar={(item) => void toggleStar(item)}
        onDocumentActions={documentActions}
        onMore={more}
        onScan={() => scan('single')}
        onRetry={retry}
      />
    </>
  );
}
