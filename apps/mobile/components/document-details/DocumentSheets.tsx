/**
 * The bottom sheets Document Details opens: one text field with a Save button (Rename, Add
 * Tag), and the More menu.
 *
 * Each is a `Modal`, so Android's back button closes it; the text sheet rides above the keyboard.
 * Mount a sheet only while it is open.
 */

import type { LucideIcon } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
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

import { documentDetailsPalette as palette } from './palette';

function SheetFrame({
  title,
  closeLabel,
  onClose,
  children,
}: {
  readonly title: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          accessibilityViewIsModal
        >
          <View style={styles.handle} />
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type TextEntrySheetProps = {
  readonly title: string;
  readonly closeLabel: string;
  readonly inputLabel: string;
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly maxLength: number;
  readonly submitLabel: string;
  /** Returns an error to show under the field, or null when the value was accepted. */
  readonly onSubmit: (value: string) => string | null;
  readonly onClose: () => void;
};

export function TextEntrySheet({
  title,
  closeLabel,
  inputLabel,
  placeholder,
  initialValue = '',
  maxLength,
  submitLabel,
  onSubmit,
  onClose,
}: TextEntrySheetProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const submit = () => {
    const problem = onSubmit(value);
    if (problem === null) onClose();
    else setError(problem);
  };

  return (
    <SheetFrame title={title} closeLabel={closeLabel} onClose={onClose}>
      <TextInput
        autoFocus
        value={value}
        onChangeText={(next) => {
          setValue(next);
          setError(null);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={submit}
        accessibilityLabel={inputLabel}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        maxLength={maxLength}
        returnKeyType="done"
        selectTextOnFocus
        style={[styles.input, focused && styles.inputFocused, error !== null && styles.inputError]}
      />
      {error !== null ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={submit}
        style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
      >
        <Text style={styles.submitLabel}>{submitLabel}</Text>
      </Pressable>
    </SheetFrame>
  );
}

export type MenuItem = {
  readonly key: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly destructive?: boolean;
  readonly onPress: () => void;
};

export type MenuSheetProps = {
  readonly title: string;
  readonly closeLabel: string;
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
};

/**
 * iOS cannot present a modal or an alert while another modal is still animating away, so a menu
 * action that opens one waits for the menu's fade to finish.
 */
const MENU_DISMISS_MS = Platform.OS === 'ios' ? 320 : 0;

/** A list of actions. Tapping one closes the sheet, then runs it. */
export function MenuSheet({ title, closeLabel, items, onClose }: MenuSheetProps) {
  return (
    <SheetFrame title={title} closeLabel={closeLabel} onClose={onClose}>
      {items.map(({ key, label, icon: Icon, destructive, onPress }, position) => {
        const color = destructive ? palette.deleteText : palette.heading;
        const tile = destructive ? palette.menuTileDanger : palette.menuTile;
        return (
          <View key={key}>
            {position > 0 ? <View style={styles.menuDivider} /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                setTimeout(onPress, MENU_DISMISS_MS);
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <View style={[styles.menuTile, { backgroundColor: tile.background }]}>
                <Icon color={tile.icon} size={21} strokeWidth={2.1} />
              </View>
              <Text style={[styles.menuLabel, { color }]}>{label}</Text>
            </Pressable>
          </View>
        );
      })}
    </SheetFrame>
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
    backgroundColor: palette.sheetHandle,
  },
  title: {
    marginTop: 14,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '700',
    color: palette.heading,
  },

  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: palette.fieldBorder,
    backgroundColor: palette.field,
    fontSize: 16,
    color: palette.textPrimary,
  },
  inputFocused: {
    borderColor: palette.fieldBorderFocused,
  },
  inputError: {
    borderColor: palette.error,
  },
  error: {
    marginTop: 8,
    fontSize: 13.5,
    color: palette.error,
  },
  submit: {
    minHeight: 50,
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  submitPressed: {
    backgroundColor: palette.brandBluePressed,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.onBrand,
  },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 16,
  },
  menuRowPressed: {
    backgroundColor: palette.menuPressed,
  },
  menuTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 66,
    backgroundColor: palette.menuDivider,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});
