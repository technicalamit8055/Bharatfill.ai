/**
 * The 6-box OTP input.
 *
 * One real `TextInput` holds the code and the boxes only draw it, so typing, backspace, paste
 * and the keyboard's own one-time-code suggestion all behave like a normal field instead of
 * six inputs handing focus to each other. Tapping any box focuses the hidden input.
 *
 * The OS may offer the code from the SMS as a keyboard suggestion; the citizen still has to
 * tap it, and Verify is never pressed for them.
 */

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { normaliseOtpInput, OTP_LENGTH } from '../../lib/auth/otp';
import { registrationPalette as palette } from './palette';

export type OtpCodeFieldProps = {
  /** Bare digits, at most 6. */
  readonly value: string;
  readonly onChangeCode: (code: string) => void;
  readonly onSubmitEditing?: () => void;
  readonly label: string;
  readonly hasError?: boolean;
};

const BOX_INDEXES = Array.from({ length: OTP_LENGTH }, (_, index) => index);

export function OtpCodeField({
  value,
  onChangeCode,
  onSubmitEditing,
  label,
  hasError = false,
}: OtpCodeFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  /** The box the next digit lands in; stays on the last box once the code is full. */
  const cursorIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <Pressable accessible={false} onPress={() => inputRef.current?.focus()} style={styles.row}>
      {BOX_INDEXES.map((index) => {
        const digit = value[index];
        const isCursor = focused && index === cursorIndex;

        const borderColor = hasError
          ? palette.fieldBorderError
          : digit || isCursor
            ? palette.fieldBorderFocused
            : palette.fieldBorder;

        return (
          <View
            key={index}
            style={[styles.box, { borderColor }, isCursor && styles.boxCursor]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            {digit ? <Text style={styles.digit}>{digit}</Text> : <View style={styles.dash} />}
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        // No maxLength: it would cut a pasted "123 456" before the space is stripped.
        onChangeText={(text) => onChangeCode(normaliseOtpInput(text))}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        returnKeyType="done"
        autoFocus
        caretHidden
        accessibilityLabel={label}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  box: {
    flex: 1,
    height: 58,
    maxWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderRadius: 12,
    backgroundColor: palette.fieldSurface,
  },
  boxCursor: {
    borderWidth: 1.8,
  },
  digit: {
    fontSize: 26,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  dash: {
    width: 16,
    height: 2,
    marginTop: 14,
    borderRadius: 1,
    backgroundColor: palette.otpDash,
  },
  /**
   * Kept 1pt and transparent rather than `display: none`, which would stop it taking focus
   * and raising the keyboard.
   */
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});
