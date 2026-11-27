/**
 * "Coming up" on Home: the documents whose date is close — "Bike PUC · Expires in 7 days",
 * "Income Certificate · Expires in 30 days · Renew now", "Electricity Bill · Due tomorrow ·
 * Pay now". Tapping a row opens the document; Renew / Pay opens the nearby-centre finder.
 *
 * Names are shown here, inside the app behind its lock, never in the notification itself.
 * Presentational: the route decides which documents are listed and what each tap does.
 */

import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { UpcomingDocument } from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { upcomingMessage } from '../../lib/vault/everyday';
import { documentIcon } from '../vault/everydayIcons';
import { homePalette as palette } from './palette';

export type UpcomingRemindersCardProps = {
  readonly items: readonly UpcomingDocument[];
  readonly onOpen: (item: UpcomingDocument) => void;
  readonly onAction: (item: UpcomingDocument) => void;
};

export function UpcomingRemindersCard({ items, onOpen, onAction }: UpcomingRemindersCardProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View>
        <Text accessibilityRole="header" style={styles.title}>
          {t('reminders.title')}
        </Text>
        <Text style={styles.subtitle}>{t('reminders.subtitle')}</Text>
      </View>

      {items.map((item) => {
        const Icon = documentIcon(item.documentType, item.everydayKind);
        const message = upcomingMessage(item);
        const when = t(message.key, message.values);
        const urgent = item.state !== 'soon';
        const tone = urgent ? palette.warningText : palette.brandBluePressed;
        return (
          <View key={item.id} style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${when}`}
              accessibilityHint={t('reminders.openHint')}
              onPress={() => onOpen(item)}
              style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
            >
              <View style={[styles.badge, urgent && styles.badgeUrgent]}>
                <Icon color={tone} size={20} strokeWidth={2.2} />
              </View>
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={[styles.rowWhen, { color: tone }]}>
                  {when}
                </Text>
              </View>
              {item.action === null ? (
                <ChevronRight color={palette.textMuted} size={18} strokeWidth={2.4} />
              ) : null}
            </Pressable>
            {item.action !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t(`reminders.actions.${item.action}`)}, ${item.title}`}
                accessibilityHint={t(`reminders.actionHints.${item.action}`)}
                hitSlop={6}
                onPress={() => onAction(item)}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.actionLabel}>
                  {t(`reminders.actions.${item.action}`)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  title: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.avatarSurface,
  },
  badgeUrgent: {
    backgroundColor: palette.warningSurface,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  rowWhen: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '600',
  },
  action: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: palette.brandBlue,
  },
  actionLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: palette.onBrand,
  },
  pressed: {
    opacity: 0.6,
  },
});
