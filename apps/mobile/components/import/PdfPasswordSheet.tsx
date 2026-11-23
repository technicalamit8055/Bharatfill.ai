/**
 * The password prompt for a locked PDF (an e-Aadhaar, a bank statement), opened by Upload
 * (`app/import.tsx`). A bottom sheet over the screen, so Android's back button cancels it; it
 * rides above the keyboard. Mount it only while a PDF is waiting for its password.
 *
 * The password lives in this sheet's state until Open hands it to `onSubmit`, which passes it to
 * the PDF renderer and nowhere else: it is not saved, logged, autofilled or offered to the
 * keyboard's suggestions. The e-Aadhaar hint is the format UIDAI publishes, not a guess.
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
import { importPalette as palette } from './palette';

/** Long enough for any real PDF password; the renderer is never handed an endless string. */
const MAX_PASSWORD_LENGTH = 128;

export type PdfPasswordSheetProps = {
  /** The password just tried did not open the PDF. */
  readonly wrong: boolean;
  /** Which of several locked PDFs this is, when the citizen picked more than one. */
  readonly position: { readonly number: number; readonly total: number } | null;
  readonly onSubmit: (password: string) => void;
  readonly onCancel: () => void;
};

export function PdfPasswordSheet({ wrong, position, onSubmit, onCancel }: PdfPasswordSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  const canSubmit = password.length > 0;
  const submit = () => {
    if (canSubmit) onSubmit(password);
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
              {position
                ? t('importFiles.password.titleOf', position)
                : t('importFiles.password.title')}
            </Text>
          </View>
          <Text style={styles.body}>{t('importFiles.password.body')}</Text>

          <View
            style={[
              styles.field,
              focused && styles.fieldFocused,
              wrong && password.length === 0 && styles.fieldError,
            ]}
          >
            <TextInput
              autoFocus
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
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
          {wrong ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {t('importFiles.password.wrong')}
            </Text>
          ) : null}
          <Text style={styles.hint}>{t('importFiles.password.aadhaarHint')}</Text>

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
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
