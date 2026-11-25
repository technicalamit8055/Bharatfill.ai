/** The frame both checklist screens share: back button, heading, and the vault's loading states. */

import { StatusBar } from 'expo-status-bar';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTranslation } from '../../lib/i18n/I18nProvider';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { homePalette as palette } from '../home/palette';

export type ChecklistPageProps = {
  readonly title: string;
  readonly status: 'loading' | 'failed' | 'ready';
  readonly onBack: () => void;
  readonly children: ReactNode;
};

export function ChecklistPage({ title, status, onBack, children }: ChecklistPageProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
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
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
          </View>
          {status === 'loading' ? <ActivityIndicator color={palette.brandBlue} /> : null}
          {status === 'failed' ? (
            <Text style={styles.failed}>{t('checklist.loadFailed')}</Text>
          ) : null}
          {status === 'ready' ? children : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

export type ChecklistSectionProps = {
  readonly title: string;
  readonly note?: string;
  readonly children?: ReactNode;
};

export function ChecklistSection({ title, note, children }: ChecklistSectionProps) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    gap: 18,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 10,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pressed: {
    opacity: 0.6,
  },
  title: {
    flex: 1,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  failed: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  note: {
    fontSize: 13.5,
    lineHeight: 19,
    color: palette.textSecondary,
  },
});
