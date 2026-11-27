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

import { Download, FileCheck2, Tag, Trash2 } from 'lucide-react-native';
import {
  formatDimension,
  formatKb,
  formatSizeWindow,
  type RequirementPreset,
} from '@assistigo/document-tools';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { z } from 'zod';

import {
  type DocumentDetailsState,
  DocumentDetailsScreen,
  type ExportAction,
} from '../components/document-details/DocumentDetailsScreen';
import { showActionSheet, showDialog } from '../lib/dialog/dialog-store';
import type { DocumentPage } from '../components/document-details/DocumentPageViewer';
import { DEMO_ID_PREFIX, demoVaultItems } from '../components/vault/demo';
import { memberIdFromValue, memberValue, SELF } from '../lib/family/family';
import { useFamily } from '../lib/family/use-family';
import { useReminderCopy } from '../lib/family/use-reminder-copy';
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
import {
  type PortalExportResult,
  renderForPortal,
  sharePortalExport,
} from '../lib/vault/portal-export';
import { portalPresetsFor, presetName } from '../lib/vault/portal-presets';
import { removeTag } from '../lib/vault/save-document';
import type { ReadField } from '../lib/ocr/document-reading';
import {
  centreCopyFailed,
  type DetailsChange,
  type StoredQrCheck,
  type VaultDocument,
} from '../lib/vault/vault-index';
import type { VaultItem } from '../lib/vault/vault-screen';
import {
  deleteDocument,
  documentSizeBytes,
  getDocument,
  moveDocumentToMember,
  readPageDataUri,
  setPhoneOnly,
  setQrCheck,
  setStarred,
  updateDetails,
} from '../lib/vault/vault-storage';
import { cloudConfig } from '../lib/cloud/config';
import { summariseQrCheck } from '@assistigo/document-tools/qr';
import { QrCheckCard, type QrCheckCardState } from '../components/qr-check/QrCheckCard';
import { openQrLink, qrCardState } from '../lib/scan/qr-card';
import { storedQrCheckView } from '../lib/scan/qr-check-view';
import { useQrCheck } from '../lib/scan/use-qr-check';
import { formatVaultDate } from '../lib/vault/vault-screen';

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
  /** "Keep on this phone only"; null when this build has no cloud vault or for samples. */
  readonly phoneOnly: boolean | null;
  /** The document can be exported to a portal preset (a single photo or signature). */
  readonly forPortal: boolean;
  readonly addedByCentre?: string | null;
  /** Backed up, but cyber cafes cannot see it yet (the server's copy failed). */
  readonly centreCopyFailed?: boolean;
  /** Whose document: `SELF` or a family member's id. */
  readonly owner: string;
  /** Details the phone read off it (`lib/ocr`). */
  readonly readFields: readonly ReadField[];
};

/** "Keep on this phone only" as the menu offers it: never for a family member's document. */
function phoneOnlyShown(document: VaultDocument): boolean | null {
  if (!cloudConfig() || document.memberId) return null;
  return document.phoneOnly === true;
}

type Load =
  | { readonly status: 'loading' | 'notFound' | 'unreadable' }
  | { readonly status: 'ready'; readonly shown: Shown; readonly pages: readonly DocumentPage[] };

/** A page decrypted for the viewer, as its data URI; null for anything else. */
function dataUriOf(source: unknown): string | null {
  if (typeof source !== 'object' || source === null || !('uri' in source)) return null;
  const { uri } = source;
  return typeof uri === 'string' && uri.startsWith('data:') ? uri : null;
}

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
  const { t, locale } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();

  const parsedId = documentIdSchema.safeParse(params.id);
  const documentId = parsedId.success ? parsedId.data : null;
  const isDemo = documentId?.startsWith(DEMO_ID_PREFIX) === true;

  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState<ExportAction | null>(null);
  const family = useFamily();
  const reminderCopy = useReminderCopy();
  /** The vault entry behind the screen, for exports. Null for sample documents. */
  const record = useRef<VaultDocument | null>(null);
  /** What the document's QR code proved when last checked (its summary only). */
  const [storedQr, setStoredQr] = useState<StoredQrCheck | null>(null);
  const qr = useQrCheck(documentId ?? '');
  const runQr = qr.run;

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
                phoneOnly: null,
                forPortal: false,
                owner: SELF,
                readFields: [],
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
        setStoredQr(document.qrCheck ?? null);

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
          phoneOnly: phoneOnlyShown(document),
          forPortal:
            portalPresetsFor(document.documentType ?? null, document.pages.length).length > 0,
          addedByCentre: document.addedByCentre ?? null,
          centreCopyFailed: centreCopyFailed(document),
          owner: memberValue(document.memberId ?? null),
          readFields: document.reading?.fields ?? [],
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
        phoneOnly: shown.phoneOnly,
        forPortal: shown.forPortal,
        addedByCentre: shown.addedByCentre ?? null,
        centreCopyFailed: shown.centreCopyFailed === true,
        owner: shown.owner,
        ownerLabel: shown.owner === SELF ? null : family.labelOf(shown.owner),
        readFields: shown.readFields,
        pages,
      },
    };
  }, [family.labelOf, load]);

  const owners = useMemo(
    () => [
      { value: SELF, label: family.labelOf(null) },
      ...family.members.map((member) => ({ value: member.id, label: family.labelOf(member.id) })),
    ],
    [family.labelOf, family.members],
  );

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
      showDialog(t('common.errorTitle'), t(key), [{ text: t('common.ok') }], { tone: 'danger' });
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

  const togglePhoneOnly = useCallback(async () => {
    if (!shown || shown.phoneOnly === null || !documentId || isDemo) return;
    const phoneOnly = !shown.phoneOnly;
    setShown((current) => ({ ...current, phoneOnly }));
    try {
      await setPhoneOnly(documentId, phoneOnly);
    } catch {
      setShown((current) => ({ ...current, phoneOnly: !phoneOnly }));
      showError('documentDetails.cloud.changeFailed');
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

  /**
   * Files the document under another person. Handing a document a centre can use to a family
   * member takes that copy away, so the citizen is asked first.
   */
  const changeOwner = useCallback(
    (owner: string) => {
      if (!shown || !documentId || isDemo || owner === shown.owner) return;
      const move = async () => {
        try {
          const saved = await moveDocumentToMember(
            documentId,
            memberIdFromValue(owner),
            reminderCopy,
          );
          if (!saved) return;
          record.current = saved;
          setShown((current) => ({ ...current, owner, phoneOnly: phoneOnlyShown(saved) }));
        } catch {
          showError('family.details.moveFailed');
        }
      };
      if (owner !== SELF && shown.owner === SELF && shown.phoneOnly === false) {
        showDialog(
          t('family.details.unshareTitle', { name: family.labelOf(owner) }),
          t('family.details.unshareBody'),
          [
            { text: t('documentDetails.menu.cancel'), style: 'cancel' },
            { text: t('family.details.unshareConfirm'), onPress: () => void move() },
          ],
          { tone: 'warning' },
        );
        return;
      }
      void move();
    },
    [documentId, family, isDemo, reminderCopy, setShown, showError, shown, t],
  );

  const confirmRemoveTag = useCallback(
    (tag: string) => {
      if (!shown) return;
      showDialog(
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
        { icon: Tag },
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
    showDialog(
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
      { icon: Trash2 },
    );
  }, [back, documentId, isDemo, showError, shown, t]);

  const runExport = useCallback(
    async (action: ExportAction, kind: ExportKind) => {
      const document = record.current;
      if (!shown || busy !== null) return;
      if (isDemo || !document) {
        showDialog(t('documentDetails.errors.sampleTitle'), t('documentDetails.errors.sample'), [
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
              showDialog(
                t('documentDetails.downloaded.title'),
                t('documentDetails.downloaded.body', { file: fileName }),
                [{ text: t('common.ok') }],
                { tone: 'success', icon: Download },
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

  /** Renders the page for one preset, says what came out, and offers the share sheet. */
  const exportForPreset = useCallback(
    async (document: VaultDocument, preset: RequirementPreset) => {
      const name = presetName(preset, locale);
      setBusy('share');
      let result: PortalExportResult;
      try {
        result = await renderForPortal(document, preset);
      } catch {
        showError('documentDetails.errors.share');
        return;
      } finally {
        setBusy(null);
      }

      if (!result.ok) {
        showDialog(
          t('portalExport.failedTitle'),
          t(`portalExport.${result.reason}`, { preset: name }),
          [{ text: t('common.ok') }],
          { tone: 'warning' },
        );
        return;
      }

      const window = formatSizeWindow({
        ...(preset.minBytes !== undefined ? { minBytes: preset.minBytes } : {}),
        ...(preset.maxBytes !== undefined ? { maxBytes: preset.maxBytes } : {}),
      });
      const lines = [
        t('portalExport.readyBody', {
          size: formatKb(result.bytes.length),
          width: result.width,
          height: result.height,
        }),
        ...(window ? [t('portalExport.window', { window })] : []),
        ...(preset.requiresNameDateStamp ? [t('portalExport.nameDateStamp')] : []),
      ];
      const ready = result;
      showDialog(
        t('portalExport.readyTitle', { preset: name }),
        lines.join('\n\n'),
        [
          {
            text: t('documentDetails.actions.share'),
            onPress: () =>
              void sharePortalExport(ready, name).catch((error: unknown) => {
                if (error instanceof ExportUnavailableError)
                  showError('documentDetails.errors.unavailable');
                else if (!isCancellation(error)) showError('documentDetails.errors.share');
              }),
          },
          { text: t('common.cancel'), style: 'cancel' },
        ],
        { tone: 'success', icon: FileCheck2 },
      );
    },
    [locale, showError, t],
  );

  const exportForPortal = useCallback(() => {
    const document = record.current;
    if (!document || busy !== null) return;
    const presets = portalPresetsFor(document.documentType ?? null, document.pages.length);
    if (presets.length === 0) return;
    showActionSheet({
      title: t('portalExport.chooseTitle'),
      message: t('portalExport.chooseBody'),
      cancelLabel: t('common.cancel'),
      actions: presets.map((preset) => ({
        key: preset.code,
        label: presetName(preset, locale),
        description: [
          formatSizeWindow({
            ...(preset.minBytes !== undefined ? { minBytes: preset.minBytes } : {}),
            ...(preset.maxBytes !== undefined ? { maxBytes: preset.maxBytes } : {}),
          }),
          formatDimension(preset),
        ]
          .filter((part): part is string => part !== null)
          .join(' · '),
        onPress: () => void exportForPreset(document, preset),
      })),
    });
  }, [busy, exportForPreset, locale, t]);

  /** Checks the pages already open on screen (decrypted in memory), then keeps the summary. */
  const checkQr = useCallback(async () => {
    if (isDemo || !documentId || load.status !== 'ready') return;
    const sources = load.pages.flatMap((page) => {
      const uri = page.kind === 'ready' ? dataUriOf(page.source) : null;
      return uri ? [{ kind: 'base64' as const, read: async () => uri }] : [];
    });
    if (sources.length === 0) return;
    const check = await runQr(sources);
    if (!check) return;
    const summary = summariseQrCheck(check, new Date());
    setStoredQr(summary);
    try {
      await setQrCheck(documentId, summary);
    } catch {
      // Shown already; keeping the summary is a convenience, not worth an error.
    }
  }, [documentId, isDemo, load, runQr]);

  const documentType = record.current?.documentType ?? null;
  const qrCardView: QrCheckCardState =
    qr.state.status !== 'idle'
      ? qrCardState(qr.state, documentType)
      : storedQr
        ? {
            status: 'done',
            view: storedQrCheckView(storedQr, documentType),
            checkedOn: formatVaultDate(new Date(storedQr.checkedAt), t),
          }
        : { status: 'idle' };
  const pagesReady =
    load.status === 'ready' && load.pages.length > 0 && load.pages.every((page) => page.kind !== 'loading');
  const qrCard =
    isDemo || load.status !== 'ready' ? null : (
      <QrCheckCard
        state={qrCardView}
        onOpenLink={() => openQrLink(qr.state, t)}
        {...(pagesReady && qrCardView.status === 'idle' ? { onCheck: () => void checkQr() } : {})}
        {...(pagesReady && (qrCardView.status === 'done' || qrCardView.status === 'none')
          ? { onCheckAgain: () => void checkQr() }
          : {})}
      />
    );

  return (
    <>
      <StatusBar style="dark" />
      <DocumentDetailsScreen
        qrCard={qrCard}
        state={state}
        busy={busy}
        onBack={back}
        onToggleStar={() => void toggleStar()}
        onTogglePhoneOnly={() => void togglePhoneOnly()}
        onExport={(action, kind) => void runExport(action, kind)}
        onExportForPortal={exportForPortal}
        onRename={(title) => void change({ title })}
        onChangeTags={(tags) => void change({ tags })}
        onRemoveTag={confirmRemoveTag}
        onMove={(category) => void change({ category })}
        onDelete={confirmDelete}
        owners={isDemo ? [] : owners}
        onChangeOwner={changeOwner}
      />
    </>
  );
}
