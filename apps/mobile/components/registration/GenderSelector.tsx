/**
 * Male / Female / Other as three side-by-side choices, each with its glyph. Behaves as a radio
 * group: exactly one can be chosen, and a screen reader hears which one is checked.
 */

import { Users } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { PROFILE_GENDERS, type ProfileGender } from '../../lib/profile/profile';
import { MarsIcon, VenusIcon } from './GenderIcons';
import { registrationPalette as palette } from './palette';

type GlyphComponent = ComponentType<{ color: string; size?: number; strokeWidth?: number }>;

const GLYPHS: Record<ProfileGender, GlyphComponent> = {
  male: MarsIcon,
  female: VenusIcon,
  other: Users,
};

export type GenderSelectorProps = {
  readonly value: ProfileGender | null;
  readonly onChange: (gender: ProfileGender) => void;
  /** The group's name for a screen reader: "Gender". */
  readonly label: string;
  readonly hasError?: boolean;
};

export function GenderSelector({ value, onChange, label, hasError = false }: GenderSelectorProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {PROFILE_GENDERS.map((gender) => {
        const selected = gender === value;
        const Glyph = GLYPHS[gender];
        const tint = selected ? palette.choiceSelectedLabel : palette.fieldIcon;

        return (
          <Pressable
            key={gender}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={t(`profileSetup.genders.${gender}`)}
            onPress={() => onChange(gender)}
            style={({ pressed }) => [
              styles.choice,
              hasError && styles.choiceError,
              selected && styles.choiceSelected,
              pressed && !selected && styles.choicePressed,
            ]}
          >
            <Glyph color={tint} size={22} strokeWidth={1.9} />
            <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
              {t(`profileSetup.genders.${gender}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: 8,
    borderWidth: 1.2,
    borderRadius: 12,
    borderColor: palette.fieldBorder,
    backgroundColor: palette.fieldSurface,
  },
  choiceError: {
    borderColor: palette.fieldBorderError,
  },
  choiceSelected: {
    borderColor: palette.choiceSelectedBorder,
    backgroundColor: palette.choiceSelectedSurface,
  },
  choicePressed: {
    backgroundColor: palette.sheetDivider,
  },
  label: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
    flexShrink: 1,
  },
});
