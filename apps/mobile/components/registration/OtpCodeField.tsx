/**
 * The 6-box OTP input — and, with `length` and `secure`, the 4-box Vault PIN input.
 *
 * One real `TextInput` holds the code and the boxes only draw it, so typing, backspace, paste
 * and the keyboard's own one-time-code suggestion all behave like a normal field instead of
 * six inputs handing focus to each other. Tapping any box focuses the hidden input.
 *
 * The OS may offer the code from the SMS as a keyboard suggestion; the citizen still has to
 * tap it, and Verify is never pressed for them.
 */

import { useEffect, useRef, useState } from 'react';
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
  /** Number of boxes. Defaults to the 6-digit OTP. */
  readonly length?: number;
  /** Draw a dot for each digit and never offer an SMS code (the Vault PIN). */
  readonly secure?: boolean;
  /** Raise the keyboard on mount. Defaults to true. */
  readonly autoFocus?: boolean;
};

export function OtpCodeField({
  value,
  onChangeCode,
  onSubmitEditing,
  label,
  hasError = false,
  length = OTP_LENGTH,
  secure = false,
  autoFocus = true,
}: OtpCodeFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const boxIndexes = Array.from({ length }, (_, index) => index);

  /**
   * Raise the keyboard a moment after mount instead of using `autoFocus`. Inside an Android
   * `Modal` (the app lock) `autoFocus` runs before the dialog window has focus: the input is
   * marked focused but the keyboard never shows, and later taps are ignored.
   */
  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  /** Tapping the boxes always brings the keyboard up, even if the input already has focus. */
  const openKeyboard = () => {
    const input = inputRef.current;
    if (!input) return;
    if (input.isFocused()) {
      input.blur();
      setTimeout(() => input.focus(), 50);
    } else {
      input.focus();
    }
  };

  /** The box the next digit lands in; stays on the last box once the code is full. */
  const cursorIndex = Math.min(value.length, length - 1);

  return (
    <Pressable accessible={false} onPress={openKeyboard} style={styles.row}>
      {boxIndexes.map((index) => {
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
            {digit ? (
              <Text style={styles.digit}>{secure ? '•' : digit}</Text>
            ) : (
              <View style={styles.dash} />
            )}
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        // No maxLength: it would cut a pasted "123 456" before the space is stripped.
        onChangeText={(text) => onChangeCode(normaliseOtpInput(text).slice(0, length))}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType={secure ? 'none' : 'oneTimeCode'}
        autoComplete={secure ? 'off' : 'sms-otp'}
        secureTextEntry={secure}
        returnKeyType="done"
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
