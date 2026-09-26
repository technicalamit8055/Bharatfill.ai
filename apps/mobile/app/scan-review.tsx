/**
 * Scan review route — crop and filter the pages of the scan in progress. The screen lives in
 * `components/scanner/ScanReviewScreen.tsx`; the pages live in the capture session.
 *
 * Save Document moves on to the Save Document screen (`app/save-document.tsx`), which names and
 * files the scan and seals it into the vault. Back returns to the camera with every page kept;
 * the camera's close button is where a scan is thrown away. Retake returns to the camera too,
 * and the next photo replaces the page on screen; review then reopens on it (`?page=<id>`).
 *
 * Crop edits a draft — corners, quarter turns and the straighten dial — that reaches the page
 * only on Done, so the page is processed once. Back (or the hardware back button) drops it.
 */

import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler } from 'react-native';
import { z } from 'zod';

import { type CropDraft, ScanReviewScreen } from '../components/scanner/ScanReviewScreen';
import { useTranslation } from '../lib/i18n/I18nProvider';
import {
  canAddPages,
  cancelRetake,
  removePage,
  retryPage,
  setPageCrop,
  setPageFilter,
  startRetake,
  useCaptureSession,
} from '../lib/scan/capture-session';
import type { PageFilter } from '../lib/scan/document-vision';
import {
  nextRotation,
  type PageRotation,
  previousRotation,
  type Quad,
  straightenedQuad,
  straightenFrame,
} from '../lib/scan/geometry';

/**
 * The crop being edited. `frame` is the crop as drawn over the straightened photo, so turning
 * the dial leaves it in place on screen (`straightenedQuad`).
 */
type CropEdit = {
  readonly pageId: string;
  readonly frame: Quad;
  readonly rotation: PageRotation;
  readonly straighten: number;
};

const pageIdSchema = z.string().uuid();

export default function ScanReviewRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { pages } = useCaptureSession();
  const params = useLocalSearchParams<{ page?: string }>();

  // Opens on the page just retaken, when there is one; otherwise on the newest page.
  const [currentId, setCurrentId] = useState<string | null>(() => {
    const parsed = pageIdSchema.safeParse(params.page);
    return parsed.success ? parsed.data : null;
  });
  const [edit, setEdit] = useState<CropEdit | null>(null);

  // Show the newest page when pages are added, and a neighbour when one is removed.
  const lastId = pages.at(-1)?.id ?? null;
  const seen = useRef({ lastId, count: pages.length });
  useEffect(() => {
    if (seen.current.lastId === lastId && seen.current.count === pages.length) return;
    seen.current = { lastId, count: pages.length };
    setCurrentId(lastId);
  }, [lastId, pages.length]);

  // Back on review without a new photo: the Retake was abandoned.
  useFocusEffect(
    useCallback(() => {
      cancelRetake();
    }, []),
  );
  const current = pages.find((page) => page.id === currentId) ?? pages.at(-1) ?? null;

  // The crop editor stays open only on the page it was opened for.
  const cropEdit = edit && current?.analysis && edit.pageId === current.id ? edit : null;
  const photoSize = current?.analysis?.size ?? null;
  const crop = useMemo<CropDraft | null>(
    () =>
      cropEdit && photoSize
        ? {
            quad: straightenedQuad(cropEdit.frame, cropEdit.straighten, photoSize),
            rotation: cropEdit.rotation,
            straighten: cropEdit.straighten,
          }
        : null,
    [cropEdit, photoSize],
  );

  const onStartCrop = useCallback(() => {
    if (!current?.analysis) return;
    const quad = current.quad ?? current.analysis.quad;
    setEdit({
      pageId: current.id,
      frame: straightenFrame(quad, current.straighten, current.analysis.size),
      rotation: current.rotation,
      straighten: current.straighten,
    });
  }, [current]);

  const onCropChange = useCallback(
    (quad: Quad) => {
      if (!cropEdit || !photoSize) return;
      setEdit({ ...cropEdit, frame: straightenFrame(quad, cropEdit.straighten, photoSize) });
    },
    [cropEdit, photoSize],
  );

  const onStraighten = useCallback(
    (straighten: number) => {
      if (cropEdit) setEdit({ ...cropEdit, straighten });
    },
    [cropEdit],
  );

  const onRotateLeft = useCallback(() => {
    if (cropEdit) setEdit({ ...cropEdit, rotation: previousRotation(cropEdit.rotation) });
  }, [cropEdit]);

  const onRotateRight = useCallback(() => {
    if (cropEdit) setEdit({ ...cropEdit, rotation: nextRotation(cropEdit.rotation) });
  }, [cropEdit]);

  /** Back to the page as it was detected: no turns, no straightening. */
  const onResetCrop = useCallback(() => {
    if (!cropEdit || !current?.analysis) return;
    setEdit({ ...cropEdit, frame: current.analysis.quad, rotation: 0, straighten: 0 });
  }, [cropEdit, current]);

  const onFinishCrop = useCallback(() => {
    if (current && crop) setPageCrop(current.id, crop);
    setEdit(null);
  }, [crop, current]);

  const onCancelCrop = useCallback(() => setEdit(null), []);

  // The hardware back button closes the crop editor before it leaves the screen.
  useEffect(() => {
    if (!cropEdit) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setEdit(null);
      return true;
    });
    return () => subscription.remove();
  }, [cropEdit]);

  /** Back to the camera that opened this review; it keeps the session's pages. */
  const backToCamera = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/scanner', params: { continue: '1' } });
  }, [router]);

  // Nothing left to review (last page retaken or deleted): back to the camera. Only while this
  // screen is on top — saving from Save Document empties the session on its way out.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (pages.length === 0 && isFocused) backToCamera();
  }, [backToCamera, isFocused, pages.length]);

  const onFilter = useCallback(
    (filter: PageFilter) => {
      if (current) setPageFilter(current.id, filter);
    },
    [current],
  );

  const onRetake = useCallback(() => {
    if (!current) return;
    setEdit(null);
    startRetake(current.id);
    backToCamera();
  }, [backToCamera, current]);

  const onDeletePage = useCallback(() => {
    if (!current) return;
    Alert.alert(t('scanReview.deleteTitle'), t('scanReview.deleteBody'), [
      { text: t('scanResult.cancel'), style: 'cancel' },
      { text: t('scanResult.delete'), style: 'destructive', onPress: () => removePage(current.id) },
    ]);
  }, [current, t]);

  const onSave = useCallback(() => {
    setEdit(null);
    router.push('/save-document');
  }, [router]);

  return (
    <ScanReviewScreen
      pages={pages}
      currentId={current?.id ?? null}
      crop={crop}
      canAddPage={canAddPages()}
      onSelectPage={setCurrentId}
      onFilter={onFilter}
      onStartCrop={onStartCrop}
      onCropChange={onCropChange}
      onStraighten={onStraighten}
      onRotateLeft={onRotateLeft}
      onRotateRight={onRotateRight}
      onFinishCrop={onFinishCrop}
      onCancelCrop={onCancelCrop}
      onResetCrop={onResetCrop}
      onRetake={onRetake}
      onDeletePage={onDeletePage}
      onRetry={() => current && retryPage(current.id)}
      onAddPage={backToCamera}
      onSave={onSave}
      onBack={backToCamera}
    />
  );
}
