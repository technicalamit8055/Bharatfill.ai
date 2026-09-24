/**
 * Scan review route — crop, filter and save the pages of the scan in progress. The screen lives
 * in `components/scanner/ScanReviewScreen.tsx`; the pages live in the capture session.
 *
 * Saving seals every page into one encrypted vault document and deletes all temporary files;
 * closing throws the session away the same way.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { ScanReviewScreen } from '../components/scanner/ScanReviewScreen';
import { useTranslation } from '../lib/i18n/I18nProvider';
import {
  canAddPages,
  discardSession,
  removePage,
  retryPage,
  saveSession,
  setPageFilter,
  setPageQuad,
  useCaptureSession,
} from '../lib/scan/capture-session';
import type { PageFilter } from '../lib/scan/document-vision';
import type { Quad } from '../lib/scan/geometry';

export default function ScanReviewRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { pages } = useCaptureSession();

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);
  const [saving, setSaving] = useState(false);

  // Show the newest page when pages are added, and a neighbour when one is removed.
  const lastId = pages.at(-1)?.id ?? null;
  useEffect(() => {
    setCurrentId(lastId);
  }, [lastId, pages.length]);
  const current = pages.find((page) => page.id === currentId) ?? pages.at(-1) ?? null;

  /** Back to the camera that opened this review; it keeps the session's pages. */
  const backToCamera = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/scanner', params: { continue: '1' } });
  }, [router]);

  // Nothing left to review (last page retaken or deleted): back to the camera.
  useEffect(() => {
    if (pages.length === 0 && !saving) backToCamera();
  }, [backToCamera, pages.length, saving]);

  const onFilter = useCallback(
    (filter: PageFilter) => {
      if (current) setPageFilter(current.id, filter);
    },
    [current],
  );

  const onCropChange = useCallback(
    (quad: Quad) => {
      if (current) setPageQuad(current.id, quad);
    },
    [current],
  );

  const onResetCrop = useCallback(() => {
    if (current?.analysis) setPageQuad(current.id, current.analysis.quad);
  }, [current]);

  const onRetake = useCallback(() => {
    if (current) removePage(current.id);
  }, [current]);

  const onDeletePage = useCallback(() => {
    if (!current) return;
    Alert.alert(t('scanReview.deleteTitle'), t('scanReview.deleteBody'), [
      { text: t('scanResult.cancel'), style: 'cancel' },
      { text: t('scanResult.delete'), style: 'destructive', onPress: () => removePage(current.id) },
    ]);
  }, [current, t]);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const documentId = await saveSession();
      // Close the camera and review, so Done on the result goes back to the tabs.
      router.dismissAll();
      router.push({ pathname: '/scan-result', params: { id: documentId } });
    } catch {
      setSaving(false);
      Alert.alert(t('scanner.errors.title'), t('scanReview.saveFailed'), [
        { text: t('common.ok') },
      ]);
    }
  }, [router, t]);

  const onClose = useCallback(() => {
    Alert.alert(t('scanner.discardTitle'), t('scanner.discardBody', { count: pages.length }), [
      { text: t('scanResult.cancel'), style: 'cancel' },
      {
        text: t('scanner.discard'),
        style: 'destructive',
        onPress: () => {
          discardSession();
          router.dismissAll();
        },
      },
    ]);
  }, [pages.length, router, t]);

  return (
    <ScanReviewScreen
      pages={pages}
      currentId={current?.id ?? null}
      cropping={cropping}
      saving={saving}
      canAddPage={canAddPages()}
      onSelectPage={setCurrentId}
      onFilter={onFilter}
      onStartCrop={() => setCropping(true)}
      onCropChange={onCropChange}
      onFinishCrop={() => setCropping(false)}
      onResetCrop={onResetCrop}
      onRetake={onRetake}
      onDeletePage={onDeletePage}
      onRetry={() => current && retryPage(current.id)}
      onAddPage={backToCamera}
      onSave={() => void onSave()}
      onClose={onClose}
    />
  );
}
