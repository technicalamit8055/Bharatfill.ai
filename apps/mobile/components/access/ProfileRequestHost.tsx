/**
 * "Allow access to your details?" — the sheet a centre's request (migration 0039) raises over
 * whichever tab is open. The citizen sees which centre is asking and why, picks how long the
 * centre may use their saved details (1, 2 or 4 hours, or 30 days to trust a centre they visit
 * often — migration 0042), and taps Approve or Deny.
 *
 * Mounted once, in the tab shell. Shows nothing in offline builds, when signed out, or when no
 * request is open. Names the centre and the purpose only — never a document.
 */

import { ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DEFAULT_PROFILE_ACCESS_MINUTES,
  durationKey,
  nextProfileRequest,
  PROFILE_ACCESS_OPTIONS,
  requestMinutesLeft,
  TRUSTED_ACCESS_MINUTES,
} from '../../lib/access/profile-requests';
import { MAX_TRUSTED_CENTRES } from '../../lib/access/centre-access';
import type { ProfileAccessMinutes } from '../../lib/cloud/citizen-api';
import { citizenApi } from '../../lib/cloud/session';
import { useProfileRequests } from '../../lib/cloud/use-profile-requests';
import { showDialog } from '../../lib/dialog/dialog-store';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { dialogPalette as palette } from '../dialog/palette';

export function ProfileRequestHost() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { requests, refresh } = useProfileRequests();

  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const [now, setNow] = useState(() => new Date());
  const [minutes, setMinutes] = useState<ProfileAccessMinutes>(DEFAULT_PROFILE_ACCESS_MINUTES);
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const request = useMemo(
    () => nextProfileRequest(requests, answered, now),
    [requests, answered, now],
  );

  // A fresh choice for every new request; the countdown ticks while one is showing.
  useEffect(() => {
    setMinutes(DEFAULT_PROFILE_ACCESS_MINUTES);
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

  const decide = useCallback(
    async (decision: 'approve' | 'deny') => {
      const api = citizenApi();
      if (!request || !api || busy) return;
      setBusy(decision);
      setErrorKey(null);
      const result =
        decision === 'approve'
          ? await api.approveProfileRequest(request.id, minutes)
          : await api.denyProfileRequest(request.id);
      setBusy(null);

      if (!result.ok) {
        if (result.error.status === 404) {
          // The request ended (expired, cancelled, answered on another phone): close and say so.
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
      if (decision === 'approve') {
        showDialog(
          t('profileRequest.approvedTitle'),
          minutes === TRUSTED_ACCESS_MINUTES
            ? t('profileRequest.approvedTrustedBody', { centre })
            : t('profileRequest.approvedBody', { centre, duration: t(durationKey(minutes)) }),
          [{ text: t('common.ok') }],
          { tone: 'success' },
        );
      } else {
        showDialog(
          t('profileRequest.deniedTitle'),
          t('profileRequest.deniedBody', { centre }),
          [{ text: t('common.ok') }],
          { tone: 'info' },
        );
      }
    },
    [busy, markAnswered, minutes, refresh, request, t],
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
            <ShieldCheck color={palette.tones.brand.icon} size={26} strokeWidth={2.2} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {t('profileRequest.title')}
          </Text>
          <Text style={styles.body}>
            {t('profileRequest.body', { centre: request.centreName })}
          </Text>

          <View style={styles.purpose}>
            <Text style={styles.label}>{t('profileRequest.purposeLabel')}</Text>
            <Text style={styles.purposeValue}>
              {t(`profileRequest.purposes.${request.purpose}`)}
            </Text>
          </View>

          <Text style={styles.label}>{t('profileRequest.durationLabel')}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {PROFILE_ACCESS_OPTIONS.map((option) => {
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
                    {t(durationKey(option))}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {minutes === TRUSTED_ACCESS_MINUTES ? (
            <Text style={styles.trustedNote}>
              {t('profileRequest.trustedNote', { max: MAX_TRUSTED_CENTRES })}
            </Text>
          ) : null}
          <Text style={styles.warning}>{t('profileRequest.warning')}</Text>
          {left > 0 ? (
            <Text style={styles.muted}>{t('profileRequest.expiresIn', { minutes: left })}</Text>
          ) : null}
          {errorKey ? (
            <Text style={styles.error}>{t(errorKey, { max: MAX_TRUSTED_CENTRES })}</Text>
          ) : null}

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
                <Text style={styles.secondaryText}>{t('profileRequest.deny')}</Text>
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
                <Text style={styles.primaryText}>
                  {t('profileRequest.approve', { duration: t(durationKey(minutes)) })}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: palette.backdrop,
  },
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
  title: {
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
    color: palette.heading,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    color: palette.body,
  },
  purpose: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: palette.secondary,
    gap: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.muted,
  },
  purposeValue: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.heading,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
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
  chipSelected: {
    borderColor: palette.primary,
    backgroundColor: palette.tones.brand.halo,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.body,
  },
  chipTextSelected: {
    color: palette.primary,
  },
  trustedNote: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.body,
  },
  warning: {
    fontSize: 13,
    lineHeight: 19,
    color: palette.tones.warning.icon,
  },
  muted: {
    fontSize: 13,
    color: palette.muted,
  },
  error: {
    fontSize: 13,
    color: palette.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primary: {
    flex: 1.6,
    backgroundColor: palette.primary,
  },
  primaryPressed: {
    backgroundColor: palette.primaryPressed,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.onPrimary,
  },
  secondary: {
    backgroundColor: palette.secondary,
  },
  secondaryPressed: {
    backgroundColor: palette.secondaryPressed,
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.onSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
});
