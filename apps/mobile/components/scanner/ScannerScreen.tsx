/**
 * Scanner — the full-screen camera from the mockup: close, Flash and Tips at the top, "Position
 * your document", the live preview with the detected page outlined, Auto Capture / Manual,
 * Gallery / shutter / Multi-Page, and the AI note.
 *
 * Presentational only: the route owns the camera, detection and capture. The live preview comes
 * in as `camera` and fills the screen behind everything else.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  Camera as CameraIcon,
  ChevronLeft,
  ChevronRight,
  Files,
  FileScan,
  Image as ImageIcon,
  Lightbulb,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { type ReactNode, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { Quad } from '../../lib/scan/geometry';
import { CAPTURE_MODES, type CaptureMode } from '../../lib/scan/scan-session';
import { scannerPalette as palette } from './palette';
import { ScanOverlay } from './ScanOverlay';
import { ShutterButton } from './ShutterButton';

/** What the headline's second line tells the citizen. Copy at `scanner.status.<status>`. */
export type ScannerStatus = 'starting' | 'searching' | 'hold' | 'tap' | 'capturing';

export type CameraAccess = 'checking' | 'granted' | 'denied';

export type ScannerScreenProps = {
  readonly camera: ReactNode;
  readonly access: CameraAccess;
  readonly outline: Quad | null;
  readonly status: ScannerStatus;
  /** 0–1 towards auto-capture. */
  readonly progress: number;
  readonly busy: boolean;
  readonly captureMode: CaptureMode;
  readonly torch: boolean;
  readonly multiPage: boolean;
  /**
   * Whether the Multi-Page switch is offered. A preset decides its own page count, so instead
   * the slot shows the pages taken once there are any (an ID card's front), or stays empty.
   */
  readonly multiPageToggle: boolean;
  /** For a preset: what to put in front of the camera ("Scan the front of the card"). */
  readonly guide: string | null;
  readonly pageCount: number;
  /** Changes on every shot, to play the white flash. */
  readonly shotCount: number;
  readonly onCaptureModeChange: (mode: CaptureMode) => void;
  readonly onToggleTorch: () => void;
  readonly onToggleMultiPage: () => void;
  readonly onReview: () => void;
  readonly onClose: () => void;
  readonly onTips: () => void;
  readonly onShutter: () => void;
  readonly onGallery: () => void;
  readonly onGrantAccess: () => void;
};

export function ScannerScreen(props: ScannerScreenProps) {
  const { t } = useTranslation();
  const {
    camera,
    access,
    outline,
    status,
    progress,
    busy,
    captureMode,
    torch,
    multiPage,
    multiPageToggle,
    guide,
    pageCount,
    shotCount,
  } = props;
  const showPages = (multiPage || !multiPageToggle) && pageCount > 0;

  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (shotCount === 0) return;
    flash.setValue(0.85);
    Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }).start();
  }, [flash, shotCount]);

  const cameraReady = access === 'granted';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ---- Live camera and page outline ---- */}
      {cameraReady ? camera : null}
      {cameraReady ? <ScanOverlay outline={outline} /> : null}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.captureFlash, opacity: flash }]}
      />

      <LinearGradient colors={palette.scrimTop} style={styles.scrimTop} pointerEvents="none" />
      <LinearGradient
        colors={palette.scrimBottom}
        style={styles.scrimBottom}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* ---- Top bar ---- */}
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scanner.close')}
            hitSlop={4}
            onPress={props.onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.controlPressed]}
          >
            <ChevronLeft color={palette.textPrimary} size={26} strokeWidth={2.2} />
          </Pressable>

          <View style={styles.topActions}>
            <LabelledControl
              icon={torch ? Zap : ZapOff}
              label={t('scanner.flash')}
              accessibilityLabel={torch ? t('scanner.flashOn') : t('scanner.flashOff')}
              active={torch}
              disabled={!cameraReady}
              onPress={props.onToggleTorch}
            />
            <LabelledControl icon={Lightbulb} label={t('scanner.tips')} onPress={props.onTips} />
          </View>
        </View>

        {/* ---- Headline ---- */}
        <View style={styles.headline}>
          <Text accessibilityRole="header" style={styles.title}>
            {`${t('scanner.headlineLead')} `}
            <Text style={styles.titleAccent}>{t('scanner.headlineAccent')}</Text>
          </Text>
          <Text style={styles.subtitle} accessibilityLiveRegion="polite">
            {cameraReady ? t(`scanner.status.${status}`) : t('scanner.subtitle')}
          </Text>
          {guide ? (
            <View style={styles.guide}>
              <Text style={styles.guideLabel} accessibilityLiveRegion="polite">
                {guide}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ---- Middle: the preview shows through; camera access prompt when needed ---- */}
        <View style={styles.middle}>
          {access === 'checking' ? <ActivityIndicator color={palette.textPrimary} /> : null}
          {access === 'denied' ? (
            <View style={styles.accessCard}>
              <CameraIcon color={palette.frameIcon} size={40} strokeWidth={1.8} />
              <Text style={styles.accessTitle}>{t('scanner.access.title')}</Text>
              <Text style={styles.accessBody}>{t('scanner.access.body')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('scanner.access.action')}
                onPress={props.onGrantAccess}
                style={({ pressed }) => [styles.accessButton, pressed && styles.controlPressed]}
              >
                <Text style={styles.accessButtonLabel}>{t('scanner.access.action')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* ---- Auto Capture / Manual ---- */}
        <View style={styles.segmentTrack} accessibilityRole="radiogroup">
          {CAPTURE_MODES.map((mode) => {
            const selected = mode === captureMode;
            return (
              <Pressable
                key={mode}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => props.onCaptureModeChange(mode)}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                  {t(`scanner.captureModes.${mode}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ---- Gallery / shutter / Multi-Page ---- */}
        <View style={styles.controls}>
          <LabelledControl
            icon={ImageIcon}
            label={t('scanner.gallery')}
            accessibilityLabel={t('scanner.galleryHint')}
            disabled={busy}
            onPress={props.onGallery}
            large
          />

          <ShutterButton
            label={t('scanner.shutter')}
            progress={captureMode === 'auto' ? progress : 0}
            busy={busy}
            disabled={busy || !cameraReady}
            onPress={props.onShutter}
          />

          {showPages ? (
            <LabelledControl
              icon={Files}
              label={t('scanner.done', { count: pageCount })}
              accessibilityLabel={t('scanner.reviewPages', { count: pageCount })}
              active
              badge={pageCount}
              disabled={busy}
              onPress={props.onReview}
              large
            />
          ) : multiPageToggle ? (
            <LabelledControl
              icon={Files}
              label={t('scanner.multiPage')}
              accessibilityLabel={multiPage ? t('scanner.multiPageOn') : t('scanner.multiPageOff')}
              active={multiPage}
              disabled={busy}
              onPress={props.onToggleMultiPage}
              large
            />
          ) : (
            <View style={styles.controlSpacer} />
          )}
        </View>

        {/* ---- AI note ---- */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('scanner.aiTitle')}. ${t('scanner.aiBody')}`}
          accessibilityHint={t('scanner.tipsHint')}
          onPress={props.onTips}
          style={({ pressed }) => [styles.aiCard, pressed && styles.controlPressed]}
        >
          <View style={styles.aiIcon}>
            <FileScan color={palette.textPrimary} size={24} strokeWidth={2} />
          </View>
          <View style={styles.aiDivider} />
          <View style={styles.aiCopy}>
            <Text style={styles.aiTitle}>{t('scanner.aiTitle')}</Text>
            <Text style={styles.aiBody}>{t('scanner.aiBody')}</Text>
          </View>
          <ChevronRight color={palette.textPrimary} size={22} strokeWidth={2.2} />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

type LabelledControlProps = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly accessibilityLabel?: string;
  readonly active?: boolean;
  readonly badge?: number;
  readonly disabled?: boolean;
  readonly large?: boolean;
  readonly onPress: () => void;
};

/** A rounded-square icon button with its label underneath, like Flash and Gallery in the mockup. */
function LabelledControl({
  icon: Icon,
  label,
  accessibilityLabel,
  active = false,
  badge,
  disabled = false,
  large = false,
  onPress,
}: LabelledControlProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.labelledControl, disabled && styles.disabled]}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.controlSquare,
              large && styles.controlSquareLarge,
              active && styles.controlActive,
              pressed && styles.controlPressed,
            ]}
          >
            <Icon color={palette.textPrimary} size={large ? 26 : 24} strokeWidth={2} />
            {badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>{badge}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.controlLabel}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  disabled: {
    opacity: 0.45,
  },
  controlPressed: {
    backgroundColor: palette.controlPressed,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  topActions: {
    flexDirection: 'row',
    gap: 12,
  },
  closeButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    backgroundColor: palette.control,
  },

  labelledControl: {
    alignItems: 'center',
    minWidth: 64,
    maxWidth: 96,
  },
  controlSquare: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    backgroundColor: palette.control,
  },
  controlSquareLarge: {
    width: 60,
    height: 60,
    borderRadius: 18,
  },
  controlActive: {
    borderColor: palette.controlActiveBorder,
    backgroundColor: palette.controlActive,
  },
  controlLabel: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    color: palette.textPrimary,
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.badge,
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.textPrimary,
  },

  headline: {
    alignItems: 'center',
    marginTop: 12,
  },
  title: {
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
    color: palette.textPrimary,
  },
  titleAccent: {
    color: palette.accent,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15.5,
    lineHeight: 22,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  guide: {
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.controlActiveBorder,
    backgroundColor: palette.controlActive,
  },
  guideLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
    color: palette.textPrimary,
  },
  controlSpacer: {
    width: 64,
  },

  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessCard: {
    alignItems: 'center',
    gap: 10,
    maxWidth: 320,
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardSurface,
  },
  accessTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    color: palette.textPrimary,
  },
  accessBody: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  accessButton: {
    marginTop: 6,
    paddingHorizontal: 22,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.segmentActive,
  },
  accessButtonLabel: {
    fontSize: 15.5,
    fontWeight: '700',
    color: palette.textPrimary,
  },

  segmentTrack: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '82%',
    maxWidth: 380,
    height: 50,
    padding: 4,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    backgroundColor: palette.segmentTrack,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  segmentSelected: {
    backgroundColor: palette.segmentActive,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.segmentLabel,
  },
  segmentLabelSelected: {
    fontWeight: '700',
    color: palette.textPrimary,
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 18,
  },

  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardSurface,
  },
  aiIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.cardIconSurface,
  },
  aiDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 14,
    backgroundColor: palette.divider,
  },
  aiCopy: {
    flex: 1,
    marginRight: 8,
  },
  aiTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  aiBody: {
    marginTop: 2,
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
});
