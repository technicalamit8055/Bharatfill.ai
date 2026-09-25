/**
 * The map preview on Nearby CSC Centers: a pin for each centre on screen, the picked one green
 * with a halo and its distance, plus the locate button and "Use my current location".
 *
 * The streets, river and parks are a drawn illustration, not map tiles: a tile service would
 * learn where the citizen is looking, and choosing one is a privacy decision still to be made.
 * Pins are placed from each centre's coordinates around the searched area's middle
 * (`projectToMap`), so their layout is true to the directory even though the streets are not.
 */

import { LocateFixed, MapPin } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import RawSvg, { Circle as RawCircle, Path as RawPath, Rect as RawRect } from 'react-native-svg';

import {
  type Coordinates,
  distanceMessage,
  type NearbyCentre,
} from '../../lib/connect/connect-screen';
import { projectToMap } from '../../lib/connect/nearby-search';
import { useTranslation } from '../../lib/i18n/I18nProvider';
import { connectPalette } from './palette';

/** react-native-svg ships React 18 JSX types; re-cast so React 19 accepts them as elements. */
type SvgComponent = ComponentType<Record<string, unknown>>;

const Svg = RawSvg as unknown as SvgComponent;
const Path = RawPath as unknown as SvgComponent;
const Rect = RawRect as unknown as SvgComponent;
const Circle = RawCircle as unknown as SvgComponent;

const palette = connectPalette.map;

const PIN_SIZE = 30;
const PIN_SIZE_SELECTED = 42;
const HALO_SIZE = 96;
/** Space kept clear round the edge so pins and the distance label stay inside the map. */
const PIN_PADDING = 36;
const CONTROL_SIZE = 46;
/** Height of the strip at the bottom that holds "Use my current location". */
const LOCATION_STRIP = 64;

export type CentreMapProps = {
  readonly width: number;
  readonly height: number;
  readonly origin: Coordinates;
  readonly centres: readonly NearbyCentre[];
  readonly selectedId: string | null;
  readonly onSelectCentre: (centre: NearbyCentre) => void;
  readonly onUseLocation: () => void;
};

export function CentreMap({
  width,
  height,
  origin,
  centres,
  selectedId,
  onSelectCentre,
  onUseLocation,
}: CentreMapProps) {
  const { t } = useTranslation();

  // Pins keep above the location strip, and low enough that a pin's head is never cut off.
  const points = projectToMap(
    origin,
    centres.map((centre) => centre.coordinates),
    { width, height: height - LOCATION_STRIP, padding: PIN_PADDING },
  ).map((point) => ({ x: point.x, y: point.y + PIN_PADDING / 3 }));

  // The picked pin is drawn last so it sits on top of its neighbours.
  const order = centres
    .map((centre, index) => ({ centre, point: points[index] }))
    .sort((a, b) => Number(a.centre.id === selectedId) - Number(b.centre.id === selectedId));

  return (
    <View style={[styles.map, { width, height }]}>
      <MapArtwork width={width} height={height} />

      {order.map(({ centre, point }) => {
        if (!point) return null;
        const selected = centre.id === selectedId;
        const size = selected ? PIN_SIZE_SELECTED : PIN_SIZE;
        const distance = distanceMessage(centre.distanceMeters);
        const distanceLabel = t(distance.key, distance.values);
        const shortDistance = distanceMessage(centre.distanceMeters, 'short');
        return (
          <View key={centre.id} style={styles.pinLayer}>
            {selected ? (
              <View
                style={[
                  styles.halo,
                  { left: point.x - HALO_SIZE / 2, top: point.y - size / 2 - HALO_SIZE / 2 },
                ]}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${centre.name}, ${distanceLabel}`}
              accessibilityState={{ selected }}
              hitSlop={8}
              onPress={() => onSelectCentre(centre)}
              style={[styles.pin, { left: point.x - size / 2, top: point.y - size }]}
            >
              <MapPin
                color={selected ? palette.pinSelected : palette.pin}
                fill={selected ? palette.pinSelected : palette.pin}
                size={size}
                strokeWidth={1.2}
              />
              <View
                style={[
                  styles.pinDot,
                  {
                    width: size * 0.3,
                    height: size * 0.3,
                    borderRadius: size * 0.15,
                    top: size * 0.26,
                  },
                ]}
              />
            </Pressable>
            {selected ? (
              <View style={[styles.distanceLabel, { left: point.x - 40, top: point.y + 4 }]}>
                <Text numberOfLines={1} style={styles.distanceText}>
                  {t(shortDistance.key, shortDistance.values)}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}

      {/* Same action as the pill below, so screen readers get the pill alone. */}
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={onUseLocation}
        style={({ pressed }) => [styles.locateButton, pressed && styles.pressed]}
      >
        <LocateFixed color={connectPalette.headerIcon} size={22} strokeWidth={2.2} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('connect.finder.useLocation')}
        onPress={onUseLocation}
        style={({ pressed }) => [styles.locationPill, pressed && styles.pressed]}
      >
        <LocateFixed color={connectPalette.brandBlue} size={20} strokeWidth={2.2} />
        <Text numberOfLines={1} style={styles.locationPillLabel}>
          {t('connect.finder.useLocation')}
        </Text>
      </Pressable>
    </View>
  );
}

/** Streets, a river and parks, drawn to the map's size. Decorative only. */
function MapArtwork({ width: w, height: h }: { readonly width: number; readonly height: number }) {
  const p = (x: number, y: number) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`;

  return (
    <Svg
      width={w}
      height={h}
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Rect x={0} y={0} width={w} height={h} fill={palette.land} />

      <Circle cx={w * 0.14} cy={h * 0.78} r={Math.min(w, h) * 0.22} fill={palette.park} />
      <Circle cx={w * 0.62} cy={h * 0.18} r={Math.min(w, h) * 0.18} fill={palette.park} />
      <Circle cx={w * 0.9} cy={h * 0.62} r={Math.min(w, h) * 0.2} fill={palette.park} />

      <Path
        d={`M${p(1.05, 0.02)} C${p(0.86, 0.28)} ${p(0.8, 0.4)} ${p(0.66, 0.62)} S${p(0.5, 0.95)} ${p(0.42, 1.05)}`}
        stroke={palette.water}
        strokeWidth={Math.max(10, w * 0.05)}
        strokeLinecap="round"
        fill="none"
      />

      {[
        `M${p(0, 0.3)} C${p(0.3, 0.26)} ${p(0.55, 0.36)} ${p(1, 0.3)}`,
        `M${p(0.2, 0)} C${p(0.26, 0.4)} ${p(0.34, 0.7)} ${p(0.3, 1)}`,
        `M${p(0, 0.62)} C${p(0.4, 0.58)} ${p(0.62, 0.8)} ${p(1, 0.86)}`,
        `M${p(0.48, 0)} L${p(0.56, 0.5)} L${p(0.74, 1)}`,
        `M${p(0.72, 0)} C${p(0.76, 0.3)} ${p(0.9, 0.44)} ${p(1, 0.46)}`,
        `M${p(0, 0.12)} L${p(0.44, 0.16)}`,
        `M${p(0.08, 0.45)} L${p(0.46, 0.46)}`,
      ].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={palette.minorRoad}
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
        />
      ))}

      {[
        `M${p(0.06, 0)} C${p(0.1, 0.3)} ${p(0.08, 0.7)} ${p(0.1, 1)}`,
        `M${p(0.34, 0)} C${p(0.4, 0.24)} ${p(0.58, 0.42)} ${p(0.7, 0.56)} S${p(0.92, 0.78)} ${p(1, 0.8)}`,
      ].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={palette.majorRoad}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  map: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: palette.land,
  },
  pressed: {
    opacity: 0.7,
  },

  pinLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'box-none',
  },
  halo: {
    position: 'absolute',
    pointerEvents: 'none',
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: palette.halo,
    opacity: 0.16,
  },
  pin: {
    position: 'absolute',
    alignItems: 'center',
  },
  pinDot: {
    position: 'absolute',
    backgroundColor: palette.control,
  },
  distanceLabel: {
    position: 'absolute',
    pointerEvents: 'none',
    width: 80,
    alignItems: 'center',
  },
  distanceText: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: '700',
    color: palette.onDistanceLabel,
    backgroundColor: palette.distanceLabel,
  },

  locateButton: {
    position: 'absolute',
    right: 12,
    bottom: LOCATION_STRIP + 4,
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderRadius: CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.control,
    shadowColor: palette.controlShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  locationPill: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: palette.control,
    shadowColor: palette.controlShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  locationPillLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: connectPalette.brandBlue,
  },
});
