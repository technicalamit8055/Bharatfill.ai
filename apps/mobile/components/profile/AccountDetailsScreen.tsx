/**
 * "Personal Information" — opened from the Profile account card while signed in.
 *
 * Only what the account keeps (docs/VAULT_BRIDGE_DESIGN.md D10): the name as on the citizen's
 * documents, which they can change, and the mobile number they sign in with, shown but not
 * editable (it is the account). Language is changed on Profile itself. Then Change Vault PIN
 * (design D17), and below it Delete account, set apart and explained, so it is never tapped by
 * accident.
 *
 * Presentational: the route saves, deletes and decides what happens next. Light-only branded
 * artwork like the rest of Profile. The name is PII — shown, never logged.
 */

import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, ChevronRight, KeyRound, Phone, Trash2, User } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import {
  FULL_NAME_MAX_LENGTH,
  type FullNameError,
  fullNameError,
  normaliseFullName,
} from '../../lib/profile/profile';
import { phoneLineOf } from '../../lib/profile/profile-screen';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { IconTextField } from '../registration/IconFields';
import { profilePalette as palette } from './palette';

const NAME_ERROR_KEYS: Record<FullNameError, string> = {
  missing: 'profileSetup.errors.nameMissing',
  too_short: 'profileSetup.errors.nameTooShort',
  too_long: 'profileSetup.errors.nameTooLong',
  invalid_characters: 'profileSetup.errors.nameInvalid',
};

export type AccountDetailsScreenProps = {
  readonly initialName: string;
  /** 10 national digits, or null when not known. */
  readonly phoneNumber: string | null;
  readonly busy: 'saving' | 'deleting' | null;
  readonly onBack: () => void;
  /** Receives the normalised, valid name; only called when it changed. */
  readonly onSave: (fullName: string) => void;
  readonly onDeleteAccount: () => void;
  readonly onChangeVaultPin: () => void;
};

export function AccountDetailsScreen({
  initialName,
  phoneNumber,
  busy,
  onBack,
  onSave,
  onDeleteAccount,
  onChangeVaultPin,
}: AccountDetailsScreenProps) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState(initialName);
  const [attempted, setAttempted] = useState(false);

  const error = attempted ? fullNameError(fullName) : null;
  const changed = normaliseFullName(fullName) !== normaliseFullName(initialName);
  const phone = phoneNumber ? phoneLineOf(phoneNumber) : null;

  const save = () => {
    setAttempted(true);
    if (fullNameError(fullName) === null && changed) onSave(normaliseFullName(fullName));
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.content}>
              <View style={styles.topBar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('registration.back')}
                  hitSlop={12}
                  onPress={onBack}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <ChevronLeft color={palette.headerIcon} size={28} strokeWidth={2.2} />
                </Pressable>
                <Text accessibilityRole="header" style={styles.heading}>
                  {t('accountDetails.title')}
                </Text>
              </View>

              <Text style={styles.label}>{t('profileSetup.nameLabel')}</Text>
              <IconTextField
                icon={User}
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('profileSetup.namePlaceholder')}
                accessibilityLabel={t('profileSetup.nameLabel')}
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect={false}
                textContentType="name"
                returnKeyType="done"
                onSubmitEditing={save}
                maxLength={FULL_NAME_MAX_LENGTH}
                hasError={error !== null}
                editable={busy === null}
              />
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {t(NAME_ERROR_KEYS[error], { max: FULL_NAME_MAX_LENGTH })}
                </Text>
              ) : (
                <Text style={styles.hint}>{t('accountDetails.nameHint')}</Text>
              )}

              <Text style={styles.label}>{t('accountDetails.phoneLabel')}</Text>
              <View
                style={styles.readOnly}
                accessible
                accessibilityLabel={`${t('accountDetails.phoneLabel')}: ${phone ?? t('accountDetails.phoneUnknown')}`}
              >
                <Phone color={palette.textSecondary} size={20} strokeWidth={1.8} />
                <Text style={styles.readOnlyValue}>
                  {phone ?? t('accountDetails.phoneUnknown')}
                </Text>
              </View>
              <Text style={styles.hint}>{t('accountDetails.phoneHint')}</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !changed || busy !== null }}
                disabled={!changed || busy !== null}
                onPress={save}
                style={({ pressed }) => [
                  styles.save,
                  (!changed || busy !== null) && styles.saveDisabled,
                  pressed && styles.savePressed,
                ]}
              >
                {busy === 'saving' ? (
                  <ActivityIndicator color={palette.onBrand} />
                ) : (
                  <Text style={styles.saveLabel}>{t('accountDetails.save')}</Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('accountDetails.changePinTitle')}
                accessibilityHint={t('accountDetails.changePinBody')}
                disabled={busy !== null}
                onPress={onChangeVaultPin}
                style={({ pressed }) => [styles.pinRow, pressed && styles.pressed]}
              >
                <KeyRound color={palette.brandBlue} size={22} strokeWidth={2.1} />
                <View style={styles.pinCopy}>
                  <Text style={styles.pinTitle}>{t('accountDetails.changePinTitle')}</Text>
                  <Text style={styles.pinBody}>{t('accountDetails.changePinBody')}</Text>
                </View>
                <ChevronRight color={palette.textSecondary} size={20} strokeWidth={2.1} />
              </Pressable>

              <View style={styles.danger}>
                <Text style={styles.dangerTitle}>{t('accountDetails.deleteTitle')}</Text>
                <Text style={styles.dangerBody}>{t('accountDetails.deleteBody')}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy !== null }}
                  disabled={busy !== null}
                  onPress={onDeleteAccount}
                  style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                >
                  {busy === 'deleting' ? (
                    <ActivityIndicator color={palette.logoutText} />
                  ) : (
                    <>
                      <Trash2 color={palette.logoutText} size={20} strokeWidth={2.1} />
                      <Text style={styles.deleteLabel}>{t('accountDetails.delete')}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 32 },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
  },
  pressed: { opacity: 0.6 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, marginLeft: -6 },
  heading: { fontSize: 22, fontWeight: '800', color: palette.heading },
  label: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  hint: { marginTop: 6, fontSize: 12.5, lineHeight: 17, color: palette.textSecondary },
  error: { marginTop: 6, fontSize: 12.5, lineHeight: 17, color: palette.logoutText },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.divider,
  },
  readOnlyValue: { fontSize: 16, color: palette.textPrimary },
  save: {
    height: 54,
    marginTop: 28,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  saveDisabled: { opacity: 0.45 },
  savePressed: { backgroundColor: palette.brandBluePressed },
  saveLabel: { fontSize: 16.5, fontWeight: '700', color: palette.onBrand },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 32,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  pinCopy: { flex: 1 },
  pinTitle: { fontSize: 16, fontWeight: '700', color: palette.textPrimary },
  pinBody: { marginTop: 4, fontSize: 13, lineHeight: 18, color: palette.textSecondary },
  danger: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.logoutBorder,
    backgroundColor: palette.surface,
  },
  dangerTitle: { fontSize: 16, fontWeight: '700', color: palette.textPrimary },
  dangerBody: { marginTop: 6, fontSize: 13.5, lineHeight: 19, color: palette.textSecondary },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    marginTop: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.logoutBorder,
    backgroundColor: palette.logoutSurface,
  },
  deleteLabel: { fontSize: 15.5, fontWeight: '700', color: palette.logoutText },
});
