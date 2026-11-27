/**
 * Vault tab route. The screen lives in `components/vault/VaultScreen.tsx`; this route reads the
 * encrypted on-device vault, turns its documents into list items, and owns what opening,
 * starring, deleting and the menus do.
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
import { FileUp, Files, ScanLine, Star, StarOff, Trash2 } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';

import { showActionSheet, showDialog } from '../../lib/dialog/dialog-store';
import { MemberSwitcher } from '../../components/family/MemberSwitcher';
import { DEMO_ID_PREFIX, demoVaultItems } from '../../components/vault/demo';
import { documentsOf } from '../../lib/family/family';
import { useMemberSwitcher } from '../../lib/family/use-member-switcher';
import { VaultScreen, type VaultScreenState } from '../../components/vault/VaultScreen';
import type { Translate } from '../../lib/i18n';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { everydayKindLabelKey } from '../../lib/vault/everyday';
import { documentTypeLabelKey } from '../../lib/vault/save-document';
import { centreCopyFailed, type VaultDocument } from '../../lib/vault/vault-index';
import type { VaultItem } from '../../lib/vault/vault-screen';
import {
  deleteDocument,
  documentSizeBytes,
  listDocuments,
  readPageDataUri,
  readSearchTexts,
  setStarred,
} from '../../lib/vault/vault-storage';
import { readUnreadDocuments } from '../../lib/ocr/read-documents';

/** What search looks through besides the name and tags: the details read off it, and its text. */
function searchTextOf(document: VaultDocument, text: string | undefined): string | undefined {
  const parts = [...(document.reading?.fields.map((field) => field.value) ?? []), text ?? ''];
  const joined = parts.filter((part) => part !== '').join('\n');
  return joined === '' ? undefined : joined;
}

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
    tag: document.everydayKind
      ? t(everydayKindLabelKey(document.everydayKind))
      : document.documentType
        ? t(documentTypeLabelKey(document.documentType))
        : t(`vault.source.${document.source}`),
    everyday: document.everydayKind !== undefined,
    tags: document.tags ?? [],
    createdAt: new Date(document.createdAt),
    pageCount: document.pages.length,
    mimeType: document.pages[0]?.mimeType ?? 'image/jpeg',
    sizeBytes: sizeOf(document),
    starred: document.starred === true,
    thumbnail: { kind: 'vault' },
    centreCopyFailed: centreCopyFailed(document),
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
  /** Every person's documents, for the switcher's expiry dots. */
  const [allDocuments, setAllDocuments] = useState<readonly VaultDocument[]>([]);
  const switcher = useMemberSwitcher(allDocuments, now);
  const active = switcher.family.active;
  /** The vault documents behind the items on screen, for decrypting their thumbnails. */
  const documents = useRef<ReadonlyMap<string, VaultDocument>>(new Map());
  /** Drops the result of a read that a newer one has overtaken. */
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latestLoad.current;
    try {
      const everyone = await listDocuments();
      if (ticket !== latestLoad.current) return;
      // One person's documents at a time: the citizen, or the family member picked above.
      const listed = documentsOf(everyone, active);

      const openedAt = new Date();
      documents.current = new Map(listed.map((document) => [document.id, document]));
      setAllDocuments(everyone);
      setNow(openedAt);
      setState({
        status: 'ready',
        items:
          __DEV__ && everyone.length === 0
            ? demoVaultItems(openedAt, t)
            : listed.map((document) => toItem(document, t)),
      });

      // The text read off each document, for search: decrypted into memory after the list shows.
      const texts = await readSearchTexts(listed).catch(
        (): ReadonlyMap<string, string> => new Map(),
      );
      if (ticket !== latestLoad.current) return;
      const byId = new Map(listed.map((document) => [document.id, document]));
      setState((current) =>
        current.status === 'ready'
          ? {
              status: 'ready',
              items: current.items.map((item) => {
                const document = byId.get(item.id);
                const searchText = document ? searchTextOf(document, texts.get(item.id)) : undefined;
                return searchText ? { ...item, searchText } : item;
              }),
            }
          : current,
      );
    } catch {
      if (ticket === latestLoad.current) setState({ status: 'error' });
    }
  }, [active, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Documents saved before the phone could read them are read in the background, then
      // become searchable by their text.
      void readUnreadDocuments()
        .then((read) => {
          if (read > 0) void load();
        })
        .catch(() => undefined);
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
        showDialog(t('common.errorTitle'), t('vault.starFailed'), [{ text: t('common.ok') }], {
          tone: 'danger',
        });
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
        showDialog(t('common.errorTitle'), t('vault.deleteFailed'), [{ text: t('common.ok') }], {
          tone: 'danger',
        });
      }
      await load();
    },
    [load, t, updateItems],
  );

  const confirmDelete = useCallback(
    (item: VaultItem) => {
      showDialog(
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
        { icon: Trash2 },
      );
    },
    [remove, t],
  );

  const documentActions = useCallback(
    (item: VaultItem) => {
      showActionSheet({
        title: item.title,
        cancelLabel: t('vault.actions.cancel'),
        actions: [
          {
            key: 'star',
            label: t(item.starred ? 'vault.actions.unstar' : 'vault.actions.star'),
            icon: item.starred ? StarOff : Star,
            onPress: () => void toggleStar(item),
          },
          {
            key: 'delete',
            label: t('vault.actions.delete'),
            icon: Trash2,
            destructive: true,
            onPress: () => confirmDelete(item),
          },
        ],
      });
    },
    [confirmDelete, t, toggleStar],
  );

  const open = useCallback(
    (item: VaultItem) => {
      router.push({ pathname: '/document-details', params: { id: item.id } });
    },
    [router],
  );

  const scan = useCallback(
    (mode: 'single' | 'multi' = 'single') => {
      router.push({ pathname: '/scanner', params: { mode } });
    },
    [router],
  );

  const upload = useCallback(() => {
    router.push('/import');
  }, [router]);

  const more = useCallback(() => {
    showActionSheet({
      title: t('vault.more'),
      cancelLabel: t('vault.actions.cancel'),
      actions: [
        {
          key: 'scan',
          label: t('vault.actions.scan'),
          description: t('vault.actions.scanHint'),
          icon: ScanLine,
          onPress: () => scan('single'),
        },
        {
          key: 'scan-multi',
          label: t('vault.actions.scanMulti'),
          description: t('vault.actions.scanMultiHint'),
          icon: Files,
          onPress: () => scan('multi'),
        },
        {
          key: 'upload',
          label: t('vault.actions.upload'),
          description: t('vault.actions.uploadHint'),
          icon: FileUp,
          onPress: upload,
        },
      ],
    });
  }, [scan, t, upload]);

  return (
    <>
      {/* The vault is light-only artwork; claim the status bar only while this tab is showing. */}
      {isFocused ? <StatusBar style="dark" /> : null}
      <VaultScreen
        state={state}
        now={now}
        loadThumbnail={loadThumbnail}
        onOpenDocument={open}
        onToggleStar={(item) => void toggleStar(item)}
        onDocumentActions={documentActions}
        onMore={more}
        onScan={() => scan('single')}
        onUpload={upload}
        onRetry={retry}
        familyBar={
          <MemberSwitcher
            chips={switcher.chips}
            selected={switcher.selected}
            onSelect={switcher.onSelect}
            {...(switcher.onAdd ? { onAdd: switcher.onAdd } : {})}
          />
        }
      />
    </>
  );
}
