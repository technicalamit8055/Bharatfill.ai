/**
 * A card of checklist rows: what the document is, and whether it is in the vault. The state is
 * written out as well as coloured.
 */

import { Check, ChevronRight, CircleHelp, Clock, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DocumentChecklistItem, DocumentChecklistState } from '../../lib/checklist/checklist';
import { checklistItemLabel } from '../../lib/checklist/use-checklist-actions';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { categoryOf } from '../../lib/vault/categories';
import type { ArtIconName } from '../art-icon/art-icons.generated';
import { ArtIcon } from '../art-icon/ArtIcon';
import { artIconTint } from '../art-icon/tint';
import { homePalette as palette } from '../home/palette';

const STATE_STYLE: Readonly<
  Record<DocumentChecklistState, { icon: typeof Check; color: string; surface: string }>
> = {
  ready: { icon: Check, color: palette.readyText, surface: palette.readySurface },
  missing: { icon: Plus, color: palette.brandBluePressed, surface: palette.avatarSurface },
  expired: { icon: Clock, color: palette.warningText, surface: palette.warningSurface },
  check_manually: {
    icon: CircleHelp,
    color: palette.textSecondary,
    surface: palette.thumbnailSurface,
  },
};

function iconFor(item: DocumentChecklistItem): ArtIconName {
  if (item.type === 'photo' || item.type === 'signature') return item.type;
  const category = item.type ? categoryOf(item.type) : null;
  if (category === 'identity') return 'id_card';
  return category ?? 'document';
}

export type ChecklistRowsProps = {
  readonly items: readonly DocumentChecklistItem[];
  readonly onItem: (item: DocumentChecklistItem) => void;
};

export function ChecklistRows({ items, onItem }: ChecklistRowsProps) {
  const { t, locale } = useTranslation();

  return (
    <View style={styles.card}>
      {items.map((item, index) => {
        const label = checklistItemLabel(item, t, locale);
        const state = t(`checklist.states.${item.state}`);
        const { icon: StateIcon, color, surface } = STATE_STYLE[item.state];
        const icon = iconFor(item);
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${state}`}
            accessibilityHint={t(
              item.state === 'ready' ? 'checklist.openHint' : 'checklist.addHint',
            )}
            onPress={() => onItem(item)}
            style={({ pressed }) => [
              styles.row,
              index > 0 && styles.divided,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.badge, { backgroundColor: artIconTint(icon) }]}>
              <ArtIcon name={icon} size={26} />
            </View>
            <View style={styles.text}>
              <Text style={styles.label}>{label}</Text>
              <View style={[styles.state, { backgroundColor: surface }]}>
                <StateIcon color={color} size={13} strokeWidth={2.6} />
                <Text style={[styles.stateText, { color }]}>{state}</Text>
              </View>
            </View>
            <ChevronRight color={palette.textMuted} size={18} strokeWidth={2.2} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  pressed: {
    opacity: 0.6,
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: palette.textPrimary,
  },
  state: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  stateText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
});
