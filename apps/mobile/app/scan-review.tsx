/**
 * Scan review route — crop and filter the pages of the scan in progress. The screen lives in
 * `components/scanner/ScanReviewScreen.tsx`; the pages live in the capture session.
 *
 * Save moves on to the Save Document screen (`app/save-document.tsx`), which names and files
 * the scan and seals it into the vault. Closing throws the session and its temporary files away.
 */

import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { ScanReviewScreen } from '../components/scanner/ScanReviewScreen';
import { useTranslation } from '../lib/i18n/I18nProvider';
import {
  canAddPages,
  discardSession,
  removePage,
  retryPage,
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

  const onSave = useCallback(() => {
    setCropping(false);
    router.push('/save-document');
  }, [router]);

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
      onSave={onSave}
      onClose={onClose}
    />
  );
}
