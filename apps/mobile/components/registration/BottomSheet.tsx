/**
 * The panel the profile form's pickers open in: a dimmed backdrop that closes on tap, and a
 * white sheet anchored to the bottom with a grab handle and a title.
 *
 * Built on `Modal`, so it sits above the scroll view and the keyboard, and Android's back
 * button closes it. Mount it only while it is open.
 */

import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { registrationPalette as palette } from './palette';

export type BottomSheetProps = {
  readonly title: string;
  /** Read out for the backdrop, which closes the sheet. */
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
};

export function BottomSheet({ title, closeLabel, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: palette.sheetBackdrop,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: palette.sheetSurface,
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
    color: palette.textPrimary,
  },
});
