/**
 * Scan review — after the shot: "Page 2 of 2", the page already cropped, straightened and
 * cleaned up on a dark stage with its corners marked (tap it, or the zoom button, to pinch-zoom
 * it full screen), four filter cards that each preview the page in that filter, the page strip,
 * Crop / Delete Page / Add Page, and Retake beside Save Document.
 *
 * Crop swaps the stage for the crop editor on the original photo: drag the corners, turn the
 * page a quarter left or right, straighten it on the dial, then Reset or Done. Back cancels.
 *
 * When the photo behind the page on screen looks blurred, too dark or glared
 * (`lib/scan/photo-quality.ts`), a warning under the stage offers Retake, or Keep to dismiss it.
 * A preset can name the pages (an ID card's Front and Back) and narrow the filters (a passport
 * photo keeps its own look, so it shows none).
 *
 * Presentational apart from the zoom viewer's state: `app/scan-review.tsx` owns the capture
 * session, the crop in progress and navigation. Light branded artwork like Save Document, which it leads to, so it
 * does not read from `useTheme()`.
 */

import { StatusBar } from 'expo-status-bar';
import {
  ArrowRight,
  Blend,
  Camera,
  ChevronLeft,
  Contrast,
  Crop,
  Image as ImageIcon,
  type LucideIcon,
  RotateCcw,
  RotateCcwSquare,
  RotateCwSquare,
  SquarePlus,
  Trash2,
  TriangleAlert,
  Undo2,
  WandSparkles,
  ZoomIn,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { SessionPage } from '../../lib/scan/capture-session';
import type { PageFilter } from '../../lib/scan/filters';
import { fitContain, type PageRotation, type Quad, type Size } from '../../lib/scan/geometry';
import type { QualityIssue } from '../../lib/scan/photo-quality';
import { CropEditor } from './CropEditor';
import { PageZoomViewer } from './PageZoomViewer';
import { scanReviewPalette as palette } from './palette';
import { StraightenDial } from './StraightenDial';

const FILTER_ICONS: Readonly<Record<PageFilter, LucideIcon>> = {
  magic: WandSparkles,
  original: ImageIcon,
  grayscale: Blend,
  blackWhite: Contrast,
};

/** The crop in progress, not yet applied to the page. */
export type CropDraft = {
  /** The crop, in upright photo pixels. */
  readonly quad: Quad;
  readonly rotation: PageRotation;
  /** Straighten dial, in degrees clockwise. */
  readonly straighten: number;
};

export type ScanReviewScreenProps = {
  readonly pages: readonly SessionPage[];
  readonly currentId: string | null;
  /** Non-null while the crop editor is open. */
  readonly crop: CropDraft | null;
  readonly canAddPage: boolean;
  /** The filters the scan's preset offers; the row is hidden when there is only one. */
  readonly filters: readonly PageFilter[];
  /** Names for the pages in order (an ID card's sides), instead of numbering them. */
  readonly pageNames: readonly string[] | null;
  /** What is wrong with the current page's photo; empty when nothing, or once kept. */
  readonly qualityIssues: readonly QualityIssue[];
  readonly onDismissQuality: () => void;
  readonly onSelectPage: (id: string) => void;
  readonly onFilter: (filter: PageFilter) => void;
  readonly onStartCrop: () => void;
  readonly onCropChange: (quad: Quad) => void;
  readonly onStraighten: (degrees: number) => void;
  readonly onRotateLeft: () => void;
  readonly onRotateRight: () => void;
  readonly onFinishCrop: () => void;
  readonly onCancelCrop: () => void;
  readonly onResetCrop: () => void;
  readonly onRetake: () => void;
  readonly onDeletePage: () => void;
  readonly onRetry: () => void;
  readonly onAddPage: () => void;
  readonly onSave: () => void;
  readonly onBack: () => void;
};

export function ScanReviewScreen(props: ScanReviewScreenProps) {
  const { t } = useTranslation();
  const { pages, currentId, crop } = props;
  const cropping = crop !== null;
  const [zooming, setZooming] = useState(false);

  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === currentId),
  );
  const page = pages[index];
  const nameOf = (i: number): string | null => props.pageNames?.[i] ?? null;
  const issue = props.qualityIssues[0];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {/* Fills the screen, the stage taking what is left; scrolls only on a phone too short for
          everything. Never while cropping, so dragging a corner is not taken for a scroll. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.column}
        scrollEnabled={!cropping}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Header ---- */}
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cropping ? t('scanReview.cropCancel') : t('scanReview.back')}
            hitSlop={6}
            onPress={cropping ? props.onCancelCrop : props.onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <ChevronLeft color={palette.backIcon} size={28} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.headerText}>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
              {cropping
                ? t('scanReview.cropTitle')
                : (nameOf(index) ??
                  t('scanReview.pageOf', { number: index + 1, total: pages.length }))}
            </Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {cropping ? t('scanReview.cropHint') : t('scanReview.subtitle')}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {/* ---- Stage ---- */}
        <View style={styles.stage}>
          {page && crop && page.analysis ? (
            <CropEditor
              photoUri={page.photoUri}
              photoSize={page.analysis.size}
              quad={crop.quad}
              rotation={crop.rotation}
              straighten={crop.straighten}
              cornerLabels={[
                t('scanReview.corners.topLeft'),
                t('scanReview.corners.topRight'),
                t('scanReview.corners.bottomRight'),
                t('scanReview.corners.bottomLeft'),
              ]}
              onChange={props.onCropChange}
            />
          ) : null}

          {page && !cropping ? (
            <PagePreview page={page} onRetry={props.onRetry} onZoom={() => setZooming(true)} />
          ) : null}
        </View>

        {crop ? (
          <>
            {/* ---- Turn and straighten ---- */}
            <View style={styles.cropTools}>
              <ToolButton
                icon={RotateCcwSquare}
                label={t('scanReview.rotateLeft')}
                onPress={props.onRotateLeft}
              />
              <StraightenDial
                value={crop.straighten}
                label={t('scanReview.straighten')}
                resetLabel={t('scanReview.straightenReset')}
                onChange={props.onStraighten}
              />
              <ToolButton
                icon={RotateCwSquare}
                label={t('scanReview.rotateRight')}
                onPress={props.onRotateRight}
              />
            </View>

            <View style={styles.cropFooter}>
              <Pressable
                accessibilityRole="button"
                onPress={props.onResetCrop}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Undo2 color={palette.brandBlue} size={20} strokeWidth={2.2} />
                <Text style={styles.secondaryLabel}>{t('scanReview.cropReset')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('scanReview.cropDone')}
                onPress={props.onFinishCrop}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.cropDone,
                  pressed && styles.primaryPressed,
                ]}
              >
                <Text style={styles.primaryLabel}>{t('scanReview.cropApply')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            {/* ---- Photo quality ---- */}
            {issue && page?.status === 'ready' ? (
              <View style={styles.warning} accessibilityRole="alert">
                <TriangleAlert color={palette.warningIcon} size={22} strokeWidth={2.2} />
                <Text style={styles.warningText}>{t(`scanReview.quality.${issue}`)}</Text>
                <View style={styles.warningActions}>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={6}
                    onPress={props.onRetake}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Text style={styles.warningAction}>{t('scanReview.retake')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint={t('scanReview.quality.keepHint')}
                    hitSlop={6}
                    onPress={props.onDismissQuality}
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Text style={styles.warningAction}>{t('scanReview.quality.keep')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* ---- Filters ---- */}
            {props.filters.length > 1 ? (
              <View style={styles.filters} accessibilityRole="radiogroup">
                {props.filters.map((filter) => (
                  <FilterCard
                    key={filter}
                    filter={filter}
                    label={t(`scanner.filters.${filter}`)}
                    preview={page?.previews?.[filter] ?? null}
                    selected={page?.filter === filter}
                    disabled={!page}
                    onPress={() => props.onFilter(filter)}
                  />
                ))}
              </View>
            ) : null}

            {/* ---- Pages ---- */}
            <View style={styles.strip}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stripContent}
              >
                {pages.map((each, i) => (
                  <PageThumbnail
                    key={each.id}
                    page={each}
                    number={i + 1}
                    label={nameOf(i) ?? t('scanReview.pageLabel', { number: i + 1 })}
                    accessibilityLabel={
                      nameOf(i) ??
                      t('scanReview.pageOf', {
                        number: i + 1,
                        total: pages.length,
                      })
                    }
                    selected={each.id === page?.id}
                    onPress={() => props.onSelectPage(each.id)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* ---- Actions ---- */}
            <View style={styles.actions}>
              <ActionButton
                icon={Crop}
                label={t('scanReview.crop')}
                disabled={!page?.analysis}
                onPress={props.onStartCrop}
              />
              <ActionButton
                icon={Trash2}
                label={t('scanReview.deletePage')}
                destructive
                disabled={!page}
                onPress={props.onDeletePage}
              />
              <ActionButton
                icon={SquarePlus}
                label={t('scanReview.addPage')}
                disabled={!props.canAddPage}
                onPress={props.onAddPage}
              />
            </View>

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !page }}
                disabled={!page}
                onPress={props.onRetake}
                style={({ pressed }) => [
                  styles.outlineButton,
                  styles.retake,
                  !page && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Camera color={palette.brandBlue} size={24} strokeWidth={2.1} />
                <Text numberOfLines={1} style={styles.outlineLabel}>
                  {t('scanReview.retake')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: pages.length === 0 }}
                disabled={pages.length === 0}
                onPress={props.onSave}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.save,
                  pressed && styles.primaryPressed,
                ]}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[styles.primaryLabel, styles.saveLabel]}
                >
                  {t('scanReview.save')}
                </Text>
                <ArrowRight color={palette.onBrand} size={24} strokeWidth={2.4} />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      {zooming && page?.rendered && !cropping ? (
        <PageZoomViewer
          uri={page.rendered.uri}
          size={page.rendered}
          label={t('scanReview.previewLabel')}
          onClose={() => setZooming(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ---- Stage ------------------------------------------------------------------------------------

const DOT_SIZE = 20;

function PagePreview({
  page,
  onRetry,
  onZoom,
}: {
  readonly page: SessionPage;
  readonly onRetry: () => void;
  readonly onZoom: () => void;
}) {
  const { t } = useTranslation();
  const [box, setBox] = useState<Size | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox({ width, height });
  };

  if (page.status === 'failed') {
    return (
      <View style={styles.centered}>
        <Text style={styles.stageMessage}>{t('scanReview.failed')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [styles.stageButton, pressed && styles.pressed]}
        >
          <RotateCcw color={palette.onStage} size={18} strokeWidth={2.2} />
          <Text style={styles.stageButtonLabel}>{t('scanReview.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const rendered = page.rendered;
  // The page's rectangle inside the stage, with room around it for the corner dots.
  const inset = DOT_SIZE;
  const fit =
    box && rendered
      ? fitContain(
          { width: box.width - inset * 2, height: box.height - inset * 2 },
          { width: rendered.width, height: rendered.height },
        )
      : null;
  const rect =
    fit && rendered
      ? {
          left: inset + fit.dx,
          top: inset + fit.dy,
          width: rendered.width * fit.scale,
          height: rendered.height * fit.scale,
        }
      : null;

  return (
    <View style={styles.preview} onLayout={onLayout}>
      {rendered && rect ? (
        <>
          {/* Tapping the page opens it full screen to pinch-zoom. */}
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t('scanReview.previewLabel')}
            accessibilityHint={t('scanReview.zoom')}
            onPress={onZoom}
            style={[styles.pageImage, rect]}
          >
            <Image
              source={{ uri: rendered.uri }}
              resizeMode="stretch"
              accessibilityIgnoresInvertColors
              style={styles.fill}
            />
          </Pressable>
          <View pointerEvents="none" style={[styles.pageOutline, rect]} />
          {[
            [rect.left, rect.top],
            [rect.left + rect.width, rect.top],
            [rect.left + rect.width, rect.top + rect.height],
            [rect.left, rect.top + rect.height],
          ].map(([x, y], corner) => (
            <View
              key={corner}
              pointerEvents="none"
              style={[
                styles.cornerDot,
                { left: (x ?? 0) - DOT_SIZE / 2, top: (y ?? 0) - DOT_SIZE / 2 },
              ]}
            />
          ))}
        </>
      ) : null}

      {page.status !== 'ready' ? (
        <View style={[styles.centered, rendered && styles.stageVeil]}>
          <ActivityIndicator color={palette.onStage} size="large" />
          <Text style={styles.stageMessage}>{t('scanReview.processing')}</Text>
        </View>
      ) : null}

      {page.status === 'ready' && page.analysis && !page.analysis.detected ? (
        <View style={styles.notice}>
          <Text style={styles.noticeLabel}>{t('scanReview.notDetected')}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('scanReview.zoom')}
        accessibilityState={{ disabled: !rendered }}
        disabled={!rendered}
        hitSlop={6}
        onPress={onZoom}
        style={({ pressed }) => [
          styles.zoomButton,
          !rendered && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <ZoomIn color={palette.onStage} size={26} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

// ---- Filters and pages -----------------------------------------------------------------------

function FilterCard({
  filter,
  label,
  preview,
  selected,
  disabled,
  onPress,
}: {
  readonly filter: PageFilter;
  readonly label: string;
  readonly preview: string | null;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const Icon = FILTER_ICONS[filter];
  const tint = selected ? palette.brandBlue : palette.filterIcon;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterCard,
        selected && styles.filterCardSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.filterWell}>
        {preview ? (
          <Image
            source={{ uri: preview }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={styles.fill}
          />
        ) : (
          <ActivityIndicator color={palette.filterIcon} size="small" />
        )}
      </View>
      <Icon color={tint} size={20} strokeWidth={2} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.filterLabel, selected && styles.filterLabelSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PageThumbnail({
  page,
  number,
  label,
  accessibilityLabel,
  selected,
  onPress,
}: {
  readonly page: SessionPage;
  readonly number: number;
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.thumbColumn, pressed && styles.pressed]}
    >
      <View style={[styles.thumb, selected && styles.thumbSelected]}>
        {page.rendered ? (
          <Image
            source={{ uri: page.rendered.uri }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            style={styles.fill}
          />
        ) : (
          <ActivityIndicator color={palette.filterIcon} size="small" />
        )}
        <View style={[styles.badge, selected && styles.badgeSelected]}>
          <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>{number}</Text>
        </View>
      </View>
      <Text style={[styles.thumbLabel, selected && styles.thumbLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  icon: Icon,
  label,
  destructive = false,
  disabled = false,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.actionCircle, destructive && styles.deleteCircle]}>
        <Icon
          color={destructive ? palette.deleteIcon : palette.actionIcon}
          size={24}
          strokeWidth={2.1}
        />
      </View>
      <Text numberOfLines={1} style={styles.actionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Rotate left / right beside the straighten dial. */
function ToolButton({
  icon: Icon,
  label,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
    >
      <View style={styles.actionCircle}>
        <Icon color={palette.actionIcon} size={24} strokeWidth={2.1} />
      </View>
    </Pressable>
  );
}

// ---- Styles -----------------------------------------------------------------------------------

const ACTION_CIRCLE = 54;
const THUMB_WIDTH = 68;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  column: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.4,
  },
  fill: {
    width: '100%',
    height: '100%',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backButton,
  },
  headerText: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerSpacer: {
    width: 50,
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
    color: palette.heading,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14.5,
    color: palette.subtitle,
  },

  stage: {
    flex: 1,
    minHeight: 220,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: palette.stage,
  },
  preview: {
    flex: 1,
  },
  pageImage: {
    position: 'absolute',
  },
  pageOutline: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: palette.pageOutline,
  },
  cornerDot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 2.5,
    borderColor: palette.cornerDotBorder,
    backgroundColor: palette.cornerDot,
  },
  zoomButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.zoomButton,
  },
  centered: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stageVeil: {
    backgroundColor: palette.stageVeil,
  },
  stageMessage: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    color: palette.onStageMuted,
  },
  stageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: palette.zoomButton,
  },
  stageButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.onStage,
  },
  notice: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: palette.notice,
  },
  noticeLabel: {
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    color: palette.onStage,
  },

  warning: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.warningBorder,
    backgroundColor: palette.warningSurface,
  },
  warningText: {
    flex: 1,
    minWidth: 180,
    fontSize: 14,
    lineHeight: 19,
    color: palette.warningText,
  },
  warningActions: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: 18,
  },
  warningAction: {
    fontSize: 14.5,
    fontWeight: '700',
    color: palette.brandBlue,
  },

  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  filterCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    paddingBottom: 9,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: palette.filterCardBorder,
    backgroundColor: palette.filterCard,
  },
  filterCardSelected: {
    borderWidth: 1.6,
    borderColor: palette.filterSelectedBorder,
    backgroundColor: palette.filterSelected,
  },
  filterWell: {
    width: '100%',
    aspectRatio: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.filterWell,
  },
  filterLabel: {
    fontSize: 13.5,
    fontWeight: '500',
    color: palette.filterLabel,
  },
  filterLabelSelected: {
    fontWeight: '700',
    color: palette.brandBlue,
  },

  strip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.stripBorder,
    backgroundColor: palette.stripSurface,
  },
  stripContent: {
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  thumbColumn: {
    alignItems: 'center',
    gap: 6,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_WIDTH * 1.05,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.thumbSurface,
  },
  thumbSelected: {
    borderColor: palette.thumbSelectedBorder,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.badge,
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  badgeSelected: {
    backgroundColor: palette.badgeSelected,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.badgeText,
  },
  badgeTextSelected: {
    color: palette.onBadgeSelected,
  },
  thumbLabel: {
    fontSize: 13.5,
    color: palette.pageLabel,
  },
  thumbLabelSelected: {
    fontWeight: '600',
    color: palette.pageLabelSelected,
  },

  actions: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  actionCircle: {
    width: ACTION_CIRCLE,
    height: ACTION_CIRCLE,
    borderRadius: ACTION_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: palette.actionCircleBorder,
    backgroundColor: palette.actionCircle,
    shadowColor: palette.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  deleteCircle: {
    backgroundColor: palette.deleteCircle,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.textPrimary,
  },

  footer: {
    flexDirection: 'row',
    gap: 12,
  },
  retake: {
    flex: 1,
  },
  save: {
    flex: 1.12,
    paddingHorizontal: 14,
  },
  saveLabel: {
    flexShrink: 1,
  },
  outlineButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: palette.brandBlue,
    backgroundColor: palette.surface,
  },
  outlineLabel: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    color: palette.brandBlue,
  },
  primaryButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 29,
    backgroundColor: palette.brandBlue,
  },
  primaryPressed: {
    backgroundColor: palette.brandBluePressed,
  },
  primaryLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.onBrand,
  },
  cropTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  toolButton: {
    alignItems: 'center',
  },
  cropFooter: {
    flexDirection: 'row',
    gap: 12,
  },
  cropDone: {
    flex: 1,
  },
  secondaryButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    borderRadius: 29,
    borderWidth: 1.2,
    borderColor: palette.filterSelectedBorder,
    backgroundColor: palette.filterSelected,
  },
  secondaryLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.brandBlue,
  },
});
