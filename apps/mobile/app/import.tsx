/**
 * Upload route — add a photo or PDF that is already on the phone, without opening the camera.
 * Opened from Home's Upload tile and the Vault tab (`/import`), and from review to add or
 * replace a page (back on top of it, or `?continue=1` when review has nothing to go back to).
 * A document checklist adds `?preset=`, `?type=` and `?from=` (`lib/checklist/scan-goal.ts`).
 * The screen lives in `components/import/ImportScreen.tsx`.
 *
 * Photos come from the phone's photo picker, as in the scanner's Gallery button. Files come from
 * the system file picker, which copies each into the app's cache: images go in as they are, and
 * each PDF page is drawn as an image on the phone (`lib/scan/pdf-pages.ts`). A locked PDF asks
 * for its password (`PdfPasswordSheet`), which opens the file and is then dropped. Everything
 * picked joins the capture session with the `import` origin and goes on to scan review, crop,
 * filters and Save Document like any scan. The cache copies are deleted once sealed or
 * discarded; the files on the phone are never touched.
 *
 * What could not be added (an unsupported file, a damaged or locked PDF, pages over the limit)
 * is told in one message at the end. Nothing about a file — its name, its contents, the
 * password — is logged.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { type ImportBusy, ImportScreen } from '../components/import/ImportScreen';
import { PdfPasswordSheet } from '../components/import/PdfPasswordSheet';
import { showDialog } from '../lib/dialog/dialog-store';
import { parseScanGoal } from '../lib/checklist/scan-goal';
import { useTranslation } from '../lib/i18n/I18nProvider';
import {
  addPhotos,
  cancelRetake,
  discardSession,
  getSession,
  startSession,
  useCaptureSession,
} from '../lib/scan/capture-session';
import {
  classifyPickedFile,
  EMPTY_IMPORT_REPORT,
  type ImportReport,
  importReportMessages,
  importRoom,
  pickerMimeTypes,
} from '../lib/scan/file-import';
import {
  isPdfImportAvailable,
  PdfLockedError,
  PdfLockedUnsupportedError,
  type RenderedPdf,
  renderPdfPages,
} from '../lib/scan/pdf-pages';
import { parseScanPreset, presetPageLimit } from '../lib/scan/presets';
import { toFileUri } from '../lib/scan/scan-session';
import { discardIncoming } from '../lib/vault/vault-storage';

/** A locked PDF waiting for its password. */
type PasswordPrompt = {
  /** Remounts the sheet for each try, so a wrong password is not left in the field. */
  readonly attempt: number;
  readonly wrong: boolean;
  readonly position: { readonly number: number; readonly total: number } | null;
  readonly resolve: (password: string | null) => void;
};

type PdfOutcome = RenderedPdf | 'locked' | 'locked_unsupported' | 'unreadable';

export default function ImportRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    continue?: string;
    preset?: string;
    type?: string;
    from?: string;
  }>();
  const continuing = params.continue === '1';

  // Upload starts a fresh session; coming back from review keeps the one under review.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!continuing) {
      startSession(
        parseScanPreset(params.preset),
        'import',
        parseScanGoal(params.type, params.from),
      );
    }
  }, [continuing, params.from, params.preset, params.type]);

  const session = useCaptureSession();
  const pageCount = session.pages.length;
  const replacing = session.retakeId !== null;
  const pageLimit = presetPageLimit(session.preset);
  const [pdfAvailable] = useState(isPdfImportAvailable);
  const [busy, setBusy] = useState<ImportBusy>(null);
  const [prompt, setPrompt] = useState<PasswordPrompt | null>(null);
  /** Guards against a second picker while one is open or a file is still being read. */
  const working = useRef(false);
  const mounted = useRef(true);
  const attempts = useRef(0);
  const promptRef = useRef<PasswordPrompt | null>(null);
  promptRef.current = prompt;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Leaving mid-prompt: the PDF is skipped, and its loop stops.
      promptRef.current?.resolve(null);
    };
  }, []);

  const openReview = useCallback(
    (pageId?: string) => {
      router.push(pageId ? { pathname: '/scan-review', params: { page: pageId } } : '/scan-review');
    },
    [router],
  );

  const roomNow = useCallback(() => {
    const current = getSession();
    return importRoom({
      retaking: current.retakeId !== null,
      pageCount: current.pages.length,
      pageLimit: presetPageLimit(current.preset),
    });
  }, []);

  const showPageLimit = useCallback(() => {
    showDialog(
      t('scanner.errors.title'),
      t('importFiles.report.full', { max: pageLimit }),
      [{ text: t('common.ok') }],
      { tone: 'warning' },
    );
  }, [pageLimit, t]);

  const showReport = useCallback(
    (report: ImportReport) => {
      const messages = importReportMessages(report, pageLimit);
      if (messages.length === 0) return;
      showDialog(
        t('importFiles.report.title'),
        messages.map((message) => t(message.key, message.values)).join('\n\n'),
        [{ text: t('common.ok') }],
        { tone: 'warning' },
      );
    },
    [pageLimit, t],
  );

  /** Waits for the citizen to type the PDF's password; null when they skip it. */
  const askPassword = useCallback(
    (wrong: boolean, position: PasswordPrompt['position']) =>
      new Promise<string | null>((resolve) => {
        if (!mounted.current) {
          resolve(null);
          return;
        }
        attempts.current += 1;
        setPrompt({ attempt: attempts.current, wrong, position, resolve });
      }),
    [],
  );

  /** Draws the pages of one PDF, asking for its password as often as it takes. */
  const readPdf = useCallback(
    async (
      uri: string,
      maxPages: number,
      position: PasswordPrompt['position'],
    ): Promise<PdfOutcome> => {
      let password: string | undefined;
      for (;;) {
        try {
          return await renderPdfPages(uri, { password, maxPages });
        } catch (error) {
          if (error instanceof PdfLockedUnsupportedError) return 'locked_unsupported';
          if (!(error instanceof PdfLockedError)) return 'unreadable';
          const next = await askPassword(password !== undefined, position);
          if (next === null) return 'locked';
          password = next;
        }
      }
    },
    [askPassword],
  );

  const pickPhotos = useCallback(async () => {
    if (working.current) return;
    const room = roomNow();
    if (room <= 0) {
      showPageLimit();
      return;
    }
    const retaking = getSession().retakeId !== null;
    const several = !retaking && room > 1;

    working.current = true;
    setBusy('picking');
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: several,
        selectionLimit: several ? room : 1,
        orderedSelection: true,
        quality: 1,
        exif: false,
        // HEIC is converted to JPEG, which the page processing can read.
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (picked.canceled) return;
      const uris = picked.assets
        .map((asset) => asset.uri)
        .filter((uri) => uri.startsWith('file://'));
      // Left while the picker was open: the picker's cache copies are not wanted.
      if (!mounted.current) {
        discardIncoming(uris);
        return;
      }
      if (uris.length === 0) return;
      const [pageId] = addPhotos(uris, 'gallery');
      openReview(retaking ? pageId : undefined);
    } catch {
      showDialog(
        t('importFiles.errorTitle'),
        t('importFiles.errorBody'),
        [{ text: t('common.ok') }],
        {
          tone: 'danger',
        },
      );
    } finally {
      working.current = false;
      if (mounted.current) setBusy(null);
    }
  }, [openReview, roomNow, showPageLimit, t]);

  const pickFiles = useCallback(async () => {
    if (working.current) return;
    if (roomNow() <= 0) {
      showPageLimit();
      return;
    }
    const retaking = getSession().retakeId !== null;

    working.current = true;
    setBusy('picking');
    let report: ImportReport = EMPTY_IMPORT_REPORT;
    let firstPageId: string | undefined;
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: pickerMimeTypes(pdfAvailable),
        multiple: !retaking && roomNow() > 1,
        copyToCacheDirectory: true,
      });
      if (picked.canceled) return;
      setBusy('reading');

      const files = picked.assets.map((asset) => ({ ...asset, uri: toFileUri(asset.uri) }));
      for (const [index, file] of files.entries()) {
        // Every copy is the app's own, in its cache: deleted however this file ends.
        if (!mounted.current) {
          discardIncoming(files.slice(index).map((rest) => rest.uri));
          return;
        }
        const kind = classifyPickedFile(file, pdfAvailable);
        if (kind === 'unsupported' || !file.uri.startsWith('file://')) {
          discardIncoming([file.uri]);
          report = { ...report, unsupported: true };
          continue;
        }
        const room = roomNow();
        if (room <= 0) {
          discardIncoming([file.uri]);
          report = { ...report, overLimit: true };
          continue;
        }

        let pageIds: string[] = [];
        if (kind === 'image') {
          pageIds = addPhotos([file.uri], 'gallery');
        } else {
          const position = files.length > 1 ? { number: index + 1, total: files.length } : null;
          let outcome: PdfOutcome;
          try {
            outcome = await readPdf(file.uri, room, position);
          } finally {
            discardIncoming([file.uri]);
          }
          if (outcome === 'locked') report = { ...report, locked: true };
          else if (outcome === 'locked_unsupported')
            report = { ...report, lockedUnsupported: true };
          else if (outcome === 'unreadable') report = { ...report, unreadable: true };
          else if (!mounted.current) discardIncoming(outcome.pages.map((page) => page.uri));
          else {
            pageIds = addPhotos(
              outcome.pages.map((page) => page.uri),
              'pdf',
            );
            // Replacing a page takes one page by design; that is not "left out".
            if (outcome.pageCount > outcome.pages.length && !retaking) {
              report = { ...report, overLimit: true };
            }
          }
        }
        firstPageId ??= pageIds[0];
      }
    } catch {
      showDialog(
        t('importFiles.errorTitle'),
        t('importFiles.errorBody'),
        [{ text: t('common.ok') }],
        {
          tone: 'danger',
        },
      );
    } finally {
      working.current = false;
      if (mounted.current) {
        setBusy(null);
        setPrompt(null);
      }
    }
    if (!mounted.current) return;
    if (firstPageId) openReview(retaking ? firstPageId : undefined);
    showReport(report);
  }, [openReview, pdfAvailable, readPdf, roomNow, showPageLimit, showReport, t]);

  const leave = useCallback(() => {
    discardSession();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const close = useCallback(() => {
    if (working.current) return;
    // Replacing a page: going back keeps the page and the rest of the upload.
    if (getSession().retakeId !== null) {
      cancelRetake();
      return;
    }
    if (getSession().pages.length === 0) {
      leave();
      return;
    }
    showDialog(
      t('importFiles.discardTitle'),
      t('importFiles.discardBody'),
      [
        { text: t('scanResult.cancel'), style: 'cancel' },
        { text: t('scanner.discard'), style: 'destructive', onPress: leave },
      ],
      { icon: Trash2 },
    );
  }, [leave, t]);

  // The hardware back button asks, as the close button does, so pages are not left behind.
  // Only while this screen is on top: review, above it, has its own.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        close();
        return true;
      });
      return () => subscription.remove();
    }, [close]),
  );

  const settlePrompt = useCallback((password: string | null) => {
    const current = promptRef.current;
    setPrompt(null);
    current?.resolve(password);
  }, []);

  return (
    <>
      <ImportScreen
        busy={busy}
        pdfAvailable={pdfAvailable}
        pageCount={pageCount}
        replacing={replacing}
        onPickPhotos={() => void pickPhotos()}
        onPickFiles={() => void pickFiles()}
        onReview={() => openReview()}
        onClose={close}
      />
      {prompt ? (
        <PdfPasswordSheet
          key={prompt.attempt}
          wrong={prompt.wrong}
          position={prompt.position}
          onSubmit={(password) => settlePrompt(password)}
          onCancel={() => settlePrompt(null)}
        />
      ) : null}
    </>
  );
}
