/**
 * The dark frame at the top of Document Details: every page stacked on white cards, scrolling
 * inside the frame, with a "1 / 2" pill on top and previous / next arrows that jump a page.
 *
 * Each page keeps its own proportions once its image loads (an ID card is wide, a marksheet
 * tall); until then it holds a card-shaped placeholder. Vault pages arrive as in-memory `data:`
 * URIs the route decrypts one by one, so they are never written back to disk.
 */

import { ChevronLeft, ChevronRight, FileWarning } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { visiblePageIndex } from '../../lib/vault/document-details';
import { documentDetailsPalette as palette } from './palette';

export type DocumentPage =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly source: ImageSourcePropType }
  | { readonly kind: 'failed' };

/** Width ÷ height of a page before its image has loaded: an ID card. */
const PLACEHOLDER_ASPECT = 1.52;

/** Where the counter pill sits, and where the first page starts: just below the pill. */
const COUNTER_TOP = 16;
const PAGES_TOP = COUNTER_TOP + 38;
const PAGE_GAP = 18;

export type DocumentPageViewerProps = {
  readonly pages: readonly DocumentPage[];
  /** Width of the frame; its height follows. */
  readonly width: number;
};

export function DocumentPageViewer({ pages, width }: DocumentPageViewerProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const pageTops = useRef<number[]>([]);
  const [aspects, setAspects] = useState<Record<number, number>>({});
  const [current, setCurrent] = useState(0);

  const frameHeight = Math.round(width * 0.8);
  const pageWidth = Math.round(width * 0.76);
  const total = pages.length;
  const paged = total > 1;

  const onScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
      const atEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - 4;
      setCurrent(
        atEnd
          ? total - 1
          : visiblePageIndex(pageTops.current, contentOffset.y, layoutMeasurement.height),
      );
    },
    [total],
  );

  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(total - 1, index));
    scrollRef.current?.scrollTo({
      y: Math.max(0, (pageTops.current[target] ?? 0) - PAGES_TOP),
      animated: true,
    });
    setCurrent(target);
  };

  return (
    <View style={[styles.frame, { height: frameHeight }]}>
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={styles.content}
      >
        {pages.map((page, index) => {
          const label = t('documentDetails.pageLabel', { number: index + 1, total });
          const aspect = aspects[index] ?? PLACEHOLDER_ASPECT;
          return (
            <View
              key={index}
              onLayout={(event) => {
                pageTops.current[index] = event.nativeEvent.layout.y;
              }}
              style={[
                styles.page,
                { width: pageWidth, height: Math.round(pageWidth / aspect) },
                page.kind !== 'ready' && styles.pagePlaceholder,
              ]}
            >
              {page.kind === 'ready' ? (
                <Image
                  source={page.source}
                  style={styles.image}
                  resizeMode="contain"
                  accessibilityLabel={label}
                  accessibilityIgnoresInvertColors
                  onLoad={({ nativeEvent }) => {
                    const { width: w, height: h } = nativeEvent.source;
                    if (w > 0 && h > 0) {
                      setAspects((previous) => ({ ...previous, [index]: w / h }));
                    }
                  }}
                />
              ) : page.kind === 'loading' ? (
                <ActivityIndicator color={palette.onViewer} accessibilityLabel={label} />
              ) : (
                <View style={styles.failed} accessible accessibilityLabel={label}>
                  <FileWarning color={palette.onViewerMuted} size={28} strokeWidth={1.8} />
                  <Text style={styles.failedText}>{t('documentDetails.pageFailed')}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {paged ? (
        <>
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText} accessibilityLiveRegion="polite">
              {t('documentDetails.pageOf', { number: current + 1, total })}
            </Text>
          </View>
          <ArrowButton
            side="left"
            label={t('documentDetails.previousPage')}
            disabled={current === 0}
            onPress={() => goTo(current - 1)}
          />
          <ArrowButton
            side="right"
            label={t('documentDetails.nextPage')}
            disabled={current === total - 1}
            onPress={() => goTo(current + 1)}
          />
        </>
      ) : null}
    </View>
  );
}

function ArrowButton({
  side,
  label,
  disabled,
  onPress,
}: {
  readonly side: 'left' | 'right';
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrow,
        side === 'left' ? styles.arrowLeft : styles.arrowRight,
        disabled && styles.arrowDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Icon color={palette.onViewer} size={24} strokeWidth={2.2} />
    </Pressable>
  );
}

const ARROW_SIZE = 46;

const styles = StyleSheet.create({
  frame: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: palette.viewerFrame,
  },
  content: {
    alignItems: 'center',
    gap: PAGE_GAP,
    paddingTop: PAGES_TOP,
    paddingBottom: 22,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.viewerPage,
  },
  pagePlaceholder: {
    backgroundColor: palette.viewerPagePlaceholder,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  failed: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  failedText: {
    fontSize: 13,
    textAlign: 'center',
    color: palette.onViewerMuted,
  },
  counter: {
    position: 'absolute',
    top: COUNTER_TOP,
    alignSelf: 'center',
    minWidth: 76,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.viewerPillBorder,
    backgroundColor: palette.viewerPill,
  },
  counterText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    color: palette.onViewer,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -ARROW_SIZE / 2,
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.viewerArrowBorder,
    backgroundColor: palette.viewerArrow,
  },
  arrowLeft: {
    left: 12,
  },
  arrowRight: {
    right: 12,
  },
  arrowDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.6,
  },
});
