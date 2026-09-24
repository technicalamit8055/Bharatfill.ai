/**
 * Scan result — shown right after a scan is sealed into the vault. Pages are decrypted one at a
 * time into memory for display; nothing is written back to disk in the clear.
 *
 * Follows the app theme, like the Vault and Profile tabs.
 */

import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageLoadEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { status, useTheme } from '../../theme';

export type ScanResultState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly pages: readonly (string | null)[] }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'unreadable' };

export type ScanResultScreenProps = {
  readonly state: ScanResultState;
  readonly onDone: () => void;
  readonly onScanAnother: () => void;
  readonly onDelete: () => void;
};

export function ScanResultScreen({
  state,
  onDone,
  onScanAnother,
  onDelete,
}: ScanResultScreenProps) {
  const { colors, presets } = useTheme();
  const { t } = useTranslation();

  const pageCount = state.kind === 'ready' ? state.pages.length : 0;

  return (
    <SafeAreaView style={presets.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: status.successSurface }]}>
          <ShieldCheck color={status.success} size={24} strokeWidth={2.2} />
        </View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={presets.sectionHeader}>
            {t('scanResult.title')}
          </Text>
          <Text style={presets.textSecondary}>{t('scanResult.subtitle')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.pages}>
        {state.kind === 'loading' ? (
          <View style={presets.emptyState}>
            <ActivityIndicator color={colors.primary} />
            <Text style={presets.textSecondary}>{t('scanResult.loading')}</Text>
          </View>
        ) : null}

        {state.kind === 'notFound' || state.kind === 'unreadable' ? (
          <View style={presets.emptyState}>
            <Text style={[presets.textSecondary, styles.centered]}>
              {t(`scanResult.${state.kind}`)}
            </Text>
          </View>
        ) : null}

        {state.kind === 'ready'
          ? state.pages.map((uri, index) => (
              <View key={index} style={styles.page}>
                <Text style={presets.textMuted}>
                  {t('scanResult.pageLabel', { number: index + 1, total: pageCount })}
                </Text>
                {uri ? (
                  <PageImage
                    uri={uri}
                    label={t('scanResult.pageLabel', { number: index + 1, total: pageCount })}
                  />
                ) : (
                  <View style={[styles.pagePlaceholder, { backgroundColor: colors.surfaceSunken }]}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
              </View>
            ))
          : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scanResult.done')}
          onPress={onDone}
          style={({ pressed }) => [
            presets.primaryButton,
            pressed && { backgroundColor: colors.primaryPressed },
          ]}
        >
          <Text style={presets.primaryButtonLabel}>{t('scanResult.done')}</Text>
        </Pressable>
        <View style={styles.secondaryRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scanResult.scanAnother')}
            onPress={onScanAnother}
            style={[presets.secondaryButton, styles.secondaryButton]}
          >
            <Text style={presets.secondaryButtonLabel}>{t('scanResult.scanAnother')}</Text>
          </Pressable>
          {state.kind === 'ready' || state.kind === 'unreadable' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('scanResult.delete')}
              onPress={onDelete}
              style={[presets.secondaryButton, styles.secondaryButton]}
            >
              <Text style={[presets.secondaryButtonLabel, { color: status.danger }]}>
                {t('scanResult.delete')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

/** A page at its own aspect ratio, which is only known once the image has loaded. */
function PageImage({ uri, label }: { readonly uri: string; readonly label: string }) {
  const { colors } = useTheme();
  const [aspectRatio, setAspectRatio] = useState(0.72);

  const onLoad = (event: ImageLoadEvent) => {
    const { width, height } = event.nativeEvent.source;
    if (width > 0 && height > 0) setAspectRatio(width / height);
  };

  return (
    <Image
      source={{ uri }}
      onLoad={onLoad}
      resizeMode="contain"
      accessibilityLabel={label}
      accessibilityIgnoresInvertColors
      style={[styles.pageImage, { aspectRatio, backgroundColor: colors.surfaceSunken }]}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
  },
  centered: {
    textAlign: 'center',
  },
  pages: {
    flexGrow: 1,
    gap: 18,
    padding: 16,
  },
  page: {
    gap: 6,
  },
  pageImage: {
    width: '100%',
    borderRadius: 10,
  },
  pagePlaceholder: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
  },
});
