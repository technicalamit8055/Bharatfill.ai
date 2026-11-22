/**
 * "Allow access to your documents?" — the sheet a centre's vault request (design §4.2, Mode B)
 * raises over whichever tab is open. The citizen sees which centre is asking, picks how long
 * (30 minutes or 2 hours), may let the centre keep a copy (off by default, D14), and taps
 * Approve or Deny. After Approve, the confirmation offers Stop.
 *
 * Mounted once, in the tab shell. Shows nothing in offline builds, when signed out, or when no
 * request is open. Names the centre only — never a document.
 */

import { FolderLock } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nextProfileRequest, requestMinutesLeft } from '../../lib/access/profile-requests';
import type { VaultGrantMinutes } from '../../lib/cloud/citizen-api';
import { citizenApi, currentDeviceId } from '../../lib/cloud/session';
import { useVaultAccess } from '../../lib/cloud/use-vault-access';
import { showDialog } from '../../lib/dialog/dialog-store';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { dialogPalette as palette } from '../dialog/palette';

const DURATIONS: readonly VaultGrantMinutes[] = [30, 120];
const DEFAULT_DURATION: VaultGrantMinutes = 120;

export function VaultRequestHost() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { requests, refresh } = useVaultAccess();

  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => new Date());
  const [minutes, setMinutes] = useState<VaultGrantMinutes>(DEFAULT_DURATION);
  const [allowCopy, setAllowCopy] = useState(false);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const request = useMemo(
    () => nextProfileRequest(requests, answered, now),
    [requests, answered, now],
  );

  // A fresh choice for every new request; the countdown ticks while one is showing.
  useEffect(() => {
    setMinutes(DEFAULT_DURATION);
    setAllowCopy(false);
    setErrorKey(null);
  }, [request?.id]);
  useEffect(() => {
    if (!request) return;
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, [request]);

  const markAnswered = useCallback(
    (id: string) => setAnswered((previous) => new Set(previous).add(id)),
    [],
  );

  const stop = useCallback(
    async (grantId: string, centre: string) => {
      const api = citizenApi();
      if (!api) return;
      const result = await api.revokeVaultGrant(grantId);
      refresh();
      showDialog(
        t(result.ok ? 'vaultRequest.stoppedTitle' : 'common.errorTitle'),
        result.ok ? t('vaultRequest.stoppedBody', { centre }) : t(result.error.messageKey),
        [{ text: t('common.ok') }],
        { tone: result.ok ? 'info' : 'warning' },
      );
    },
    [refresh, t],
  );

  const decide = useCallback(
    async (decision: 'approve' | 'deny') => {
      const api = citizenApi();
      if (!request || !api || busy) return;
      setBusy(decision);
      setErrorKey(null);

      let result;
      if (decision === 'approve') {
        const deviceId = await currentDeviceId();
        if (!deviceId) {
          setBusy(null);
          setErrorKey('errors.vault.device_unknown');
          return;
        }
        result = await api.approveVaultRequest(request.id, deviceId, {
          durationMinutes: minutes,
          allowCopy,
        });
      } else {
        result = await api.denyVaultRequest(request.id);
      }
      setBusy(null);

      if (!result.ok) {
        if (result.error.status === 404) {
          // The request ended (expired, or answered on another phone): close and say so.
          markAnswered(request.id);
          showDialog(
            t('common.errorTitle'),
            t(result.error.messageKey),
            [{ text: t('common.ok') }],
            { tone: 'warning' },
          );
        } else {
          setErrorKey(result.error.messageKey);
        }
        refresh();
        return;
      }

      markAnswered(request.id);
      refresh();
      const centre = request.centreName;
      if (result.value) {
        const grant = result.value;
        showDialog(
          t('vaultRequest.approvedTitle'),
          t('vaultRequest.approvedBody', { centre, minutes: grant.minutesLeft }),
          [
            {
              text: t('vaultRequest.stop'),
              style: 'destructive',
              onPress: () => void stop(grant.id, centre),
            },
            { text: t('common.ok') },
          ],
          { tone: 'success' },
        );
      } else {
        showDialog(
          t('vaultRequest.deniedTitle'),
          t('vaultRequest.deniedBody', { centre }),
          [{ text: t('common.ok') }],
          { tone: 'info' },
        );
      }
    },
    [allowCopy, busy, markAnswered, minutes, refresh, request, stop, t],
  );

  if (!request) return null;
  const left = requestMinutesLeft(request.expiresAt, now);

  return (
    <Modal transparent animationType="slide" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View
          style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}
          accessibilityViewIsModal
        >
          <View style={styles.badge}>
            <FolderLock color={palette.tones.brand.icon} size={26} strokeWidth={2.2} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('vaultRequest.title')}
          </Text>
          <Text style={styles.body}>{t('vaultRequest.body', { centre: request.centreName })}</Text>

          <Text style={styles.label}>{t('vaultRequest.durationLabel')}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {DURATIONS.map((option) => {
              const selected = option === minutes;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: busy !== null }}
                  disabled={busy !== null}
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
            <View style={styles.copyText}>
              <Text style={styles.copyTitle}>{t('vaultRequest.copyTitle')}</Text>
              <Text style={styles.muted}>{t('vaultRequest.copyBody')}</Text>
            </View>
            <Switch
              value={allowCopy}
              onValueChange={setAllowCopy}
              disabled={busy !== null}
              accessibilityLabel={t('vaultRequest.copyTitle')}
              trackColor={{ true: palette.primary, false: palette.divider }}
            />
          </View>

          <Text style={styles.warning}>{t('vaultRequest.warning')}</Text>
          {left > 0 ? (
            <Text style={styles.muted}>{t('profileRequest.expiresIn', { minutes: left })}</Text>
          ) : null}
          {errorKey ? <Text style={styles.error}>{t(errorKey)}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={() => void decide('deny')}
              style={({ pressed }) => [
                styles.button,
                styles.secondary,
                pressed && styles.secondaryPressed,
              ]}
            >
              {busy === 'deny' ? (
                <ActivityIndicator color={palette.onSecondary} />
              ) : (
                <Text style={styles.secondaryText}>{t('vaultRequest.deny')}</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={() => void decide('approve')}
              style={({ pressed }) => [
                styles.button,
                styles.primary,
                pressed && styles.primaryPressed,
              ]}
            >
              {busy === 'approve' ? (
                <ActivityIndicator color={palette.onPrimary} />
              ) : (
                <Text style={styles.primaryText}>{t('vaultRequest.approve')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.backdrop },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 10,
  },
  badge: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.tones.brand.disc,
  },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center', color: palette.heading },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: palette.body },
  label: { fontSize: 13, fontWeight: '600', color: palette.muted },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.divider,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
  },
  chipSelected: { borderColor: palette.primary, backgroundColor: palette.tones.brand.halo },
  chipText: { fontSize: 15, fontWeight: '600', color: palette.body },
  chipTextSelected: { color: palette.primary },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: palette.secondary,
  },
  copyText: { flex: 1, gap: 2 },
  copyTitle: { fontSize: 15, fontWeight: '600', color: palette.heading },
  warning: { fontSize: 13, lineHeight: 19, color: palette.tones.warning.icon },
  muted: { fontSize: 13, lineHeight: 18, color: palette.muted },
  error: { fontSize: 13, color: palette.danger },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primary: { flex: 1.6, backgroundColor: palette.primary },
  primaryPressed: { backgroundColor: palette.primaryPressed },
  primaryText: { fontSize: 16, fontWeight: '700', color: palette.onPrimary },
  secondary: { backgroundColor: palette.secondary },
  secondaryPressed: { backgroundColor: palette.secondaryPressed },
  secondaryText: { fontSize: 16, fontWeight: '600', color: palette.onSecondary },
  pressed: { opacity: 0.7 },
});
