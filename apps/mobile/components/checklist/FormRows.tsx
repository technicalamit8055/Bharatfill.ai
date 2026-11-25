/** The forms of one category, each opening the checklist of what it asks for. */

import type { SchemeDefinition } from '@assistigo/core';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { homePalette as palette } from '../home/palette';

export type FormRowsProps = {
  readonly schemes: readonly SchemeDefinition[];
  readonly onForm: (scheme: SchemeDefinition) => void;
};

export function FormRows({ schemes, onForm }: FormRowsProps) {
  const { locale } = useTranslation();
  return (
    <View style={styles.card}>
      {schemes.map((scheme, index) => (
        <Pressable
          key={scheme.slug}
          accessibilityRole="button"
          accessibilityLabel={scheme.title[locale]}
          onPress={() => onForm(scheme)}
          style={({ pressed }) => [
            styles.row,
            index > 0 && styles.divided,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.label}>{scheme.title[locale]}</Text>
          <ChevronRight color={palette.textMuted} size={18} strokeWidth={2.2} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: palette.textPrimary,
  },
});
