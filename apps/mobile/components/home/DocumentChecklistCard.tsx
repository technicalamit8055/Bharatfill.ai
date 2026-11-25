/**
 * The everyday documents on Home: how many are in the vault, a chip for each (tap to open or
 * add), and the way to the full checklist and the per-form ones.
 */

import { Check, ChevronRight, Clock, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { checklistProgress, type DocumentChecklistItem } from '../../lib/checklist/checklist';
import { checklistItemLabel } from '../../lib/checklist/use-checklist-actions';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { ChecklistProgressBar } from '../checklist/ChecklistProgressBar';
import { homePalette as palette } from './palette';

export type DocumentChecklistCardProps = {
  readonly items: readonly DocumentChecklistItem[];
  readonly onItem: (item: DocumentChecklistItem) => void;
  readonly onOpen: () => void;
};

export function DocumentChecklistCard({ items, onItem, onOpen }: DocumentChecklistCardProps) {
  const { t, locale } = useTranslation();
  const progress = checklistProgress(items);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('checklist.title')}
        </Text>
        <Text style={styles.progress}>{t('checklist.progress', progress)}</Text>
      </View>
      <ChecklistProgressBar {...progress} />

      <View style={styles.chips}>
        {items.map((item) => {
          const label = checklistItemLabel(item, t, locale);
          const ready = item.state === 'ready';
          const expired = item.state === 'expired';
          const Icon = ready ? Check : expired ? Clock : Plus;
          const color = ready
            ? palette.readyText
            : expired
              ? palette.warningText
              : palette.brandBluePressed;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${t(`checklist.states.${item.state}`)}`}
              accessibilityHint={t(ready ? 'checklist.openHint' : 'checklist.addHint')}
              hitSlop={4}
              onPress={() => onItem(item)}
              style={({ pressed }) => [
                styles.chip,
                ready && styles.chipReady,
                expired && styles.chipExpired,
                pressed && styles.pressed,
              ]}
            >
              <Icon color={color} size={15} strokeWidth={2.6} />
              <Text style={[styles.chipLabel, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('checklist.openAll')}
        hitSlop={8}
        onPress={onOpen}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Text style={styles.linkLabel}>{t('checklist.openAll')}</Text>
        <ChevronRight color={palette.brandBlue} size={17} strokeWidth={2.4} />
      </Pressable>
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
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  progress: {
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '700',
    color: palette.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: palette.avatarSurface,
  },
  chipReady: {
    backgroundColor: palette.readySurface,
  },
  chipExpired: {
    backgroundColor: palette.warningSurface,
  },
  chipLabel: {
    flexShrink: 1,
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '700',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkLabel: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: palette.brandBlue,
  },
  pressed: {
    opacity: 0.6,
  },
});
