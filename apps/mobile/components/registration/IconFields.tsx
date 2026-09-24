/**
 * The two field shapes on the profile form, sharing one bordered box with a leading icon:
 *
 * - `IconTextField` — a text input (Full Name).
 * - `IconSelectField` — a tappable box showing the current choice and a chevron, which opens a
 *   picker (Date of Birth, State, Preferred Language).
 *
 * The border turns blue while the field is in use and red when it has an error.
 */

import type { LucideIcon } from 'lucide-react-native';
import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { registrationPalette as palette } from './palette';

const ICON_SIZE = 22;

function borderColor(hasError: boolean, active: boolean): string {
  if (hasError) return palette.fieldBorderError;
  return active ? palette.fieldBorderFocused : palette.fieldBorder;
}

export type IconTextFieldProps = Omit<
  TextInputProps,
  'style' | 'placeholderTextColor' | 'onFocus' | 'onBlur'
> & {
  readonly icon: LucideIcon;
  readonly hasError?: boolean;
};

export function IconTextField({ icon: Icon, hasError = false, ...inputProps }: IconTextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.box, { borderColor: borderColor(hasError, focused) }]}>
      <Icon color={palette.fieldIcon} size={ICON_SIZE} strokeWidth={1.8} />
      <TextInput
        {...inputProps}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor={palette.fieldPlaceholder}
        style={styles.input}
      />
    </View>
  );
}

export type IconSelectFieldProps = {
  readonly icon: LucideIcon;
  /** The field's name, read out before its value. */
  readonly label: string;
  /** The current choice as it should read, or `null` for none yet. */
  readonly value: string | null;
  readonly placeholder: string;
  readonly onPress: () => void;
  readonly hasError?: boolean;
};

export function IconSelectField({
  icon: Icon,
  label,
  value,
  placeholder,
  onPress,
  hasError = false,
}: IconSelectFieldProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value ?? placeholder}`}
      onPress={onPress}
      style={({ pressed }) => [styles.box, { borderColor: borderColor(hasError, pressed) }]}
    >
      <Icon color={palette.fieldIcon} size={ICON_SIZE} strokeWidth={1.8} />
      <Text style={[styles.value, value === null && styles.placeholder]} numberOfLines={1}>
        {value ?? placeholder}
      </Text>
      <ChevronDown color={palette.fieldIcon} size={20} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 16,
    borderWidth: 1.2,
    borderRadius: 12,
    backgroundColor: palette.fieldSurface,
  },
  input: {
    flex: 1,
    height: '100%',
    marginLeft: 14,
    fontSize: 16.5,
    color: palette.textPrimary,
    paddingVertical: 0,
  },
  value: {
    flex: 1,
    marginHorizontal: 14,
    fontSize: 16.5,
    color: palette.textPrimary,
  },
  placeholder: {
    color: palette.fieldPlaceholder,
  },
});
