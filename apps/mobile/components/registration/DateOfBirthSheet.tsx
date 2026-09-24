/**
 * Date-of-birth picker: Day, Month and Year as three scrollable columns in a bottom sheet.
 *
 * Columns rather than a calendar because a birth date is usually decades back, and a calendar
 * makes the citizen page back month by month or find a hidden year view. Years run newest
 * first, back `MAX_AGE_YEARS`. Choosing a month or year too short for the chosen day pulls the
 * day back (31 → 30), and Done unlocks once all three are chosen.
 *
 * The picked date stays in this sheet until Done hands it to `onConfirm` as an ISO string.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import {
  birthYearOptions,
  clampDay,
  daysInMonth,
  MONTH_KEYS,
  parseIsoDate,
  toIsoDate,
} from '../../lib/profile/date-of-birth';
import { BottomSheet } from './BottomSheet';
import { registrationPalette as palette } from './palette';

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;

type ColumnItem = { readonly value: number; readonly label: string };

export type DateOfBirthSheetProps = {
  /** The current date of birth as ISO `YYYY-MM-DD`, or `null` for none yet. */
  readonly value: string | null;
  readonly onConfirm: (isoDate: string) => void;
  readonly onClose: () => void;
};

export function DateOfBirthSheet({ value, onConfirm, onClose }: DateOfBirthSheetProps) {
  const { t } = useTranslation();

  const [initial] = useState(() => (value ? parseIsoDate(value) : null));
  const [day, setDay] = useState<number | null>(initial?.day ?? null);
  const [month, setMonth] = useState<number | null>(initial?.month ?? null);
  const [year, setYear] = useState<number | null>(initial?.year ?? null);

  const dayCount = month === null ? 31 : daysInMonth(year, month);

  const dayItems = useMemo<ColumnItem[]>(
    () =>
      Array.from({ length: dayCount }, (_, index) => ({
        value: index + 1,
        label: String(index + 1),
      })),
    [dayCount],
  );
  const monthItems = useMemo<ColumnItem[]>(
    () =>
      MONTH_KEYS.map((key, index) => ({
        value: index + 1,
        label: t(`profileSetup.months.${key}`),
      })),
    [t],
  );
  const yearItems = useMemo<ColumnItem[]>(
    () => birthYearOptions(new Date()).map((option) => ({ value: option, label: String(option) })),
    [],
  );

  const pickMonth = (next: number) => {
    setMonth(next);
    setDay((current) => (current === null ? null : clampDay(current, year, next)));
  };

  const pickYear = (next: number) => {
    setYear(next);
    setDay((current) => (current === null ? null : clampDay(current, next, month)));
  };

  const complete = day !== null && month !== null && year !== null;

  const confirm = () => {
    if (day === null || month === null || year === null) return;
    onConfirm(toIsoDate({ year, month, day }));
    onClose();
  };

  return (
    <BottomSheet
      title={t('profileSetup.dobLabel')}
      closeLabel={t('profileSetup.sheet.close')}
      onClose={onClose}
    >
      <View style={styles.columns}>
        <PickerColumn
          title={t('profileSetup.sheet.day')}
          items={dayItems}
          selected={day}
          onSelect={setDay}
          flex={0.8}
        />
        <PickerColumn
          title={t('profileSetup.sheet.month')}
          items={monthItems}
          selected={month}
          onSelect={pickMonth}
          flex={1.3}
        />
        <PickerColumn
          title={t('profileSetup.sheet.year')}
          items={yearItems}
          selected={year}
          onSelect={pickYear}
          flex={1}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profileSetup.sheet.cancel')}
          onPress={onClose}
          style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}
        >
          <Text style={styles.cancelLabel}>{t('profileSetup.sheet.cancel')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('profileSetup.sheet.done')}
          accessibilityState={{ disabled: !complete }}
          disabled={!complete}
          onPress={confirm}
          style={({ pressed }) => [
            styles.action,
            styles.done,
            !complete && styles.doneDisabled,
            pressed && styles.donePressed,
          ]}
        >
          <Text style={styles.doneLabel}>{t('profileSetup.sheet.done')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

type PickerColumnProps = {
  readonly title: string;
  readonly items: readonly ColumnItem[];
  readonly selected: number | null;
  readonly onSelect: (value: number) => void;
  readonly flex: number;
};

function PickerColumn({ title, items, selected, onSelect, flex }: PickerColumnProps) {
  // Open with the current choice in view, a couple of rows down, never past the end.
  const [initialOffset] = useState(() => {
    const index = items.findIndex((item) => item.value === selected);
    const lastPageStart = Math.max(0, items.length - VISIBLE_ROWS);
    return Math.max(0, Math.min(index - 2, lastPageStart)) * ROW_HEIGHT;
  });

  return (
    <View style={{ flex }}>
      <Text style={styles.columnTitle}>{title}</Text>
      <ScrollView
        style={styles.columnList}
        contentOffset={{ x: 0, y: initialOffset }}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => {
          const isSelected = item.value === selected;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${title} ${item.label}`}
              onPress={() => onSelect(item.value)}
              style={({ pressed }) => [
                styles.cell,
                isSelected && styles.cellSelected,
                pressed && !isSelected && styles.cellPressed,
              ]}
            >
              <Text
                style={[styles.cellLabel, isSelected && styles.cellLabelSelected]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: {
    flexDirection: 'row',
    gap: 10,
  },
  columnTitle: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    color: palette.textMuted,
  },
  columnList: {
    height: ROW_HEIGHT * VISIBLE_ROWS,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: palette.fieldBorder,
  },
  cell: {
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    borderRadius: 10,
  },
  cellSelected: {
    backgroundColor: palette.choiceSelectedSurface,
  },
  cellPressed: {
    backgroundColor: palette.sheetDivider,
  },
  cellLabel: {
    fontSize: 16,
    color: palette.textPrimary,
  },
  cellLabelSelected: {
    fontWeight: '700',
    color: palette.choiceSelectedLabel,
  },

  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  action: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  cancel: {
    borderWidth: 1.2,
    borderColor: palette.fieldBorder,
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  done: {
    backgroundColor: palette.cta,
  },
  doneDisabled: {
    backgroundColor: palette.ctaDisabled,
  },
  donePressed: {
    backgroundColor: palette.ctaPressed,
  },
  doneLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.ctaLabel,
  },
});
