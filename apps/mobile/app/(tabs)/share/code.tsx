/**
 * Share with centre — `/share/code`, opened from Connect → Share Document in cloud builds
 * (design §4.2, Mode C).
 *
 * The citizen picks how long the centre may look (30 minutes or 2 hours) and whether it may keep
 * a copy (off, D14), then taps Show code: six digits, good for 5 minutes and one use, to read out
 * to the operator in front of them. Below, every centre that can open the documents right now,
 * each with Stop. The code is shown, never stored or logged.
 */

import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, ShieldAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { connectPalette as palette } from '../../../components/connect/palette';
import {
  formatCountdown,
  formatShareCode,
  shareCodeSecondsLeft,
} from '../../../lib/access/share-code';
import type { VaultGrantMinutes } from '../../../lib/cloud/citizen-api';
import { citizenApi, currentDeviceId } from '../../../lib/cloud/session';
import { serverMessageKey } from '../../../lib/cloud/sign-in-flow';
import { useVaultAccess } from '../../../lib/cloud/use-vault-access';
import { showDialog } from '../../../lib/dialog/dialog-store';
import { useTranslation } from '../../../lib/i18n/I18nProvider';

const DURATIONS: readonly VaultGrantMinutes[] = [30, 120];

export default function ShareCodeRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const { liveGrants, refresh } = useVaultAccess();

  const [minutes, setMinutes] = useState<VaultGrantMinutes>(120);
  const [allowCopy, setAllowCopy] = useState(false);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Leaving the screen hides the code; coming back needs a fresh one.
  useFocusEffect(useCallback(() => () => setIssued(null), []));

  useEffect(() => {
    if (!issued) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [issued]);

  const left = issued ? shareCodeSecondsLeft(issued.expiresAt, now) : 0;

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/share');
  }, [router]);

  const showCode = useCallback(async () => {
    const api = citizenApi();
    if (!api || busy) return;
    setBusy(true);
    setErrorKey(null);
    const deviceId = await currentDeviceId();
    if (!deviceId) {
      setBusy(false);
      setErrorKey('shareCode.signInFirst');
      return;
    }
    const result = await api.issueShareCode(deviceId, { durationMinutes: minutes, allowCopy });
    setBusy(false);
    if (!result.ok) {
      setErrorKey(serverMessageKey(result.error.messageKey, (key) => t(key) !== key));
      return;
    }
    setNow(new Date());
    setIssued(result.value);
  }, [allowCopy, busy, minutes, t]);

  const stop = useCallback(
    async (grantId: string, centre: string) => {
      const api = citizenApi();
      if (!api) return;
      const result = await api.revokeVaultGrant(grantId);
      refresh();
      if (result.ok) {
        showDialog(
          t('vaultRequest.stoppedTitle'),
          t('vaultRequest.stoppedBody', { centre }),
          [{ text: t('common.ok') }],
          { tone: 'info' },
        );
      }
    },
    [refresh, t],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('registration.back')}
              hitSlop={12}
              onPress={back}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <ChevronLeft color={palette.headerIcon} size={26} strokeWidth={2.2} />
            </Pressable>
            <Text style={styles.heading} accessibilityRole="header">
              {t('shareCode.title')}
            </Text>
          </View>

          <Text style={styles.subtitle}>{t('shareCode.subtitle')}</Text>

          {issued && left > 0 ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>{t('shareCode.codeLabel')}</Text>
              <Text
                style={styles.code}
                accessibilityLabel={issued.code.split('').join(' ')}
                selectable={false}
              >
                {formatShareCode(issued.code)}
              </Text>
              <Text style={styles.countdown}>
                {t('shareCode.expiresIn', { time: formatCountdown(left) })}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>{t('vaultRequest.durationLabel')}</Text>
              <View style={styles.chips} accessibilityRole="radiogroup">
                {DURATIONS.map((option) => {
                  const selected = option === minutes;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setMinutes(option)}
                      style={({ pressed }) => [
                        styles.chip,
                        selected && styles.chipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {t(`vaultRequest.duration.${option}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.copyRow}>
                <View style={styles.flex}>
                  <Text style={styles.copyTitle}>{t('vaultRequest.copyTitle')}</Text>
                  <Text style={styles.muted}>{t('vaultRequest.copyBody')}</Text>
                </View>
                <Switch
                  value={allowCopy}
                  onValueChange={setAllowCopy}
                  accessibilityLabel={t('vaultRequest.copyTitle')}
                  trackColor={{ true: palette.brandBlue, false: palette.border }}
                />
              </View>

              {issued ? <Text style={styles.muted}>{t('shareCode.expired')}</Text> : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={() => void showCode()}
                style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
              >
                {busy ? (
                  <ActivityIndicator color={palette.onBrand} />
                ) : (
                  <Text style={styles.ctaLabel}>
                    {t(issued ? 'shareCode.newCode' : 'shareCode.show')}
                  </Text>
                )}
              </Pressable>
            </>
          )}

          {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}

          <View style={styles.warning}>
            <ShieldAlert color={palette.status.closedText} size={20} strokeWidth={2.1} />
            <Text style={styles.warningText}>{t('shareCode.warning')}</Text>
          </View>

          {liveGrants.length > 0 ? (
            <View style={styles.grants}>
              <Text style={styles.label}>{t('shareCode.openNow')}</Text>
              {liveGrants.map((grant) => (
                <View key={grant.id} style={styles.grantRow}>
                  <View style={styles.flex}>
                    <Text style={styles.copyTitle}>{grant.centreName}</Text>
                    <Text style={styles.muted}>
                      {t('shareCode.minutesLeft', { minutes: grant.minutesLeft })}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('vaultRequest.stop')} ${grant.centreName}`}
                    onPress={() => void stop(grant.id, grant.centreName)}
                    style={({ pressed }) => [styles.stop, pressed && styles.pressed]}
                  >
                    <Text style={styles.stopLabel}>{t('vaultRequest.stop')}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  flex: { flex: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  pressed: { opacity: 0.6 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.headerButton,
  },
  heading: { fontSize: 22, fontWeight: '800', color: palette.heading },
  subtitle: { fontSize: 14.5, lineHeight: 21, color: palette.textSecondary },
  label: { fontSize: 13, fontWeight: '600', color: palette.textMuted },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  chipSelected: { borderColor: palette.brandBlue, backgroundColor: palette.serviceChip.background },
  chipText: { fontSize: 15, fontWeight: '600', color: palette.textPrimary },
  chipTextSelected: { color: palette.brandBlue },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  copyTitle: { fontSize: 15, fontWeight: '600', color: palette.textPrimary },
  muted: { fontSize: 13, lineHeight: 18, color: palette.textSecondary },
  cta: {
    minHeight: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  ctaPressed: { backgroundColor: palette.brandBluePressed },
  ctaLabel: { fontSize: 16.5, fontWeight: '700', color: palette.onBrand },
  codeCard: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 24,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  codeLabel: { fontSize: 13, fontWeight: '600', color: palette.textMuted },
  code: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 6,
    color: palette.heading,
    fontVariant: ['tabular-nums'],
  },
  countdown: { fontSize: 14, color: palette.textSecondary, fontVariant: ['tabular-nums'] },
  error: { fontSize: 13, color: palette.status.closedText },
  warning: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.surface,
  },
  warningText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: palette.textPrimary },
  grants: { gap: 8 },
  grantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  stop: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: palette.mutedButton.background,
  },
  stopLabel: { fontSize: 14, fontWeight: '700', color: palette.status.closedText },
});
