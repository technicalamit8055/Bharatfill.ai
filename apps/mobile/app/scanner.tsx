/**
 * Scanner route — the in-app document camera, a full-screen modal over the tabs. Opened from the
 * Scan tab, the Home hero and quick actions (`?mode=single|multi`, or `?preset=id_card|photo|
 * signature` for the dedicated modes in `lib/scan/presets.ts`), and from review to add a page
 * (`?continue=1`, which keeps the pages already taken, and their preset).
 *
 * An ID card is shot front, then back, with a prompt for each; review opens once both are in. A
 * photo or a signature is one shot. After every shot Auto Capture holds off until the page is
 * taken away or moved (`LiveDetection.armed`), so the page still lying there is not shot twice.
 *
 * The live preview (VisionCamera) feeds shrunken frames to OpenCV to find the page; its outline
 * is drawn over the preview, and in Auto Capture the photo is taken once the page has been held
 * steady. Photos go into the capture session and on to `app/scan-review.tsx` for cropping,
 * filters and saving. The screen lives in `components/scanner/ScannerScreen.tsx`.
 *
 * An ordinary document scan uses Google's on-device document scanner instead, when the phone
 * has it (`lib/scan/platform-scanner.ts`): it opens straight away, and every time this screen
 * comes back into view (Add page, Retake, Back from review). Its pages, already cropped and
 * cleaned, go to review. Backing out of it with no pages leaves; with pages, the launcher
 * (`PlatformScanLauncher`) offers scan again, review, the in-app camera, or close. When it is not
 * available or fails to open, this screen falls back to the in-app camera.
 */

import { Lightbulb, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet } from 'react-native';
import {
  Camera,
  type CameraRef,
  CommonResolutions,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';

import { showDialog } from '../lib/dialog/dialog-store';
import { PlatformScanLauncher } from '../components/scanner/PlatformScanLauncher';
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
  getSession,
  startSession,
  useCaptureSession,
} from '../lib/scan/capture-session';
import { steadyProgress } from '../lib/scan/geometry';
import {
  choosePlatformEngine,
  isPlatformScannerAvailable,
  PlatformScannerUnavailableError,
  platformPageRoom,
  scanWithPlatformML,
} from '../lib/scan/platform-scanner';
import {
  parseScanPreset,
  presetCaptureMode,
  presetPageLimit,
  type ScanPreset,
} from '../lib/scan/presets';
import { type CaptureMode, parseScanPageMode, toFileUri } from '../lib/scan/scan-session';

/** After a shot in multi-page mode, wait this long before auto-capturing the next page. */
const AUTO_CAPTURE_COOLDOWN_MS = 2000;

/** Google's document scanner, or the in-app camera (VisionCamera + OpenCV). */
type ScanEngine = 'platform' | 'in-app';

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
  const params = useLocalSearchParams<{ mode?: string; preset?: string; continue?: string }>();
  const continuing = params.continue === '1';
  /** Fixed for this camera: the preset asked for, or, when adding a page, the scan's own. */
  const [preset] = useState<ScanPreset>(() =>
    continuing ? getSession().preset : parseScanPreset(params.preset),
  );
  const pageLimit = presetPageLimit(preset);
  const [engine, setEngine] = useState<ScanEngine>(() =>
    choosePlatformEngine(preset, isPlatformScannerAvailable()) ? 'platform' : 'in-app',
  );
  /** Google's scanner is opening or open. The ref guards against opening it twice. */
  const [platformBusy, setPlatformBusy] = useState(false);
  const platformOpen = useRef(false);

  const session = useCaptureSession();
  const [multiPage, setMultiPage] = useState(
    () => preset === 'document' && (parseScanPageMode(params.mode) === 'multi' || continuing),
  );
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() => presetCaptureMode(preset));
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shotCount, setShotCount] = useState(0);
  /** The torch can only be set on a running session; setting it earlier is rejected. */
  const [cameraStarted, setCameraStarted] = useState(false);
  const cooldownUntil = useRef(0);

  // A fresh scan starts a fresh session for its preset; adding a page keeps the one under review.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!continuing) startSession(preset);
  }, [continuing, preset]);

  const permission = useCameraPermission();
  const asked = useRef(false);
  // Google's scanner holds its own camera access; the app asks only for the in-app camera.
  useEffect(() => {
    if (engine !== 'in-app' || asked.current || !permission.canRequestPermission) return;
    asked.current = true;
    void permission.requestPermission();
  }, [engine, permission]);
  const access: CameraAccess = permission.hasPermission
    ? 'granted'
    : permission.canRequestPermission
      ? 'checking'
      : 'denied';

  const isFocused = useIsFocused();
  const appActive = useAppActive();
  const cameraActive = engine === 'in-app' && isFocused && appActive && access === 'granted';

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
    if (preset === 'document' && isFocused && pageCount > 0) setMultiPage(true);
  }, [isFocused, pageCount, preset]);
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
      showDialog(
        t('scanner.errors.title'),
        t('scanner.errors.pageLimit', { max: pageLimit }),
        [{ text: t('common.ok') }],
        { tone: 'warning' },
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
      detection.disarm();
      cooldownUntil.current = Date.now() + AUTO_CAPTURE_COOLDOWN_MS;
      if (retaking) openReview(pageId);
      // An ID card waits for its back; review opens once both sides are in.
      else if (preset === 'id_card') {
        if (getSession().pages.length >= pageLimit) openReview();
      } else if (!multiPage) openReview();
    } catch {
      showDialog(
        t('scanner.errors.title'),
        t('scanner.errors.captureFailed'),
        [{ text: t('common.ok') }],
        { tone: 'danger' },
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    cameraActive,
    detection,
    multiPage,
    openReview,
    pageLimit,
    photoOutput,
    preset,
    retaking,
    t,
  ]);

  // Auto Capture: shoot once the page has been held steady long enough — and, after a shot,
  // only once the page has been taken away or moved, so the same page is not shot twice.
  useEffect(() => {
    if (captureMode !== 'auto' || busy || !cameraActive || !detection.outline) return;
    if (!detection.armed || Date.now() < cooldownUntil.current) return;
    if (progress >= 1) void capture();
  }, [busy, cameraActive, capture, captureMode, detection.armed, detection.outline, progress]);

  const pickFromGallery = useCallback(async () => {
    const room = retaking ? 1 : pageLimit - pageCount;
    if (room <= 0) return;
    const several = (multiPage || preset === 'id_card') && !retaking && room > 1;

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
  }, [multiPage, openReview, pageCount, pageLimit, preset, retaking]);

  /** Throws the scan away and leaves the scanner. */
  const leave = useCallback(() => {
    discardSession();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  /**
   * Opens Google's document scanner for as many pages as fit, then hands what it scanned to
   * review. Backing out of it with nothing taken leaves; when it cannot be used here, the
   * in-app camera takes over.
   */
  const launchPlatform = useCallback(async () => {
    if (platformOpen.current) return;
    const current = getSession();
    const isRetake = current.retakeId !== null;
    const room = platformPageRoom({
      retaking: isRetake,
      pageCount: current.pages.length,
      pageLimit,
    });
    if (room <= 0) {
      showDialog(
        t('scanner.errors.title'),
        t('scanner.errors.pageLimit', { max: pageLimit }),
        [{ text: t('common.ok') }],
        { tone: 'warning' },
      );
      return;
    }

    platformOpen.current = true;
    setPlatformBusy(true);
    try {
      const scanned = await scanWithPlatformML({ maxPages: room, allowGalleryImport: true });
      if (!scanned) {
        if (getSession().pages.length === 0) leave();
        return;
      }
      const [pageId] = addPhotos(
        scanned.map((page) => page.uri),
        'platform',
      );
      openReview(isRetake ? pageId : undefined);
    } catch (error) {
      if (error instanceof PlatformScannerUnavailableError) setEngine('in-app');
      else {
        showDialog(
          t('scanner.errors.title'),
          t('scanner.errors.captureFailed'),
          [{ text: t('common.ok') }],
          { tone: 'danger' },
        );
      }
    } finally {
      platformOpen.current = false;
      setPlatformBusy(false);
    }
  }, [leave, openReview, pageLimit, t]);

  // Google's scanner opens whenever this screen comes into view: on arrival, and on returning
  // from review to add a page, retake one, or go back. Keyed on the engine only, so a change in
  // the session while it is open does not open it again.
  const launchRef = useRef(launchPlatform);
  launchRef.current = launchPlatform;
  useFocusEffect(
    useCallback(() => {
      if (engine === 'platform') void launchRef.current();
    }, [engine]),
  );

  const close = useCallback(() => {
    if (pageCount === 0) {
      leave();
      return;
    }
    showDialog(
      t('scanner.discardTitle'),
      t('scanner.discardBody', { count: pageCount }),
      [
        { text: t('scanResult.cancel'), style: 'cancel' },
        { text: t('scanner.discard'), style: 'destructive', onPress: leave },
      ],
      { icon: Trash2 },
    );
  }, [leave, pageCount, t]);

  const showTips = useCallback(() => {
    showDialog(t('scanner.tipsTitle'), t('scanner.tipsBody'), [{ text: t('common.ok') }], {
      icon: Lightbulb,
    });
  }, [t]);

  const grantAccess = useCallback(() => {
    if (permission.canRequestPermission) void permission.requestPermission();
    else void Linking.openSettings();
  }, [permission]);

  /**
   * What to put in front of the camera, for a preset. An ID card's prompt names the side the next
   * shot is: the next one in turn, or the one a retake replaces.
   */
  const side = retaking
    ? session.pages.findIndex((page) => page.id === session.retakeId)
    : pageCount;
  const guide =
    preset === 'id_card'
      ? t(side <= 0 ? 'scanner.presets.idCard.front' : 'scanner.presets.idCard.back')
      : preset === 'photo'
        ? t('scanner.presets.photo.guide')
        : preset === 'signature'
          ? t('scanner.presets.signature.guide')
          : null;

  const status: ScannerStatus = !cameraActive
    ? 'starting'
    : busy
      ? 'capturing'
      : detection.outline
        ? captureMode === 'auto'
          ? 'hold'
          : 'tap'
        : 'searching';

  if (engine === 'platform') {
    return (
      <PlatformScanLauncher
        busy={platformBusy}
        pageCount={pageCount}
        onScan={() => void launchPlatform()}
        onReview={() => openReview()}
        onUseCamera={() => setEngine('in-app')}
        onClose={close}
      />
    );
  }

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
      multiPageToggle={preset === 'document'}
      guide={guide}
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
