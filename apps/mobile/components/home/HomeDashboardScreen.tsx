/**
 * Home dashboard — the citizen's landing tab: greeting header, the scan hero, scanner
 * shortcuts, the Cyber Cafe / CSC banner, the vault categories and recent documents.
 *
 * Presentational only: the route decides what the dashboard holds and what each tap does.
 * Light-only branded artwork like registration, so it does not read from `useTheme()`.
 */

import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeDashboard, QuickScanMode, RecentDocument } from '../../lib/home/dashboard';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { CscConnectBanner } from './CscConnectBanner';
import { HomeHeader } from './HomeHeader';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from './layout';
import { homePalette as palette } from './palette';
import { QuickActions } from './QuickActions';
import { RecentDocuments } from './RecentDocuments';
import { ScanHeroCard } from './ScanHeroCard';
import { VaultCategoryGrid } from './VaultCategoryGrid';

export type HomeDashboardScreenProps = {
  readonly dashboard: HomeDashboard;
  /** The moment document ages ("2 hours ago") are measured from. */
  readonly now: Date;
  readonly onScan: (mode: QuickScanMode) => void;
  /** Upload: a photo or PDF already on the phone. */
  readonly onUpload: () => void;
  readonly onOpenNotifications: () => void;
  readonly onOpenProfile: () => void;
  readonly onConnect: () => void;
  readonly onOpenVault: () => void;
  readonly onDocumentActions: (document: RecentDocument) => void;
};

export function HomeDashboardScreen({
  dashboard,
  now,
  onScan,
  onUpload,
  onOpenNotifications,
  onOpenProfile,
  onConnect,
  onOpenVault,
  onDocumentActions,
}: HomeDashboardScreenProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();

  const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - PAGE_PADDING * 2;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <HomeHeader
            citizenName={dashboard.citizenName}
            hasUnreadNotifications={dashboard.hasUnreadNotifications}
            onOpenNotifications={onOpenNotifications}
            onOpenProfile={onOpenProfile}
          />

          <ScanHeroCard onScan={() => onScan('document')} />

          <QuickActions width={contentWidth} onScan={onScan} onUpload={onUpload} />

          <CscConnectBanner width={contentWidth} onConnect={onConnect} />

          <Section
            title={t('home.vault.title')}
            actionLabel={t('home.vault.viewAll')}
            actionHint={t('home.vault.viewAllHint')}
            onAction={onOpenVault}
          >
            <VaultCategoryGrid
              width={contentWidth}
              counts={dashboard.documentCounts}
              onOpenVault={onOpenVault}
            />
          </Section>

          <Section
            title={t('home.recent.title')}
            actionLabel={t('home.recent.seeAll')}
            actionHint={t('home.recent.seeAllHint')}
            onAction={onOpenVault}
          >
            <RecentDocuments
              width={contentWidth}
              documents={dashboard.recentDocuments}
              now={now}
              onDocumentActions={onDocumentActions}
            />
          </Section>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type SectionProps = {
  readonly title: string;
  readonly actionLabel: string;
  /** Screen-reader hint for the action, which says where it goes. */
  readonly actionHint: string;
  readonly onAction: () => void;
  readonly children: ReactNode;
};

/** A section heading with a "View All >" style link on the right, then the section body. */
function Section({ title, actionLabel, actionHint, onAction, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" numberOfLines={1} style={styles.sectionTitle}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint={actionHint}
          hitSlop={14}
          onPress={onAction}
          style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
        >
          <Text style={styles.sectionActionLabel}>{actionLabel}</Text>
          <ChevronRight color={palette.brandBlue} size={17} strokeWidth={2.4} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    gap: 18,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 10,
    paddingBottom: 24,
  },
  pressed: {
    opacity: 0.6,
  },

  section: {
    gap: 12,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: palette.textPrimary,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  sectionActionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.brandBlue,
  },
});
