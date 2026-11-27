/**
 * "Read on this phone" — on Save Document, under the scan: while the phone reads the pages, a
 * quiet line saying so; then what it found, with the type it filled in (if it did) and the
 * details it read (name, date of birth, roll number…), so the citizen sees why the form is
 * already filled and can change it. Nothing shows for a photo or a signature, or on a phone
 * that cannot read text.
 *
 * Field names come from the shared customer-field registry, which carries English and Hindi.
 */

import { fieldLabel } from '@assistigo/ai/on-device';
import { ScanText, Sparkles } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import type { ReadingState } from '../../lib/ocr/use-document-reading';
import { saveDocumentPalette as palette } from './palette';

export type ReadingCardProps = {
  readonly state: ReadingState;
  /** The type the reading filled in, as shown; null when the citizen's own choice stands. */
  readonly filledType: string | null;
};

export function ReadingCard({ state, filledType }: ReadingCardProps) {
  const { t, locale } = useTranslation();

  if (state.status === 'reading') {
    return (
      <View style={styles.row} accessibilityLiveRegion="polite">
        <ActivityIndicator color={palette.brandBlue} size="small" />
        <Text style={styles.muted}>{t('reading.inProgress')}</Text>
      </View>
    );
  }
  if (state.status !== 'done') return null;

  const { fields } = state.reading;
  if (fields.length === 0 && filledType === null) return null;

  return (
    <View style={styles.card} accessible accessibilityLiveRegion="polite">
      <View style={styles.header}>
        <View style={styles.badge}>
          <ScanText color={palette.brandBlue} size={18} strokeWidth={2.2} />
        </View>
        <Text style={styles.title}>{t('reading.title')}</Text>
      </View>
      {filledType ? (
        <View style={styles.detected}>
          <Sparkles color={palette.brandBlue} size={15} strokeWidth={2.2} />
          <Text style={styles.detectedText}>{t('reading.detected', { type: filledType })}</Text>
        </View>
      ) : null}
      {fields.map((field) => (
        <View key={field.key} style={styles.field}>
          <Text style={styles.fieldName} numberOfLines={1}>
            {fieldLabel(field.key, locale === 'hi' ? 'hi' : 'en')}
          </Text>
          <Text style={styles.fieldValue} selectable>
            {field.value}
          </Text>
        </View>
      ))}
      <Text style={styles.note}>{t('reading.note')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  muted: {
    fontSize: 14,
    color: palette.textSecondary,
  },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.secureBadge,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: palette.heading,
  },
  detected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: palette.tag,
  },
  detectedText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.tagText,
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldName: {
    flexShrink: 1,
    fontSize: 14,
    color: palette.textSecondary,
  },
  fieldValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: palette.textPrimary,
    textAlign: 'right',
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.textMuted,
  },
});
