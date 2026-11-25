/**
 * What the scanner route shows in place of the in-app camera when Google's document scanner is
 * used (`lib/scan/platform-scanner.ts`): behind the scanner while it opens, and after the
 * citizen backs out of it with pages already taken — scan more, review them, switch to the
 * in-app camera, or close (which offers to discard the pages).
 *
 * For a passport photo it is where the citizen chooses the phone's camera app or the gallery.
 *
 * Presentational only: the route owns the scanner and the session.
 */

import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, CircleUserRound, FileScan } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { scannerPalette as palette } from './palette';

export type ScanLauncherKind = 'document' | 'idCard' | 'photo';

const COPY: Readonly<Record<ScanLauncherKind, { title: string; body: string; scan: string }>> = {
  document: {
    title: 'scanner.platform.title',
    body: 'scanner.platform.body',
    scan: 'scanner.platform.scan',
  },
  idCard: {
    title: 'scanner.platform.idCard.title',
    body: 'scanner.platform.idCard.body',
    scan: 'scanner.platform.scan',
  },
  photo: {
    title: 'scanner.platform.photo.title',
    body: 'scanner.platform.photo.body',
    scan: 'scanner.platform.photo.take',
  },
};

export type PlatformScanLauncherProps = {
  readonly kind: ScanLauncherKind;
  /** The scanner, or the camera app, is opening or open. */
  readonly busy: boolean;
  readonly pageCount: number;
  /** No room for another page: only review is offered. */
  readonly full: boolean;
  readonly onScan: () => void;
  readonly onGallery: (() => void) | null;
  readonly onReview: () => void;
  readonly onUseCamera: (() => void) | null;
  readonly onClose: () => void;
};

export function PlatformScanLauncher(props: PlatformScanLauncherProps) {
  const { t } = useTranslation();
  const { busy, full, kind, onGallery, onUseCamera, pageCount } = props;
  const copy = COPY[kind];
  const Icon = kind === 'photo' ? CircleUserRound : FileScan;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scanner.close')}
            hitSlop={4}
            onPress={props.onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <ChevronLeft color={palette.textPrimary} size={26} strokeWidth={2.2} />
          </Pressable>
        </View>

        <View style={styles.middle}>
          <View style={styles.card}>
            <Icon color={palette.frameIcon} size={44} strokeWidth={1.8} />
            <Text accessibilityRole="header" style={styles.title}>
              {t(copy.title)}
            </Text>
            <Text style={styles.body}>{t(copy.body)}</Text>

            {busy ? (
              <View style={styles.opening} accessibilityLiveRegion="polite">
                <ActivityIndicator color={palette.textPrimary} />
                <Text style={styles.body}>{t('scanner.platform.opening')}</Text>
              </View>
            ) : (
              <View style={styles.actions}>
                {full ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(copy.scan)}
                    onPress={props.onScan}
                    style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  >
                    <Text style={styles.primaryLabel}>{t(copy.scan)}</Text>
                  </Pressable>
                )}
                {onGallery && !full ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('scanner.platform.photo.gallery')}
                    onPress={onGallery}
                    style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryLabel}>{t('scanner.platform.photo.gallery')}</Text>
                  </Pressable>
                ) : null}
                {pageCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('scanner.reviewPages', { count: pageCount })}
                    onPress={props.onReview}
                    style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryLabel}>
                      {t('scanner.reviewPages', { count: pageCount })}
                    </Text>
                  </Pressable>
                ) : null}
                {onUseCamera && !full ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('scanner.platform.useCamera')}
                    onPress={onUseCamera}
                    style={({ pressed }) => [styles.link, pressed && styles.pressed]}
                  >
                    <Text style={styles.linkLabel}>{t('scanner.platform.useCamera')}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
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
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    paddingTop: 8,
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
  pressed: {
    opacity: 0.75,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.cardSurface,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: palette.textPrimary,
  },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  opening: {
    marginTop: 8,
    alignItems: 'center',
    gap: 10,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: 8,
    gap: 12,
  },
  primary: {
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.segmentActive,
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  secondary: {
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.controlBorder,
    backgroundColor: palette.control,
  },
  secondaryLabel: {
    fontSize: 15.5,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: 6,
  },
  linkLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.frameIcon,
    textDecorationLine: 'underline',
  },
});
