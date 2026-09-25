/**
 * Connect tab — in-person help from a Common Service Center: the "Connect" heading with a help
 * button, the Find a nearby CSC hero, four action cards, the nearby centres carousel and what
 * a centre can help with.
 *
 * Presentational only: the route decides which centres there are and what each tap does.
 * Light-only branded artwork like Home, so it does not read from `useTheme()`.
 */

import { ChevronRight, CircleHelp } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ConnectAction, NearbyCentre, NearbyCentres } from '../../lib/connect/connect-screen';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { ConnectActionGrid } from './ConnectActionGrid';
import { ConnectHero } from './ConnectHero';
import { CscHelpGrid } from './CscHelpGrid';
import { NearbyCentresCard } from './NearbyCentresCard';
import { connectPalette as palette } from './palette';

const HELP_BUTTON_SIZE = 48;

export type ConnectScreenProps = {
  readonly nearby: NearbyCentres;
  readonly onHelp: () => void;
  readonly onAction: (action: ConnectAction) => void;
  readonly onViewMap: () => void;
  readonly onOpenCentre: (centre: NearbyCentre) => void;
  readonly onViewAllServices: () => void;
};

export function ConnectScreen({
  nearby,
  onHelp,
  onAction,
  onViewMap,
  onOpenCentre,
  onViewAllServices,
}: ConnectScreenProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - PAGE_PADDING * 2;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.titles}>
              <Text accessibilityRole="header" numberOfLines={1} style={styles.heading}>
                {t('connect.heading')}
              </Text>
              <Text style={styles.subtitle}>{t('connect.subtitle')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('connect.help')}
              onPress={onHelp}
              style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]}
            >
              <CircleHelp color={palette.headerIcon} size={24} strokeWidth={2.2} />
            </Pressable>
          </View>

          <ConnectHero onFindNearby={() => onAction('find_nearby')} />

          <ConnectActionGrid width={contentWidth} onAction={onAction} />

          <NearbyCentresCard
            width={contentWidth}
            nearby={nearby}
            onViewMap={onViewMap}
            onOpenCentre={onOpenCentre}
          />

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" numberOfLines={1} style={styles.sectionTitle}>
                {t('connect.services.title')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('connect.services.viewAll')}
                accessibilityHint={t('connect.services.viewAllHint')}
                hitSlop={14}
                onPress={onViewAllServices}
                style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
              >
                <Text style={styles.sectionActionLabel}>{t('connect.services.viewAll')}</Text>
                <ChevronRight color={palette.brandBlue} size={17} strokeWidth={2.4} />
              </Pressable>
            </View>
            <CscHelpGrid width={contentWidth} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    gap: 16,
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 10,
    paddingBottom: 24,
  },
  pressed: {
    opacity: 0.6,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  titles: {
    flex: 1,
    marginRight: 12,
  },
  heading: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: palette.heading,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 21,
    color: palette.textSecondary,
  },
  helpButton: {
    width: HELP_BUTTON_SIZE,
    height: HELP_BUTTON_SIZE,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.headerButton,
  },

  section: {
    gap: 12,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '800',
    color: palette.heading,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sectionActionLabel: {
    fontSize: 14.5,
    fontWeight: '600',
    color: palette.brandBlue,
  },
});
