/**
 * Scanner route — the in-app document camera, a full-screen modal over the tabs. Opened from the
 * Scan tab, the Home hero and quick actions (`?mode=single|multi`), and from review to add a page
 * (`?continue=1`, which keeps the pages already taken).
 *
 * The live preview (VisionCamera) feeds shrunken frames to OpenCV to find the page; its outline
 * is drawn over the preview, and in Auto Capture the photo is taken once the page has been held
 * steady. Photos go into the capture session and on to `app/scan-review.tsx` for cropping,
 * filters and saving. The screen lives in `components/scanner/ScannerScreen.tsx`.
 */

import * as ImagePicker from 'expo-image-picker';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet } from 'react-native';
import {
  Camera,
  type CameraRef,
  CommonResolutions,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import {
  type CameraAccess,
  ScannerScreen,
  type ScannerStatus,
} from '../components/scanner/ScannerScreen';
import { useLiveDocumentDetection } from '../components/scanner/useLiveDocumentDetection';
import { useTranslation } from '../lib/i18n/I18nProvider';
import {
  addPhotos,
  canAddPages,
  discardSession,
  useCaptureSession,
} from '../lib/scan/capture-session';
import { steadyProgress } from '../lib/scan/geometry';
import {
  type CaptureMode,
  MULTI_PAGE_LIMIT,
  parseScanPageMode,
  toFileUri,
} from '../lib/scan/scan-session';

/** After a shot in multi-page mode, wait this long before auto-capturing the next page. */
const AUTO_CAPTURE_COOLDOWN_MS = 2000;

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}

export default function ScannerRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string; continue?: string }>();
  const continuing = params.continue === '1';

  const session = useCaptureSession();
  const [multiPage, setMultiPage] = useState(
    () => parseScanPageMode(params.mode) === 'multi' || continuing,
  );
  const [captureMode, setCaptureMode] = useState<CaptureMode>('auto');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shotCount, setShotCount] = useState(0);
  /** The torch can only be set on a running session; setting it earlier is rejected. */
  const [cameraStarted, setCameraStarted] = useState(false);
  const cooldownUntil = useRef(0);

  // A fresh scan starts a fresh session; adding a page keeps the one under review.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!continuing) discardSession();
  }, [continuing]);

  const permission = useCameraPermission();
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !permission.canRequestPermission) return;
    asked.current = true;
    void permission.requestPermission();
  }, [permission]);
  const access: CameraAccess = permission.hasPermission
    ? 'granted'
    : permission.canRequestPermission
      ? 'checking'
      : 'denied';

  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const cameraActive = isFocused && appActive && access === 'granted';

  const cameraRef = useRef<CameraRef>(null);
  // 12 MP, what the page is cut from: every pixel lost here shows as blur when the scan is
  // zoomed. 'quality' gives the camera time for its best exposure and processing; a page
  // holds still, so the slower capture costs little.
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.UHD_4_3,
    quality: 0.95,
    qualityPrioritization: 'quality',
  });
  const { detection, frameOutput } = useLiveDocumentDetection(cameraRef, cameraActive && !busy);

  const pageCount = session.pages.length;
  /** Retake from review: the next photo replaces that page, then review opens on it. */
  const retaking = session.retakeId !== null;

  // Coming back from review with pages in hand ("Add page") means a multi-page scan.
  useEffect(() => {
    if (isFocused && pageCount > 0) setMultiPage(true);
  }, [isFocused, pageCount]);
  const progress = steadyProgress(detection.stability, Date.now());

  const openReview = useCallback(
    (pageId?: string) => {
      router.push(pageId ? { pathname: '/scan-review', params: { page: pageId } } : '/scan-review');
    },
    [router],
  );

  const capture = useCallback(async () => {
    if (busy || !cameraActive) return;
    if (!canAddPages()) {
      Alert.alert(
        t('scanner.errors.title'),
        t('scanner.errors.pageLimit', { max: MULTI_PAGE_LIMIT }),
        [{ text: t('common.ok') }],
      );
      return;
    }

    setBusy(true);
    try {
      const photo = await photoOutput.capturePhotoToFile(
        { flashMode: 'off', enableShutterSound: true },
        {},
      );
      setShotCount((count) => count + 1);
      const [pageId] = addPhotos([toFileUri(photo.filePath)], 'camera');
      detection.reset();
      cooldownUntil.current = Date.now() + AUTO_CAPTURE_COOLDOWN_MS;
      if (retaking) openReview(pageId);
      else if (!multiPage) openReview();
    } catch {
      Alert.alert(t('scanner.errors.title'), t('scanner.errors.captureFailed'), [
        { text: t('common.ok') },
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, cameraActive, detection, multiPage, openReview, photoOutput, retaking, t]);

  // Auto Capture: shoot once the page has been held steady long enough.
  useEffect(() => {
    if (captureMode !== 'auto' || busy || !cameraActive || !detection.outline) return;
    if (Date.now() < cooldownUntil.current) return;
    if (progress >= 1) void capture();
  }, [busy, cameraActive, capture, captureMode, detection.outline, progress]);

  const pickFromGallery = useCallback(async () => {
    const room = retaking ? 1 : MULTI_PAGE_LIMIT - pageCount;
    if (room <= 0) return;
    const several = multiPage && !retaking;

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

    const uris = picked.assets.map((asset) => asset.uri).filter((uri) => uri.startsWith('file://'));
    if (uris.length === 0) return;
    const [pageId] = addPhotos(uris, 'gallery');
    openReview(retaking ? pageId : undefined);
  }, [multiPage, openReview, pageCount, retaking]);

  const close = useCallback(() => {
    const leave = () => {
      discardSession();
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    };
    if (pageCount === 0) {
      leave();
      return;
    }
    Alert.alert(t('scanner.discardTitle'), t('scanner.discardBody', { count: pageCount }), [
      { text: t('scanResult.cancel'), style: 'cancel' },
      { text: t('scanner.discard'), style: 'destructive', onPress: leave },
    ]);
  }, [pageCount, router, t]);

  const showTips = useCallback(() => {
    Alert.alert(t('scanner.tipsTitle'), t('scanner.tipsBody'), [{ text: t('common.ok') }]);
  }, [t]);

  const grantAccess = useCallback(() => {
    if (permission.canRequestPermission) void permission.requestPermission();
    else void Linking.openSettings();
  }, [permission]);

  const status: ScannerStatus = !cameraActive
    ? 'starting'
    : busy
      ? 'capturing'
      : detection.outline
        ? captureMode === 'auto'
          ? 'hold'
          : 'tap'
        : 'searching';

  return (
    <ScannerScreen
      camera={
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device="back"
          isActive={cameraActive}
          outputs={[photoOutput, frameOutput]}
          torchMode={cameraStarted ? (torch ? 'on' : 'off') : undefined}
          onStarted={() => setCameraStarted(true)}
          onStopped={() => setCameraStarted(false)}
          resizeMode="cover"
          enableNativeTapToFocusGesture
        />
      }
      access={access}
      outline={detection.outline}
      status={status}
      progress={progress}
      busy={busy}
      captureMode={captureMode}
      torch={torch}
      multiPage={multiPage}
      pageCount={pageCount}
      shotCount={shotCount}
      onCaptureModeChange={setCaptureMode}
      onToggleTorch={() => setTorch((on) => !on)}
      onToggleMultiPage={() => setMultiPage((on) => !on)}
      onReview={openReview}
      onClose={close}
      onTips={showTips}
      onShutter={() => void capture()}
      onGallery={() => void pickFromGallery()}
      onGrantAccess={grantAccess}
    />
  );
}
