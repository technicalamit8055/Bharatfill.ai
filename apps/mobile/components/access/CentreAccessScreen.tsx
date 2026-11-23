/**
 * Centre access — Profile → Centre access (migration 0042).
 *
 * Every cyber cafe / centre that can use the citizen's saved details right now, with the time
 * left and a Stop button; trusted centres (30 days) marked, with "Trust for 30 days" on a short
 * session and "Renew" in a trusted one's last week; and what ended in the last 30 days.
 *
 * Below them, "Centres that saved your profile" (migration 0046): the centres that created a
 * profile for this number, each with Lock / Unlock. Locked, the centre keeps the citizen in its
 * list and still sees their scheme matches, but cannot open the details until they approve again.
 *
 * Presentational: the route loads the sessions and does Stop / Trust / Lock / Unlock. Names the centre and the
 * purpose only — never the operator, a document or a value from the customer record.
 */

import { StatusBar } from 'expo-status-bar';
import { BadgeCheck, Building2, ChevronLeft, Clock, Lock } from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  endedKey,
  groupCentreAccess,
  liveTrustedCount,
  MAX_TRUSTED_CENTRES,
  timeLeft,
  timeLeftCopy,
  trustActionFor,
} from '../../lib/access/centre-access';
import type { CentreAccess, CentreProfile } from '../../lib/cloud/citizen-api';
import type { CentreAccessState } from '../../lib/cloud/use-centre-access';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { formatVaultDate } from '../../lib/vault/vault-screen';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { profilePalette as palette } from '../profile/palette';

export type CentreAccessBusy =
  | { readonly grantId: string; readonly action: 'stop' | 'trust' }
  | { readonly customerId: string; readonly action: 'lock' | 'unlock' };

export type CentreAccessScreenProps = {
  readonly state: CentreAccessState;
  readonly now: Date;
  readonly busy: CentreAccessBusy | null;
  readonly refreshing: boolean;
  readonly onBack: () => void;
  readonly onRefresh: () => void;
  readonly onStop: (session: CentreAccess) => void;
  readonly onTrust: (session: CentreAccess) => void;
  readonly onLock: (centre: CentreProfile) => void;
  readonly onUnlock: (centre: CentreProfile) => void;
  readonly onSignIn: () => void;
};

export function CentreAccessScreen(props: CentreAccessScreenProps) {
  const { t } = useTranslation();
  const { state, onBack, onRefresh, refreshing } = props;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            state.status === 'ready' ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={palette.brandBlue}
              />
            ) : undefined
          }
        >
          <View style={styles.content}>
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('registration.back')}
                hitSlop={12}
                onPress={onBack}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <ChevronLeft color={palette.headerIcon} size={28} strokeWidth={2.2} />
              </Pressable>
              <Text accessibilityRole="header" style={styles.heading}>
                {t('centreAccess.title')}
              </Text>
            </View>
            <Text style={styles.lead}>{t('centreAccess.lead')}</Text>

            {state.status === 'loading' ? (
              <ActivityIndicator style={styles.spinner} color={palette.brandBlue} />
            ) : null}
            {state.status === 'signed_out' ? <SignedOut {...props} /> : null}
            {state.status === 'error' ? (
              <Text style={styles.error}>{t(state.messageKey)}</Text>
            ) : null}
            {state.status === 'ready' ? (
              <>
                <Sessions {...props} sessions={state.sessions} />
                <SavedProfiles {...props} centres={state.centres} />
              </>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SignedOut({ onSignIn }: CentreAccessScreenProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{t('centreAccess.signedOut')}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onSignIn}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
      >
        <Text style={styles.primaryText}>{t('profile.signIn')}</Text>
      </Pressable>
    </View>
  );
}

function Sessions(props: CentreAccessScreenProps & { readonly sessions: readonly CentreAccess[] }) {
  const { t } = useTranslation();
  const { sessions, now } = props;
  const { live, ended } = groupCentreAccess(sessions, now);
  const trusted = liveTrustedCount(sessions, now);

  return (
    <>
      <View style={styles.trustedLine}>
        <BadgeCheck color={palette.verifiedIcon} size={18} strokeWidth={2.2} />
        <Text style={styles.trustedLineText}>
          {t('centreAccess.trustedCount', { count: trusted, max: MAX_TRUSTED_CENTRES })}
        </Text>
      </View>

      <Text style={styles.section} accessibilityRole="header">
        {t('centreAccess.liveHeading')}
      </Text>
      {live.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('centreAccess.noneLive')}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {live.map((session) => (
            <LiveCard key={session.grantId} {...props} session={session} trustedLive={trusted} />
          ))}
        </View>
      )}

      <Text style={styles.note}>{t('centreAccess.trustNote', { max: MAX_TRUSTED_CENTRES })}</Text>

      {ended.length > 0 ? (
        <>
          <Text style={styles.section} accessibilityRole="header">
            {t('centreAccess.endedHeading')}
          </Text>
          <View style={styles.endedCard}>
            {ended.map((session, index) => (
              <View
                key={session.grantId}
                style={[styles.endedRow, index > 0 && styles.endedDivider]}
              >
                <Text style={styles.endedName} numberOfLines={1}>
                  {session.centreName || t('centreAccess.unknownCentre')}
                </Text>
                <Text style={styles.endedMeta}>
                  {[
                    t(`profileRequest.purposes.${session.purpose}`),
                    t(endedKey(session)),
                    formatVaultDate(new Date(session.endedAt ?? session.expiresAt), t),
                  ].join('  •  ')}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

function SavedProfiles(
  props: CentreAccessScreenProps & { readonly centres: readonly CentreProfile[] },
) {
  const { t } = useTranslation();
  const { centres, busy, onLock, onUnlock } = props;
  if (centres.length === 0) return null;
  const disabled = busy !== null;

  return (
    <>
      <Text style={styles.section} accessibilityRole="header">
        {t('centreAccess.savedHeading')}
      </Text>
      <Text style={styles.sectionLead}>{t('centreAccess.savedLead')}</Text>
      <View style={styles.list}>
        {centres.map((centre) => {
          const name = centre.centreName || t('centreAccess.unknownCentre');
          const mine =
            busy && 'customerId' in busy && busy.customerId === centre.customerId
              ? busy.action
              : null;
          return (
            <View key={centre.customerId} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  {centre.locked ? (
                    <Lock color={palette.logoutText} size={20} strokeWidth={2} />
                  ) : (
                    <Building2 color={palette.brandBlue} size={22} strokeWidth={2} />
                  )}
                </View>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {name}
                  </Text>
                  <Text style={styles.cardBody}>
                    {t(centre.locked ? 'centreAccess.savedLocked' : 'centreAccess.savedOpen')}
                  </Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    centre.locked ? 'centreAccess.unlockLabel' : 'centreAccess.lockLabel',
                    { centre: name },
                  )}
                  accessibilityState={{ disabled }}
                  disabled={disabled}
                  onPress={() => (centre.locked ? onUnlock(centre) : onLock(centre))}
                  style={({ pressed }) => [
                    centre.locked ? styles.trustButton : styles.stopButton,
                    pressed && (centre.locked ? styles.primaryPressed : styles.pressed),
                  ]}
                >
                  {mine ? (
                    <ActivityIndicator
                      color={centre.locked ? palette.onBrand : palette.logoutText}
                    />
                  ) : (
                    <Text style={centre.locked ? styles.primaryText : styles.stopText}>
                      {t(centre.locked ? 'centreAccess.unlock' : 'centreAccess.lock')}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

function LiveCard({
  session,
  trustedLive,
  now,
  busy,
  onStop,
  onTrust,
}: CentreAccessScreenProps & { readonly session: CentreAccess; readonly trustedLive: number }) {
  const { t } = useTranslation();
  const left = timeLeftCopy(timeLeft(session.expiresAt, now));
  const action = trustActionFor(session, trustedLive, now);
  const mine = busy && 'grantId' in busy && busy.grantId === session.grantId ? busy.action : null;
  const disabled = busy !== null;
  const name = session.centreName || t('centreAccess.unknownCentre');

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Building2 color={palette.brandBlue} size={22} strokeWidth={2} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.cardBody}>{t(`profileRequest.purposes.${session.purpose}`)}</Text>
        </View>
        {session.trusted ? (
          <View style={styles.trustedPill}>
            <Text style={styles.trustedPillText}>{t('centreAccess.trustedBadge')}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.timeRow}>
        <Clock color={palette.textSecondary} size={16} strokeWidth={2} />
        <Text style={styles.timeText}>
          {t(left.key, left.values)}
          {'  •  '}
          {t('centreAccess.until', {
            date: formatVaultDate(new Date(session.expiresAt), t),
          })}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('centreAccess.stopLabel', { centre: name })}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => onStop(session)}
          style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
        >
          {mine === 'stop' ? (
            <ActivityIndicator color={palette.logoutText} />
          ) : (
            <Text style={styles.stopText}>{t('centreAccess.stop')}</Text>
          )}
        </Pressable>
        {action ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onTrust(session)}
            style={({ pressed }) => [styles.trustButton, pressed && styles.primaryPressed]}
          >
            {mine === 'trust' ? (
              <ActivityIndicator color={palette.onBrand} />
            ) : (
              <Text style={styles.primaryText}>
                {t(action === 'renew' ? 'centreAccess.renew' : 'centreAccess.trust')}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 32 },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
  },
  pressed: { opacity: 0.6 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, marginLeft: -6 },
  heading: { fontSize: 22, fontWeight: '800', color: palette.heading },
  lead: { marginTop: 16, fontSize: 15, lineHeight: 21, color: palette.textSecondary },
  spinner: { marginTop: 28 },
  error: { marginTop: 20, fontSize: 14, lineHeight: 20, color: palette.logoutText },
  trustedLine: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  trustedLineText: { fontSize: 14, fontWeight: '600', color: palette.textPrimary },
  section: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 15,
    fontWeight: '700',
    color: palette.heading,
  },
  sectionLead: {
    marginTop: -4,
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 19,
    color: palette.textSecondary,
  },
  list: { gap: 12 },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.menuIconSurface,
  },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: 15.5, fontWeight: '700', color: palette.textPrimary },
  cardBody: { marginTop: 2, fontSize: 13, color: palette.textSecondary },
  trustedPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: palette.verifiedSurface,
  },
  trustedPillText: { fontSize: 12, fontWeight: '700', color: palette.verifiedText },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { flex: 1, fontSize: 13, color: palette.textSecondary },
  actions: { flexDirection: 'row', gap: 10 },
  stopButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: palette.logoutBorder,
    backgroundColor: palette.logoutSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopText: { fontSize: 15, fontWeight: '700', color: palette.logoutText },
  trustButton: {
    flex: 1.4,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  primaryButton: {
    height: 50,
    marginTop: 14,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  primaryPressed: { backgroundColor: palette.brandBluePressed },
  primaryText: { fontSize: 15, fontWeight: '700', color: palette.onBrand, textAlign: 'center' },
  emptyCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  emptyText: { fontSize: 14, lineHeight: 20, color: palette.textSecondary },
  note: { marginTop: 14, fontSize: 12.5, lineHeight: 18, color: palette.textSecondary },
  endedCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 16,
  },
  endedRow: { paddingVertical: 12 },
  endedDivider: { borderTopWidth: 1, borderTopColor: palette.divider },
  endedName: { fontSize: 14.5, fontWeight: '600', color: palette.textPrimary },
  endedMeta: { marginTop: 2, fontSize: 12.5, color: palette.textSecondary },
});
