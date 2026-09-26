/**
 * Document Details route — `/document-details?id=<document id>`, opened from a Vault card. The
 * screen lives in `components/document-details/DocumentDetailsScreen.tsx`; this route loads the
 * document from the encrypted vault, decrypts its pages one by one into memory, and owns what
 * starring, editing, moving, deleting and the exports do.
 *
 * Share, Download and Print go through `lib/vault/document-export.ts`, which removes its
 * decrypted copy as soon as the system sheet closes; closing this screen clears it again in case
 * an export was interrupted.
 *
 * Development builds open the Vault's sample documents (`demo-…` ids) too. Changes to those
 * only change what is on screen, and the exports explain that they are samples.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { z } from 'zod';

import {
  type DocumentDetailsState,
  DocumentDetailsScreen,
  type ExportAction,
} from '../components/document-details/DocumentDetailsScreen';
import type { DocumentPage } from '../components/document-details/DocumentPageViewer';
import { DEMO_ID_PREFIX, demoVaultItems } from '../components/vault/demo';
import { useTranslation } from '../lib/i18n/I18nProvider';
import type { VaultCategoryKey } from '../lib/vault/categories';
import {
  exportFileName,
  exportFormat,
  type ExportKind,
  imageExportName,
  isCancellation,
} from '../lib/vault/document-details';
import {
  clearExports,
  downloadDocument,
  type ExportProgress,
  ExportUnavailableError,
  printDocument,
  shareDocument,
} from '../lib/vault/document-export';
import { removeTag } from '../lib/vault/save-document';
import type { DetailsChange, VaultDocument } from '../lib/vault/vault-index';
import type { VaultItem } from '../lib/vault/vault-screen';
import {
  deleteDocument,
  documentSizeBytes,
  getDocument,
  readPageDataUri,
  setStarred,
  updateDetails,
} from '../lib/vault/vault-storage';

const documentIdSchema = z.union([
  z.string().uuid(),
  z.string().regex(new RegExp(`^${DEMO_ID_PREFIX}[a-z_]+$`)),
]);

/** What the screen shows about the document; edits change it before the vault confirms them. */
type Shown = {
  readonly title: string;
  readonly category: VaultCategoryKey | null;
  readonly tags: readonly string[];
  readonly starred: boolean;
  readonly createdAt: Date;
  readonly pageCount: number;
  readonly mimeType: VaultItem['mimeType'];
  readonly sizeBytes: number | null;
};

type Load =
  | { readonly status: 'loading' | 'notFound' | 'unreadable' }
  | { readonly status: 'ready'; readonly shown: Shown; readonly pages: readonly DocumentPage[] };

function sizeOf(document: VaultDocument): number | null {
  try {
    return documentSizeBytes(document);
  } catch {
    return null;
  }
}

function applyChange(shown: Shown, change: DetailsChange): Shown {
  return {
    ...shown,
    ...(change.title !== undefined ? { title: change.title } : {}),
    ...(change.category !== undefined ? { category: change.category } : {}),
    ...(change.tags !== undefined ? { tags: change.tags } : {}),
  };
}

export default function DocumentDetailsRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();

  const parsedId = documentIdSchema.safeParse(params.id);
  const documentId = parsedId.success ? parsedId.data : null;
  const isDemo = documentId?.startsWith(DEMO_ID_PREFIX) === true;

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState<ExportAction | null>(null);
  /** The vault entry behind the screen, for exports. Null for sample documents. */
  const record = useRef<VaultDocument | null>(null);

  useEffect(() => {
    if (!documentId || (isDemo && !__DEV__)) {
      setLoad({ status: 'notFound' });
      return;
    }

    if (isDemo) {
      const item = demoVaultItems(new Date(), t).find((each) => each.id === documentId);
      setLoad(
        item
          ? {
              status: 'ready',
              shown: {
                ...item,
                tags: [
                  ...(item.tag ? [item.tag] : []),
                  ...(item.category ? [t(`home.vault.categories.${item.category}`)] : []),
                ],
              },
              pages: [
                item.thumbnail.kind === 'asset'
                  ? { kind: 'ready', source: item.thumbnail.source }
                  : { kind: 'failed' },
              ],
            }
          : { status: 'notFound' },
      );
      return;
    }

    let active = true;
    void (async () => {
      try {
        const document = await getDocument(documentId);
        if (!active) return;
        if (!document) {
          setLoad({ status: 'notFound' });
          return;
        }
        record.current = document;

        const firstPage = document.pages[0];
        const shown: Shown = {
          title: document.title ?? t(`vault.untitled.${document.source}`),
          category: document.category ?? null,
          tags: document.tags ?? [],
          starred: document.starred === true,
          createdAt: new Date(document.createdAt),
          pageCount: document.pages.length,
          mimeType: firstPage?.mimeType ?? 'image/jpeg',
          sizeBytes: sizeOf(document),
        };
        const pages: DocumentPage[] = document.pages.map(() => ({ kind: 'loading' }));
        setLoad({ status: 'ready', shown, pages: [...pages] });

        // One page at a time, so a slow booklet shows its first pages straight away.
        for (const pageIndex of pages.keys()) {
          try {
            pages[pageIndex] = {
              kind: 'ready',
              source: { uri: await readPageDataUri(document, pageIndex) },
            };
          } catch {
            pages[pageIndex] = { kind: 'failed' };
          }
          if (!active) return;
          const next = [...pages];
          setLoad((current) =>
            current.status === 'ready' ? { ...current, pages: next } : current,
          );
        }
      } catch {
        if (active) setLoad({ status: 'unreadable' });
      }
    })();

    return () => {
      active = false;
    };
    // `t` is left out on purpose: the title fallback is read once, and a language change must
    // not decrypt every page again.
  }, [documentId, isDemo]);

  // Any decrypted export copy left by an interrupted share goes when the screen closes.
  useEffect(() => clearExports, []);

  const state = useMemo<DocumentDetailsState>(() => {
    if (load.status !== 'ready') return { status: load.status };
    const { shown, pages } = load;
    return {
      status: 'ready',
      document: {
        title: shown.title,
        category: shown.category,
        tags: shown.tags,
        createdAt: shown.createdAt,
        fileName: exportFileName(
          shown.title,
          exportFormat(shown.pageCount, shown.mimeType).extension,
        ),
        sizeBytes: shown.sizeBytes,
        imageFormat: imageExportName(shown.pageCount, shown.mimeType),
        starred: shown.starred,
        pages,
      },
    };
  }, [load]);

  const shown = load.status === 'ready' ? load.shown : null;

  const setShown = useCallback((change: (current: Shown) => Shown) => {
    setLoad((current) =>
      current.status === 'ready' ? { ...current, shown: change(current.shown) } : current,
    );
  }, []);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/vault');
  }, [router]);

  const showError = useCallback(
    (key: string) => {
      Alert.alert(t('common.errorTitle'), t(key), [{ text: t('common.ok') }]);
    },
    [t],
  );

  const toggleStar = useCallback(async () => {
    if (!shown || !documentId) return;
    const starred = !shown.starred;
    setShown((current) => ({ ...current, starred }));
    if (isDemo) return;
    try {
      await setStarred(documentId, starred);
    } catch {
      setShown((current) => ({ ...current, starred: !starred }));
      showError('vault.starFailed');
    }
  }, [documentId, isDemo, setShown, showError, shown]);

  const change = useCallback(
    async (details: DetailsChange) => {
      if (!shown || !documentId) return;
      const before = shown;
      setShown((current) => applyChange(current, details));
      if (isDemo) return;
      try {
        const saved = await updateDetails(documentId, details);
        if (saved) record.current = saved;
      } catch {
        setShown(() => before);
        showError('documentDetails.errors.update');
      }
    },
    [documentId, isDemo, setShown, showError, shown],
  );

  const confirmRemoveTag = useCallback(
    (tag: string) => {
      if (!shown) return;
      Alert.alert(
        t('documentDetails.tag.removeTitle'),
        t('documentDetails.tag.removeBody', { tag }),
        [
          { text: t('documentDetails.menu.cancel'), style: 'cancel' },
          {
            text: t('documentDetails.tag.removeConfirm'),
            style: 'destructive',
            onPress: () => void change({ tags: removeTag(shown.tags, tag) }),
          },
        ],
      );
    },
    [change, shown, t],
  );

  const confirmDelete = useCallback(() => {
    if (!shown || !documentId) return;
    const remove = async () => {
      if (!isDemo) {
        try {
          await deleteDocument(documentId);
        } catch {
          showError('documentDetails.errors.delete');
          return;
        }
      }
      back();
    };
    Alert.alert(
      t('documentDetails.deleteTitle'),
      t('documentDetails.deleteBody', { title: shown.title }),
      [
        { text: t('documentDetails.menu.cancel'), style: 'cancel' },
        {
          text: t('documentDetails.menu.delete'),
          style: 'destructive',
          onPress: () => void remove(),
        },
      ],
    );
  }, [back, documentId, isDemo, showError, shown, t]);

  const runExport = useCallback(
    async (action: ExportAction, kind: ExportKind) => {
      const document = record.current;
      if (!shown || busy !== null) return;
      if (isDemo || !document) {
        Alert.alert(t('documentDetails.errors.sampleTitle'), t('documentDetails.errors.sample'), [
          { text: t('common.ok') },
        ]);
        return;
      }

      const progress: ExportProgress = (phase) => setBusy(phase === 'preparing' ? action : null);
      try {
        switch (action) {
          case 'share':
            await shareDocument(document, shown.title, kind, progress);
            break;
          case 'print':
            await printDocument(document, progress);
            break;
          case 'download': {
            const outcome = await downloadDocument(document, shown.title, kind, progress);
            if (outcome === 'done') {
              const fileName = exportFileName(
                shown.title,
                exportFormat(shown.pageCount, shown.mimeType, kind).extension,
              );
              Alert.alert(
                t('documentDetails.downloaded.title'),
                t('documentDetails.downloaded.body', { file: fileName }),
                [{ text: t('common.ok') }],
              );
            }
            break;
          }
        }
      } catch (error) {
        if (error instanceof ExportUnavailableError)
          showError('documentDetails.errors.unavailable');
        else if (!isCancellation(error)) showError(`documentDetails.errors.${action}`);
      } finally {
        setBusy(null);
      }
    },
    [busy, isDemo, showError, shown, t],
  );

  return (
    <>
      <StatusBar style="dark" />
      <DocumentDetailsScreen
        state={state}
        busy={busy}
        onBack={back}
        onToggleStar={() => void toggleStar()}
        onExport={(action, kind) => void runExport(action, kind)}
        onRename={(title) => void change({ title })}
        onChangeTags={(tags) => void change({ tags })}
        onRemoveTag={confirmRemoveTag}
        onMove={(category) => void change({ category })}
        onDelete={confirmDelete}
      />
    </>
  );
}
