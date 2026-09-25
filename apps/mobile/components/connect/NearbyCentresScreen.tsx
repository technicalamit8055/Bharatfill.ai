/**
 * Nearby CSC Centers — pushed from the Connect tab: back arrow and heading with a help button,
 * the area search field with a locate button, the distance / Open Now / Filters chips, the map
 * preview, a List View / Map View switch and a card per centre.
 *
 * List View shows a short map above every matching centre; Map View shows a tall map and the
 * picked centre's card alone. Tapping a pin picks that centre; tapping a card opens its details.
 *
 * Presentational apart from view state (filters, search, view, the picked centre): the route
 * decides which centres exist and what directions, connecting, alerts and location do. Search
 * and the filters only narrow the centres already on the phone. Light-only branded artwork like
 * the Connect tab, so it does not read from `useTheme()`.
 */

import {
  ArrowLeft,
  CircleHelp,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  SearchX,
  SlidersHorizontal,
  Store,
  X,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CSC_OFFERINGS,
  type CscOffering,
  type NearbyCentre,
  type NearbyCentres,
} from '../../lib/connect/connect-screen';
import {
  sheetFilterCount,
  DEFAULT_NEARBY_FILTERS,
  filterCentres,
  NEARBY_RADII_KM,
  type NearbyFilters,
  type NearbyView,
  toggleRadius,
} from '../../lib/connect/nearby-search';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { CONTENT_MAX_WIDTH, PAGE_PADDING } from '../home/layout';
import { OptionSheet } from '../registration/OptionSheet';
import { CentreMap } from './CentreMap';
import { NearbyCentreCard } from './NearbyCentreCard';
import { connectPalette as palette } from './palette';

const BUTTON_SIZE = 48;
const ANY_SERVICE = 'any';
type ServiceOption = CscOffering | typeof ANY_SERVICE;

const CLEARED_FILTERS: NearbyFilters = {
  radiusKm: null,
  openNow: false,
  offering: null,
  search: '',
};

export type NearbyCentresScreenProps = {
  readonly nearby: NearbyCentres;
  readonly initialView: NearbyView;
  /** The centre to pick when the screen opens; the nearest one otherwise. */
  readonly initialCentreId: string | null;
  readonly bookmarks: ReadonlySet<string>;
  readonly onBack: () => void;
  readonly onHelp: () => void;
  readonly onUseLocation: () => void;
  readonly onToggleBookmark: (centre: NearbyCentre) => void;
  readonly onOpenCentre: (centre: NearbyCentre) => void;
  readonly onDirections: (centre: NearbyCentre) => void;
  readonly onConnect: (centre: NearbyCentre) => void;
  readonly onNotify: (centre: NearbyCentre) => void;
};

export function NearbyCentresScreen({
  nearby,
  initialView,
  initialCentreId,
  bookmarks,
  onBack,
  onHelp,
  onUseLocation,
  onToggleBookmark,
  onOpenCentre,
  onDirections,
  onConnect,
  onNotify,
}: NearbyCentresScreenProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = Math.min(windowWidth, CONTENT_MAX_WIDTH) - PAGE_PADDING * 2;

  const centres = nearby.status === 'ready' ? nearby.centres : [];
  const [filters, setFilters] = useState<NearbyFilters>(() => {
    // Opening from a tapped centre must show it, whatever its distance.
    const tapped = centres.find((centre) => centre.id === initialCentreId);
    return {
      ...DEFAULT_NEARBY_FILTERS,
      radiusKm:
        tapped && tapped.distanceMeters > (DEFAULT_NEARBY_FILTERS.radiusKm ?? 0) * 1000
          ? null
          : DEFAULT_NEARBY_FILTERS.radiusKm,
      search: nearby.status === 'ready' ? nearby.area.label : '',
    };
  });
  const [view, setView] = useState<NearbyView>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(initialCentreId);
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);

  const visible = useMemo(() => filterCentres(centres, filters), [centres, filters]);
  const selected = visible.find((centre) => centre.id === selectedId) ?? visible[0] ?? null;

  const update = (change: Partial<NearbyFilters>) =>
    setFilters((current) => ({ ...current, ...change }));
  const select = (centre: NearbyCentre) => setSelectedId(centre.id);

  const header = (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('connect.finder.back')}
        hitSlop={10}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <ArrowLeft color={palette.brandBlue} size={26} strokeWidth={2.2} />
      </Pressable>
      <View style={styles.titles}>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.heading}>
          {t('connect.finder.title')}
        </Text>
        <Text style={styles.subtitle}>{t('connect.finder.subtitle')}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('connect.help')}
        onPress={onHelp}
        style={({ pressed }) => [styles.squareButton, pressed && styles.pressed]}
      >
        <CircleHelp color={palette.headerIcon} size={24} strokeWidth={2.2} />
      </Pressable>
    </View>
  );

  if (nearby.status !== 'ready') {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.content, styles.unavailable]}>
          {header}
          <View style={styles.emptyCard}>
            <Store color={palette.textMuted} size={28} strokeWidth={2} />
            <Text style={styles.emptyText}>{t('connect.nearby.unavailable')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const filterCount = sheetFilterCount(filters);

  const listHeader = (
    <View style={styles.header}>
      {header}

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <MapPin color={palette.headerIcon} size={22} strokeWidth={2} />
          <TextInput
            value={filters.search}
            onChangeText={(search) => update({ search })}
            placeholder={t('connect.finder.searchPlaceholder')}
            placeholderTextColor={palette.textMuted}
            accessibilityLabel={t('connect.finder.search')}
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {filters.search.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('connect.finder.clearSearch')}
              hitSlop={10}
              onPress={() => update({ search: '' })}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <X color={palette.textSecondary} size={22} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('connect.finder.useLocation')}
          onPress={onUseLocation}
          style={({ pressed }) => [styles.locateButton, pressed && styles.pressed]}
        >
          <LocateFixed color={palette.brandBlue} size={24} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroller}
        contentContainerStyle={styles.chips}
      >
        {NEARBY_RADII_KM.map((radius) => (
          <Chip
            key={radius}
            label={t('connect.finder.within', { km: radius })}
            selected={filters.radiusKm === radius}
            onPress={() => update({ radiusKm: toggleRadius(filters.radiusKm, radius) })}
          />
        ))}
        <Chip
          label={t('connect.nearby.openNow')}
          selected={filters.openNow}
          onPress={() => update({ openNow: !filters.openNow })}
        />
        <Chip
          label={t('connect.finder.filters')}
          accessibilityLabel={
            filterCount > 0
              ? t('connect.finder.filtersActive', { count: filterCount })
              : t('connect.finder.filters')
          }
          selected={filterCount > 0}
          badge={filterCount > 0 ? filterCount : null}
          icon
          onPress={() => setServiceSheetOpen(true)}
        />
      </ScrollView>

      {visible.length > 0 ? (
        <CentreMap
          width={contentWidth}
          height={view === 'map' ? Math.round(contentWidth * 1.15) : Math.round(contentWidth * 0.6)}
          origin={nearby.area.origin}
          centres={visible}
          selectedId={selected?.id ?? null}
          onSelectCentre={select}
          onUseLocation={onUseLocation}
        />
      ) : null}

      <View style={styles.toggle} accessibilityRole="tablist">
        {(['list', 'map'] as const).map((option) => {
          const active = view === option;
          const Icon = option === 'list' ? List : MapIcon;
          const label = t(`connect.finder.views.${option}`);
          return (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={() => setView(option)}
              style={({ pressed }) => [
                styles.toggleButton,
                active && styles.toggleButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                color={active ? palette.onBrand : palette.finder.toggleText}
                size={20}
                strokeWidth={2.2}
              />
              <Text
                numberOfLines={1}
                style={[styles.toggleLabel, active && styles.toggleLabelActive]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const data = view === 'map' ? (selected ? [selected] : []) : visible;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={data}
        keyExtractor={(centre) => centre.id}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <SearchX color={palette.textMuted} size={28} strokeWidth={2} />
            <Text style={styles.emptyText}>{t('connect.finder.noMatches')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFilters(CLEARED_FILTERS)}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <Text style={styles.clearButtonLabel}>{t('connect.finder.clearFilters')}</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <NearbyCentreCard
            centre={item}
            selected={item.id === selected?.id}
            bookmarked={bookmarks.has(item.id)}
            onOpen={onOpenCentre}
            onToggleBookmark={onToggleBookmark}
            onDirections={onDirections}
            onConnect={onConnect}
            onNotify={onNotify}
          />
        )}
        ItemSeparatorComponent={Separator}
        style={styles.list}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {serviceSheetOpen ? (
        <OptionSheet<ServiceOption>
          title={t('connect.finder.serviceSheetTitle')}
          closeLabel={t('connect.finder.serviceSheetClose')}
          options={[
            { value: ANY_SERVICE, label: t('connect.finder.anyService') },
            ...CSC_OFFERINGS.map((offering) => ({
              value: offering,
              label: t(`connect.offerings.${offering}`),
            })),
          ]}
          selected={filters.offering ?? ANY_SERVICE}
          onSelect={(value) => update({ offering: value === ANY_SERVICE ? null : value })}
          onClose={() => setServiceSheetOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

type ChipProps = {
  readonly label: string;
  readonly accessibilityLabel?: string;
  readonly selected: boolean;
  readonly icon?: boolean;
  readonly badge?: number | null;
  readonly onPress: () => void;
};

function Chip({ label, accessibilityLabel, selected, icon, badge, onPress }: ChipProps) {
  const color = selected ? palette.finder.onChipSelected : palette.finder.chipText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      {icon ? (
        <SlidersHorizontal
          color={selected ? color : palette.brandBlue}
          size={18}
          strokeWidth={2.2}
        />
      ) : null}
      <Text numberOfLines={1} style={[styles.chipLabel, { color }]}>
        {label}
      </Text>
      {badge ? (
        <View style={styles.chipBadge}>
          <Text style={styles.chipBadgeLabel}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  list: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: PAGE_PADDING,
    paddingTop: 10,
    paddingBottom: 24,
  },
  unavailable: {
    gap: 16,
  },
  pressed: {
    opacity: 0.6,
  },

  header: {
    gap: 14,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  backButton: {
    width: 36,
    height: 36,
    marginTop: 2,
    marginLeft: -6,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    marginRight: 12,
  },
  heading: {
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
    color: palette.heading,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14.5,
    lineHeight: 20,
    color: palette.textSecondary,
  },
  squareButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.finder.fieldBorder,
    backgroundColor: palette.surface,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.finder.fieldBorder,
    backgroundColor: palette.surface,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 16,
    color: palette.textPrimary,
  },
  locateButton: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.finder.fieldBorder,
    backgroundColor: palette.surface,
  },

  // The chips scroll sideways through the page padding to the screen edge.
  chipsScroller: {
    marginHorizontal: -PAGE_PADDING,
  },
  chips: {
    gap: 8,
    paddingHorizontal: PAGE_PADDING,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.finder.chipBorder,
    backgroundColor: palette.surface,
  },
  chipSelected: {
    borderColor: palette.finder.chipSelected,
    backgroundColor: palette.finder.chipSelected,
  },
  chipLabel: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  chipBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.finder.filterBadge,
  },
  chipBadgeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.brandBlue,
  },

  toggle: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.finder.toggleBorder,
    backgroundColor: palette.surface,
  },
  toggleButtonActive: {
    borderColor: palette.brandBlue,
    backgroundColor: palette.brandBlue,
  },
  toggleLabel: {
    fontSize: 15.5,
    fontWeight: '600',
    color: palette.finder.toggleText,
  },
  toggleLabelActive: {
    color: palette.onBrand,
  },

  separator: {
    height: 14,
  },

  emptyCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: palette.emptyBorder,
    backgroundColor: palette.surface,
  },
  emptyText: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    color: palette.textSecondary,
  },
  clearButton: {
    minHeight: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.brandBlue,
  },
  clearButtonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.onBrand,
  },
});
