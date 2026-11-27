/**
 * Family — `/family`, from Profile or the switcher's "Add". One row per person, the citizen
 * first: how many documents they have and whether any have expired or expire within 30 days.
 * Tapping a row opens that person's documents; the row's menu renames, changes the relation or
 * removes a member. A note says plainly that family documents stay on this phone.
 *
 * Light-only branded artwork like the Vault tab. The route (`app/family.tsx`) owns the vault,
 * the sheets and the confirmations; this only draws.
 */

import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, EllipsisVertical, Smartphone, UserPlus } from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type FamilyRow, memberInitials } from '../../lib/family/family';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { familyPalette as palette } from './palette';

export type FamilyScreenState =
  | { readonly status: 'loading' | 'error' }
  | { readonly status: 'ready'; readonly rows: readonly FamilyRow[]; readonly canAdd: boolean };

export type FamilyScreenProps = {
  readonly state: FamilyScreenState;
  readonly onBack: () => void;
  readonly onAdd: () => void;
  readonly onOpen: (value: string) => void;
  readonly onActions: (value: string) => void;
};

export function FamilyScreen({ state, onBack, onAdd, onOpen, onActions }: FamilyScreenProps) {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family.back')}
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <ChevronLeft color={palette.heading} size={30} strokeWidth={2.2} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          {t('family.title')}
        </Text>
      </View>

      {state.status !== 'ready' ? (
        <View style={styles.status}>
          {state.status === 'loading' ? (
            <ActivityIndicator color={palette.brandBlue} accessibilityLabel={t('common.loading')} />
          ) : (
            <Text style={styles.statusText}>{t('family.unreadable')}</Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>{t('family.intro')}</Text>

          <View style={styles.card}>
            {state.rows.map((row, index) => (
              <View key={row.value}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <MemberRow
                  row={row}
                  onOpen={() => onOpen(row.value)}
                  onActions={() => onActions(row.value)}
                />
              </View>
            ))}
          </View>

          {state.canAdd ? (
            <Pressable
              accessibilityRole="button"
              onPress={onAdd}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <UserPlus color={palette.onBrand} size={22} strokeWidth={2.2} />
              <Text style={styles.addLabel}>{t('family.add')}</Text>
            </Pressable>
          ) : (
            <Text style={styles.full}>{t('family.full')}</Text>
          )}

          <View style={styles.note}>
            <Smartphone color={palette.noteText} size={22} strokeWidth={2} />
            <Text style={styles.noteText}>{t('family.phoneOnlyNote')}</Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MemberRow({
  row,
  onOpen,
  onActions,
}: {
  readonly row: FamilyRow;
  readonly onOpen: () => void;
  readonly onActions: () => void;
}) {
  const { t } = useTranslation();
  const count =
    row.documentCount === 0
      ? t('family.count.none')
      : row.documentCount === 1
        ? t('family.count.one')
        : t('family.count.other', { count: row.documentCount });

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: row.selected }}
        accessibilityHint={t('family.openHint')}
        onPress={onOpen}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
      >
        <View style={[styles.avatar, row.selected && styles.avatarSelected]}>
          <Text style={[styles.initials, row.selected && styles.initialsSelected]}>
            {memberInitials(row.label)}
          </Text>
        </View>
        <View style={styles.rowText}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {row.label}
            {row.selected ? <Text style={styles.showing}>{`  ${t('family.showing')}`}</Text> : null}
          </Text>
          <Text numberOfLines={1} style={styles.rowSubtitle}>
            {row.relation ? `${row.relation} · ${count}` : count}
          </Text>
          {row.alert.expired > 0 ? (
            <Text style={[styles.badge, styles.badgeDanger]}>
              {t('family.alert.expired', { count: row.alert.expired })}
            </Text>
          ) : null}
          {row.alert.soon > 0 ? (
            <Text style={[styles.badge, styles.badgeWarning]}>
              {t('family.alert.soon', { count: row.alert.soon })}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {row.editable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family.actions.label', { name: row.label })}
          hitSlop={8}
          onPress={onActions}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
        >
          <EllipsisVertical color={palette.textSecondary} size={22} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const AVATAR = 46;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: PAGE_PADDING - 6,
    paddingVertical: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: palette.heading,
  },
  pressed: {
    opacity: 0.6,
  },
  status: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: PAGE_PADDING,
  },
  statusText: {
    fontSize: 16,
    color: palette.textSecondary,
    textAlign: 'center',
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
    paddingBottom: 32,
    gap: 16,
  },
  intro: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    shadowColor: palette.cardShadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16 + AVATAR + 12,
    backgroundColor: palette.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 16,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.avatarSurface,
  },
  avatarSelected: {
    backgroundColor: palette.brandBlue,
  },
  initials: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.avatarText,
  },
  initialsSelected: {
    color: palette.onBrand,
  },
  rowText: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 3,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  showing: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.brandBlue,
  },
  rowSubtitle: {
    fontSize: 14,
    color: palette.textMuted,
  },
  badge: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: '600',
  },
  badgeDanger: {
    backgroundColor: palette.dangerSurface,
    color: palette.dangerText,
  },
  badgeWarning: {
    backgroundColor: palette.warningSurface,
    color: palette.warningText,
  },
  menuButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  addButton: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: palette.brandBlue,
  },
  addLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.onBrand,
  },
  full: {
    fontSize: 14,
    color: palette.textMuted,
    textAlign: 'center',
  },
  note: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: palette.noteSurface,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: palette.noteText,
  },
});
