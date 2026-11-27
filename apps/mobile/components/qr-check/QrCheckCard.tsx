/**
 * What a document's QR code proves, as one card: on Save Document while the scan is new, and on
 * Document Details for a saved document. While checking it says so; when the page has no
 * readable code it says that only if the citizen asked (Check QR), otherwise it stays away.
 *
 * The details read from the code (name, date of birth, address) sit behind "Show details", for
 * the citizen to hold against the printed card: a card whose text was edited still carries the
 * original QR. A link opens in the browser only when tapped — the issuer's page is the proof.
 *
 * Presentational: the route runs the check (`lib/scan/qr-scan.ts`) and owns what is stored.
 */

import type { LucideIcon } from 'lucide-react-native';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { QrCheckTone, QrCheckView } from '../../lib/scan/qr-check-view';
import { qrCheckPalette as palette } from './palette';

export type QrCheckCardState =
  /** Not checked yet: offers "Check QR code" when `onCheck` is given, otherwise nothing. */
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  /** The pages were searched and no readable code was found. */
  | { readonly status: 'none' }
  | { readonly status: 'done'; readonly view: QrCheckView; readonly checkedOn?: string };

export type QrCheckCardProps = {
  readonly state: QrCheckCardState;
  readonly onOpenLink?: (url: string) => void;
  /** Offers "Check again" (Document Details). */
  readonly onCheckAgain?: () => void;
  /** Starts a check that did not run by itself. */
  readonly onCheck?: () => void;
};

const TONE_ICONS: Record<QrCheckTone, LucideIcon> = {
  success: ShieldCheck,
  info: Info,
  warning: ShieldAlert,
  neutral: QrCode,
};

export function QrCheckCard({ state, onOpenLink, onCheckAgain, onCheck }: QrCheckCardProps) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  if (state.status === 'idle') {
    if (!onCheck) return null;
    return (
      <View style={[styles.card, toneStyle('neutral')]}>
        <View style={styles.header}>
          <QrCode color={palette.tone.neutral.icon} size={22} strokeWidth={2.1} />
          <Text style={styles.title}>{t('qrCheck.title.idle')}</Text>
        </View>
        <Text style={styles.body}>{t('qrCheck.body.idle')}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onCheck}
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        >
          <ShieldCheck color={palette.brandBlue} size={16} strokeWidth={2.3} />
          <Text style={styles.linkLabel}>{t('qrCheck.check')}</Text>
        </Pressable>
      </View>
    );
  }

  if (state.status === 'checking') {
    return (
      <View
        style={[styles.card, toneStyle('info')]}
        accessibilityLiveRegion="polite"
        accessible
        accessibilityLabel={t('qrCheck.checking')}
      >
        <View style={styles.header}>
          <ActivityIndicator color={palette.tone.info.icon} />
          <Text style={styles.title}>{t('qrCheck.checking')}</Text>
        </View>
      </View>
    );
  }

  if (state.status === 'none') {
    return (
      <View style={[styles.card, toneStyle('neutral')]} accessibilityLiveRegion="polite">
        <View style={styles.header}>
          <QrCode color={palette.tone.neutral.icon} size={22} strokeWidth={2.1} />
          <Text style={styles.title}>{t('qrCheck.title.none')}</Text>
        </View>
        <Text style={styles.body}>{t('qrCheck.body.none')}</Text>
        {onCheckAgain ? <CheckAgain onPress={onCheckAgain} /> : null}
      </View>
    );
  }

  const { view } = state;
  const Icon = TONE_ICONS[view.tone];
  return (
    <View style={[styles.card, toneStyle(view.tone)]} accessibilityLiveRegion="polite">
      <View style={styles.header}>
        <Icon color={palette.tone[view.tone].icon} size={22} strokeWidth={2.1} />
        <Text accessibilityRole="header" style={styles.title}>
          {t(view.titleKey, view.values)}
        </Text>
      </View>
      <Text style={styles.body}>{t(view.bodyKey, view.values)}</Text>
      {state.checkedOn ? (
        <Text style={styles.meta}>{t('qrCheck.checkedOn', { date: state.checkedOn })}</Text>
      ) : null}

      {view.rows.length > 0 ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetails }}
            onPress={() => setShowDetails((on) => !on)}
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          >
            <Text style={styles.linkLabel}>
              {t(showDetails ? 'qrCheck.hideDetails' : 'qrCheck.showDetails')}
            </Text>
            {showDetails ? (
              <ChevronUp color={palette.brandBlue} size={18} strokeWidth={2.3} />
            ) : (
              <ChevronDown color={palette.brandBlue} size={18} strokeWidth={2.3} />
            )}
          </Pressable>
          {showDetails ? (
            <View style={styles.rows}>
              {view.rows.map((row) => (
                <View key={row.labelKey} style={styles.row}>
                  <Text style={styles.rowLabel}>{t(row.labelKey)}</Text>
                  <Text style={styles.rowValue} selectable={false}>
                    {row.value}
                  </Text>
                </View>
              ))}
              <Text style={styles.meta}>{t('qrCheck.detailsNote')}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {view.url && onOpenLink ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => onOpenLink(view.url ?? '')}
          style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
        >
          <ExternalLink color={palette.onBrand} size={18} strokeWidth={2.3} />
          <Text style={styles.openLabel}>{t('qrCheck.openLink', view.values)}</Text>
        </Pressable>
      ) : null}
      {onCheckAgain ? <CheckAgain onPress={onCheckAgain} /> : null}
    </View>
  );
}

function CheckAgain({ onPress }: { readonly onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
    >
      <RefreshCw color={palette.brandBlue} size={16} strokeWidth={2.3} />
      <Text style={styles.linkLabel}>{t('qrCheck.checkAgain')}</Text>
    </Pressable>
  );
}

function toneStyle(tone: QrCheckTone) {
  return { backgroundColor: palette.tone[tone].surface, borderColor: palette.tone[tone].border };
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '700',
    color: palette.heading,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
  meta: {
    fontSize: 12.5,
    lineHeight: 17,
    color: palette.textSecondary,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 36,
  },
  linkLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.brandBlue,
  },
  rows: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.divider,
  },
  row: {
    gap: 2,
  },
  rowLabel: {
    fontSize: 12.5,
    color: palette.textSecondary,
  },
  rowValue: {
    fontSize: 14.5,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    marginTop: 2,
    borderRadius: 22,
    backgroundColor: palette.brandBlue,
  },
  openLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: palette.onBrand,
  },
  pressed: {
    opacity: 0.7,
  },
});
