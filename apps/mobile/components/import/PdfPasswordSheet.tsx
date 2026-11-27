/**
 * The password prompt for a locked PDF (an e-Aadhaar, a bank statement), opened by Upload
 * (`app/import.tsx`). A bottom sheet over the screen, so Android's back button cancels it; it
 * rides above the keyboard. Mount it only while a PDF is waiting for its password.
 *
 * Two ways in. For an e-Aadhaar (its file name says so, or the citizen says it is one) the sheet
 * asks only for the year of birth: UIDAI's rule is the first four letters of the name in
 * capitals plus that year, and the letters come filled in from the citizen's name in the app,
 * editable for a family member's card (`lib/scan/e-aadhaar.ts`). Any other PDF gets a password
 * field. Either way the sheet can switch to the other.
 *
 * What is typed lives in this sheet's state until Open hands the password(s) to `onSubmit`,
 * which passes them to the PDF renderer and nowhere else: never saved, logged, autofilled or
 * offered to the keyboard's suggestions.
 */

import { Eye, EyeOff, LockKeyhole } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { cleanNameLetters, eAadhaarPasswords } from '../../lib/scan/e-aadhaar';
import { importPalette as palette } from './palette';

/** Long enough for any real PDF password; the renderer is never handed an endless string. */
const MAX_PASSWORD_LENGTH = 128;

export type PdfPasswordSheetProps = {
  /** The password just tried did not open the PDF. */
  readonly wrong: boolean;
  /** Which of several locked PDFs this is, when the citizen picked more than one. */
  readonly position: { readonly number: number; readonly total: number } | null;
  /** Start on the e-Aadhaar way in (birth year only). */
  readonly aadhaar: boolean;
  /** The citizen's name in the app, for the letters; null when the app has none. */
  readonly fullName: string | null;
  /** The letters as the citizen last left them, so a retry keeps a family member's. */
  readonly initialLetters: string;
  /** Passwords to try in order; `letters` is what the e-Aadhaar way used, to keep for a retry. */
  readonly onSubmit: (passwords: readonly string[], letters: string | null) => void;
  readonly onCancel: () => void;
};

export function PdfPasswordSheet({
  wrong,
  position,
  aadhaar,
  fullName,
  initialLetters,
  onSubmit,
  onCancel,
}: PdfPasswordSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'aadhaar' | 'password'>(aadhaar ? 'aadhaar' : 'password');
  const [password, setPassword] = useState('');
  const [letters, setLetters] = useState(initialLetters);
  const [year, setYear] = useState('');
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState<'password' | 'letters' | 'year' | null>(null);

  const candidates =
    mode === 'aadhaar' ? eAadhaarPasswords(letters, year, fullName) : password ? [password] : [];
  const canSubmit = candidates.length > 0;
  const submit = () => {
    if (canSubmit) onSubmit(candidates, mode === 'aadhaar' ? letters : null);
  };

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={t('importFiles.password.cancel')}
          onPress={onCancel}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.badge}>
              <LockKeyhole color={palette.brandBlue} size={22} strokeWidth={2.1} />
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              {mode === 'aadhaar'
                ? t('importFiles.password.aadhaarTitle')
                : position
                  ? t('importFiles.password.titleOf', position)
                  : t('importFiles.password.title')}
            </Text>
          </View>
          <Text style={styles.body}>
            {t(
              mode === 'aadhaar' ? 'importFiles.password.aadhaarBody' : 'importFiles.password.body',
            )}
          </Text>

          {mode === 'aadhaar' ? (
            <View style={styles.aadhaarRow}>
              <View style={styles.lettersColumn}>
                <Text style={styles.fieldLabel}>{t('importFiles.password.lettersLabel')}</Text>
                <View
                  style={[
                    styles.field,
                    focused === 'letters' && styles.fieldFocused,
                    wrong && styles.fieldError,
                  ]}
                >
                  <TextInput
                    value={letters}
                    onChangeText={(text) => setLetters(cleanNameLetters(text))}
                    onFocus={() => setFocused('letters')}
                    onBlur={() => setFocused(null)}
                    accessibilityLabel={t('importFiles.password.lettersLabel')}
                    accessibilityHint={t('importFiles.password.lettersHint')}
                    placeholder="ABCD"
                    placeholderTextColor={palette.placeholder}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    textContentType="none"
                    spellCheck={false}
                    maxLength={4}
                    style={[styles.input, styles.codeInput]}
                  />
                </View>
              </View>
              <View style={styles.yearColumn}>
                <Text style={styles.fieldLabel}>{t('importFiles.password.yearLabel')}</Text>
                <View
                  style={[
                    styles.field,
                    focused === 'year' && styles.fieldFocused,
                    wrong && styles.fieldError,
                  ]}
                >
                  <TextInput
                    autoFocus
                    value={year}
                    onChangeText={(text) => setYear(text.replace(/\D/g, '').slice(0, 4))}
                    onFocus={() => setFocused('year')}
                    onBlur={() => setFocused(null)}
                    onSubmitEditing={submit}
                    accessibilityLabel={t('importFiles.password.yearLabel')}
                    placeholder="1990"
                    placeholderTextColor={palette.placeholder}
                    keyboardType="number-pad"
                    autoComplete="off"
                    importantForAutofill="no"
                    textContentType="none"
                    maxLength={4}
                    returnKeyType="done"
                    style={[styles.input, styles.codeInput]}
                  />
                </View>
              </View>
            </View>
          ) : (
            <View
              style={[
                styles.field,
                focused === 'password' && styles.fieldFocused,
                wrong && password.length === 0 && styles.fieldError,
              ]}
            >
              <TextInput
                autoFocus
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                onSubmitEditing={submit}
                accessibilityLabel={t('importFiles.password.label')}
                placeholder={t('importFiles.password.placeholder')}
                placeholderTextColor={palette.placeholder}
                secureTextEntry={!visible}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                importantForAutofill="no"
                textContentType="none"
                spellCheck={false}
                maxLength={MAX_PASSWORD_LENGTH}
                returnKeyType="done"
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  visible ? 'importFiles.password.hide' : 'importFiles.password.show',
                )}
                hitSlop={8}
                onPress={() => setVisible((on) => !on)}
                style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
              >
                {visible ? (
                  <EyeOff color={palette.textSecondary} size={21} strokeWidth={2} />
                ) : (
                  <Eye color={palette.textSecondary} size={21} strokeWidth={2} />
                )}
              </Pressable>
            </View>
          )}

          {wrong ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {t(
                mode === 'aadhaar'
                  ? 'importFiles.password.aadhaarWrong'
                  : 'importFiles.password.wrong',
              )}
            </Text>
          ) : null}
          <Text style={styles.hint}>
            {t(
              mode === 'aadhaar'
                ? 'importFiles.password.aadhaarExample'
                : 'importFiles.password.aadhaarHint',
            )}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              styles.submit,
              !canSubmit && styles.disabled,
              pressed && styles.submitPressed,
            ]}
          >
            <Text style={styles.submitLabel}>{t('importFiles.password.open')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => setMode((current) => (current === 'aadhaar' ? 'password' : 'aadhaar'))}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={styles.switchLabel}>
              {t(
                mode === 'aadhaar'
                  ? 'importFiles.password.usePassword'
                  : 'importFiles.password.useAadhaar',
              )}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onCancel}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text style={styles.cancelLabel}>{t('importFiles.password.skip')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: palette.backdrop,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: palette.surface,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 6,
    backgroundColor: palette.handle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.photosTile,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: palette.heading,
  },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    color: palette.textSecondary,
  },
  aadhaarRow: {
    flexDirection: 'row',
    gap: 12,
  },
  lettersColumn: {
    flex: 1,
    gap: 6,
  },
  yearColumn: {
    flex: 1,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingLeft: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: palette.inputBorder,
    backgroundColor: palette.input,
  },
  fieldFocused: {
    borderColor: palette.inputFocused,
  },
  fieldError: {
    borderColor: palette.errorBorder,
  },
  input: {
    flex: 1,
    minHeight: 50,
    fontSize: 16,
    color: palette.textPrimary,
  },
  codeInput: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
  eye: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.error,
  },
  hint: {
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
  submit: {
    marginTop: 4,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  submitPressed: {
    backgroundColor: palette.brandBluePressed,
  },
  disabled: {
    opacity: 0.5,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.onBrand,
  },
  cancel: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.brandBlue,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
});
