/**
 * Scan review — after the shot, like vFlat: the page already cropped, straightened and cleaned
 * up, a row of filters, Crop to fix the corners by hand, thumbnails for a multi-page scan, and
 * Retake / Add page / Save.
 *
 * Presentational only: `app/scan-review.tsx` owns the capture session and navigation.
 */

import { StatusBar } from 'expo-status-bar';
import { Check, Crop, Plus, RotateCcw, Trash2, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { SessionPage } from '../../lib/scan/capture-session';
import { PAGE_FILTERS, type PageFilter } from '../../lib/scan/document-vision';
import type { Quad } from '../../lib/scan/geometry';
import { CropEditor } from './CropEditor';
import { scannerPalette as palette } from './palette';

export type ScanReviewScreenProps = {
  readonly pages: readonly SessionPage[];
  readonly currentId: string | null;
  readonly cropping: boolean;
  readonly canAddPage: boolean;
  readonly onSelectPage: (id: string) => void;
  readonly onFilter: (filter: PageFilter) => void;
  readonly onStartCrop: () => void;
  readonly onCropChange: (quad: Quad) => void;
  readonly onFinishCrop: () => void;
  readonly onResetCrop: () => void;
  readonly onRetake: () => void;
  readonly onDeletePage: () => void;
  readonly onRetry: () => void;
  readonly onAddPage: () => void;
  readonly onSave: () => void;
  readonly onClose: () => void;
};

export function ScanReviewScreen(props: ScanReviewScreenProps) {
  const { t } = useTranslation();
  const { pages, currentId, cropping } = props;

  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === currentId),
  );
  const page = pages[index];
  const multi = pages.length > 1;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* ---- Top bar ---- */}
        <View style={styles.topBar}>
          <IconButton icon={X} label={t('scanReview.close')} onPress={props.onClose} />
          <Text accessibilityRole="header" style={styles.title}>
            {cropping
              ? t('scanReview.cropTitle')
              : t('scanReview.pageOf', { number: index + 1, total: pages.length })}
          </Text>
          {cropping ? (
            <IconButton
              icon={Check}
              label={t('scanReview.cropDone')}
              onPress={props.onFinishCrop}
            />
          ) : (
            <View style={styles.iconButtonSpacer} />
          )}
        </View>

        {/* ---- Page ---- */}
        <View style={styles.stage}>
          {page && cropping && page.analysis && page.quad ? (
            <CropEditor
              photoUri={page.photoUri}
              photoSize={page.analysis.size}
              quad={page.quad}
              cornerLabels={[
                t('scanReview.corners.topLeft'),
                t('scanReview.corners.topRight'),
                t('scanReview.corners.bottomRight'),
                t('scanReview.corners.bottomLeft'),
              ]}
              onChange={props.onCropChange}
            />
          ) : null}

          {page && !cropping ? <PagePreview page={page} onRetry={props.onRetry} /> : null}
        </View>

        {cropping ? (
          <View style={styles.cropActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scanReview.cropReset')}
              onPress={props.onResetCrop}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
            >
              <RotateCcw color={palette.textPrimary} size={18} strokeWidth={2.2} />
              <Text style={styles.textButtonLabel}>{t('scanReview.cropReset')}</Text>
            </Pressable>
            <Text style={styles.cropHint}>{t('scanReview.cropHint')}</Text>
          </View>
        ) : (
          <>
            {/* ---- Filters ---- */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
              accessibilityRole="radiogroup"
            >
              {PAGE_FILTERS.map((filter) => {
                const selected = page?.filter === filter;
                return (
                  <Pressable
                    key={filter}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: !page }}
                    disabled={!page}
                    onPress={() => props.onFilter(filter)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                      {t(`scanner.filters.${filter}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ---- Pages ---- */}
            {multi ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbnails}
              >
                {pages.map((p, i) => {
                  const selected = p.id === page?.id;
                  const label = t('scanReview.pageOf', { number: i + 1, total: pages.length });
                  return (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      accessibilityState={{ selected }}
                      onPress={() => props.onSelectPage(p.id)}
                      style={[styles.thumbnail, selected && styles.thumbnailSelected]}
                    >
                      {p.rendered ? (
                        <Image
                          source={{ uri: p.rendered.uri }}
                          resizeMode="cover"
                          accessibilityIgnoresInvertColors
                          style={styles.thumbnailImage}
                        />
                      ) : (
                        <ActivityIndicator color={palette.textPrimary} />
                      )}
                      <Text style={styles.thumbnailNumber}>{i + 1}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* ---- Actions ---- */}
            <View style={styles.actions}>
              <ActionButton
                icon={Crop}
                label={t('scanReview.crop')}
                disabled={!page?.analysis}
                onPress={props.onStartCrop}
              />
              {multi ? (
                <ActionButton
                  icon={Trash2}
                  label={t('scanReview.deletePage')}
                  onPress={props.onDeletePage}
                />
              ) : (
                <ActionButton
                  icon={RotateCcw}
                  label={t('scanReview.retake')}
                  onPress={props.onRetake}
                />
              )}
              <ActionButton
                icon={Plus}
                label={t('scanReview.addPage')}
                disabled={!props.canAddPage}
                onPress={props.onAddPage}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scanReview.save', { count: pages.length })}
              accessibilityState={{ disabled: pages.length === 0 }}
              disabled={pages.length === 0}
              onPress={props.onSave}
              style={({ pressed }) => [styles.save, pressed && styles.savePressed]}
            >
              <Text style={styles.saveLabel}>{t('scanReview.save', { count: pages.length })}</Text>
            </Pressable>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

function PagePreview({
  page,
  onRetry,
}: {
  readonly page: SessionPage;
  readonly onRetry: () => void;
}) {
  const { t } = useTranslation();

  if (page.status === 'failed') {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>{t('scanReview.failed')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scanReview.retry')}
          onPress={onRetry}
          style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
        >
          <RotateCcw color={palette.textPrimary} size={18} strokeWidth={2.2} />
          <Text style={styles.textButtonLabel}>{t('scanReview.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.preview}>
      {page.rendered ? (
        <Image
          source={{ uri: page.rendered.uri }}
          resizeMode="contain"
          accessibilityLabel={t('scanReview.previewLabel')}
          accessibilityIgnoresInvertColors
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {page.status !== 'ready' ? (
        <View style={[styles.centered, page.rendered && styles.busyVeil]}>
          <ActivityIndicator color={palette.textPrimary} size="large" />
          <Text style={styles.message}>{t('scanReview.processing')}</Text>
        </View>
      ) : null}
      {page.status === 'ready' && page.analysis && !page.analysis.detected ? (
        <View style={styles.notice}>
          <Text style={styles.noticeLabel}>{t('scanReview.notDetected')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function IconButton({
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
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Icon color={palette.textPrimary} size={24} strokeWidth={2.2} />
    </Pressable>
  );
}

function ActionButton({
  icon: Icon,
  label,
  disabled = false,
  onPress,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
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
      <Icon color={palette.textPrimary} size={22} strokeWidth={2} />
      <Text numberOfLines={1} style={styles.actionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 16,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.4,
  },
  centered: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  busyVeil: {
    backgroundColor: palette.overlay,
  },
  message: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    color: palette.textSecondary,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 10,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    backgroundColor: palette.control,
  },
  iconButtonSpacer: {
    width: 46,
  },

  stage: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: palette.reviewSurface,
  },
  preview: {
    flex: 1,
  },
  notice: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: palette.overlay,
  },
  noticeLabel: {
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    color: palette.textPrimary,
  },

  cropActions: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  cropHint: {
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    backgroundColor: palette.control,
  },
  textButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textPrimary,
  },

  filters: {
    gap: 8,
    paddingVertical: 12,
  },
  chip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.chip,
  },
  chipSelected: {
    backgroundColor: palette.chipSelected,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.segmentLabel,
  },
  chipLabelSelected: {
    fontWeight: '700',
    color: palette.textPrimary,
  },

  thumbnails: {
    gap: 10,
    paddingBottom: 10,
  },
  thumbnail: {
    width: 52,
    height: 68,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: palette.reviewSurface,
  },
  thumbnailSelected: {
    borderColor: palette.accent,
  },
  thumbnailImage: {
    ...StyleSheet.absoluteFill,
  },
  thumbnailNumber: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    fontSize: 11,
    fontWeight: '700',
    color: palette.textPrimary,
  },

  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  action: {
    alignItems: 'center',
    gap: 4,
    minWidth: 72,
    paddingVertical: 6,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.textPrimary,
  },

  save: {
    height: 54,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.segmentActive,
  },
  savePressed: {
    opacity: 0.85,
  },
  saveLabel: {
    fontSize: 16.5,
    fontWeight: '700',
    color: palette.textPrimary,
  },
});
