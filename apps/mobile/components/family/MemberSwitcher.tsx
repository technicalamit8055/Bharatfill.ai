/**
 * "You · Papa · Mummy · + Add" — whose documents the screen shows. One tap switches; a red dot
 * marks a person with a document expired or expiring within 30 days. Scrolls sideways when the
 * family is bigger than the screen. The route decides what each chip means; this only draws.
 */

import { UserPlus } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type MemberChip, memberInitials } from '../../lib/family/family';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { familyPalette as palette } from './palette';

export type MemberSwitcherProps = {
  readonly chips: readonly MemberChip[];
  readonly selected: string;
  readonly onSelect: (value: string) => void;
  /** Absent hides "Add": the family is full. */
  readonly onAdd?: () => void;
};

export function MemberSwitcher({ chips, selected, onSelect, onAdd }: MemberSwitcherProps) {
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      accessibilityLabel={t('family.switcher.label')}
    >
      {chips.map((chip) => {
        const isSelected = chip.value === selected;
        return (
          <Pressable
            key={chip.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={
              chip.alert ? t('family.switcher.withAlert', { name: chip.label }) : chip.label
            }
            onPress={() => onSelect(chip.value)}
            style={({ pressed }) => [
              styles.chip,
              isSelected && styles.chipSelected,
              pressed && !isSelected && styles.pressed,
            ]}
          >
            <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
              <Text style={styles.initials}>{memberInitials(chip.label)}</Text>
              {chip.alert ? <View style={styles.dot} /> : null}
            </View>
            <Text numberOfLines={1} style={[styles.label, isSelected && styles.labelSelected]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
      {onAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family.switcher.add')}
          onPress={onAdd}
          style={({ pressed }) => [styles.chip, styles.addChip, pressed && styles.pressed]}
        >
          <UserPlus color={palette.brandBlue} size={18} strokeWidth={2.2} />
          <Text numberOfLines={1} style={[styles.label, styles.addLabel]}>
            {t('family.switcher.add')}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const AVATAR = 28;

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    height: 42,
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 7,
    paddingRight: 14,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.chipBorder,
    backgroundColor: palette.surface,
  },
  chipSelected: {
    borderColor: palette.brandBlue,
    backgroundColor: palette.brandBlue,
  },
  addChip: {
    paddingLeft: 12,
    borderStyle: 'dashed',
    borderColor: palette.brandBlue,
  },
  pressed: {
    opacity: 0.6,
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
    backgroundColor: palette.avatarSelectedSurface,
  },
  initials: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.avatarText,
  },
  dot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: palette.alertDotRing,
    backgroundColor: palette.alertDot,
  },
  label: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: palette.chipText,
  },
  labelSelected: {
    color: palette.onBrand,
  },
  addLabel: {
    color: palette.brandBlue,
  },
});
