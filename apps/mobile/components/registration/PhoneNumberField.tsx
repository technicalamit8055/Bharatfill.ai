/**
 * The +91 mobile-number input: flag and dial code on the left, a divider, then the 10-digit
 * national number. India is the only supported country, so the flag block is display-only;
 * the chevron keeps the approved artwork and leaves room for a picker later.
 *
 * The field is controlled with bare digits; spacing is applied only for display.
 */

import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  formatMobileForDisplay,
  INDIA_DIAL_CODE,
  normaliseMobileInput,
} from '../../lib/auth/phone';
import { registrationPalette as palette } from './palette';

export type PhoneNumberFieldProps = {
  /** Bare national digits, at most 10. */
  readonly value: string;
  readonly onChangeDigits: (digits: string) => void;
  readonly onSubmitEditing?: () => void;
  readonly label: string;
  readonly countryLabel: string;
  readonly placeholder: string;
  readonly hasError?: boolean;
};

export function PhoneNumberField({
  value,
  onChangeDigits,
  onSubmitEditing,
  label,
  countryLabel,
  placeholder,
  hasError = false,
}: PhoneNumberFieldProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = hasError
    ? palette.fieldBorderError
    : focused
      ? palette.fieldBorderFocused
      : palette.fieldBorder;

  return (
    <View style={[styles.box, { borderColor }]}>
      <View style={styles.country} accessible accessibilityLabel={countryLabel}>
        <Image
          source={require('../../assets/registration/india-flag.jpg')}
          style={styles.flag}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <ChevronDown color={palette.textSecondary} size={16} strokeWidth={2.2} />
        <Text style={styles.dialCode}>{INDIA_DIAL_CODE}</Text>
      </View>

      <View style={styles.divider} />

      <TextInput
        value={formatMobileForDisplay(value)}
        onChangeText={(text) => onChangeDigits(normaliseMobileInput(text))}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={palette.fieldPlaceholder}
        keyboardType="number-pad"
        textContentType="telephoneNumber"
        autoComplete="tel-national"
        returnKeyType="done"
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    paddingHorizontal: 14,
    borderWidth: 1.2,
    borderRadius: 12,
    backgroundColor: palette.fieldSurface,
  },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flag: {
    width: 30,
    height: 24,
    marginRight: 4,
  },
  dialCode: {
    marginLeft: 10,
    fontSize: 18,
    fontWeight: '500',
    color: palette.textPrimary,
  },
  divider: {
    width: 1,
    height: 26,
    marginHorizontal: 12,
    backgroundColor: palette.fieldDivider,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 18,
    letterSpacing: 0.5,
    color: palette.textPrimary,
    paddingVertical: 0,
  },
});
