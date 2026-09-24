/**
 * A bottom sheet listing one-of-many choices (State, Preferred Language). Tapping a row picks
 * it and closes the sheet; the current choice is tinted and ticked, and the list opens
 * scrolled so it is in view.
 */

import { Check } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { registrationPalette as palette } from './palette';

const ROW_HEIGHT = 52;

export type SheetOption<T extends string> = {
  readonly value: T;
  readonly label: string;
};

export type OptionSheetProps<T extends string> = {
  readonly title: string;
  readonly closeLabel: string;
  readonly options: readonly SheetOption<T>[];
  readonly selected: T | null;
  readonly onSelect: (value: T) => void;
  readonly onClose: () => void;
};

export function OptionSheet<T extends string>({
  title,
  closeLabel,
  options,
  selected,
  onSelect,
  onClose,
}: OptionSheetProps<T>) {
  const { height } = useWindowDimensions();
  const listHeight = height * 0.55;

  // Open with a couple of rows above the current choice, but never scrolled past the end.
  const selectedIndex = options.findIndex((option) => option.value === selected);
  const lastFullPageIndex = Math.max(0, options.length - Math.floor(listHeight / ROW_HEIGHT));
  const initialScrollIndex = Math.max(0, Math.min(selectedIndex - 2, lastFullPageIndex));

  return (
    <BottomSheet title={title} closeLabel={closeLabel} onClose={onClose}>
      <FlatList
        data={options}
        keyExtractor={(option) => option.value}
        style={{ maxHeight: listHeight }}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        initialScrollIndex={initialScrollIndex}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const isSelected = item.value === selected;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={item.label}
              onPress={() => {
                onSelect(item.value);
                onClose();
              }}
              style={({ pressed }) => [
                styles.row,
                isSelected && styles.rowSelected,
                pressed && !isSelected && styles.rowPressed,
              ]}
            >
              <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
                {item.label}
              </Text>
              {isSelected ? (
                <Check color={palette.choiceSelectedLabel} size={20} strokeWidth={2.4} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  rowSelected: {
    backgroundColor: palette.choiceSelectedSurface,
  },
  rowPressed: {
    backgroundColor: palette.sheetDivider,
  },
  label: {
    flex: 1,
    fontSize: 16,
    color: palette.textPrimary,
  },
  labelSelected: {
    fontWeight: '700',
    color: palette.choiceSelectedLabel,
  },
});
