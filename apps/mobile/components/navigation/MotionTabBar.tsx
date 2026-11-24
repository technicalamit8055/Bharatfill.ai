/**
 * A bottom bar of micro-animated tabs. It knows nothing about navigation: give it items, the
 * active key and a press handler (`AppTabBar` does that for Expo Router).
 *
 * - Unselected tabs are still: a grey outline and a label.
 * - A tab that becomes selected crossfades to the brand colour, opens a pill behind its icon and
 *   plays the icon's short sequence once. Pressing the selected tab plays it again.
 * - A `raised` item is a solid circle over the bar. It plays its sequence on touch, since it
 *   usually opens something instead of becoming the selected tab.
 *
 * Every animation runs on the native driver, so it stays smooth while the next screen mounts.
 * With the phone's animations removed, nothing moves and only the colours change.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import type { TabBarPalette } from './palette';
import type { TabIconName } from './tab-icons';
import { bakeTrack, PILL_OPEN, TAB_MOTION } from './tab-motion';
import { TabIconLayers, TabIconOutline } from './TabIcon';
import { useReduceMotion } from './useReduceMotion';

export type MotionTabItem = {
  readonly key: string;
  /** Already translated. Also what a screen reader announces. */
  readonly label: string;
  /** A tab without an icon shows its label alone. */
  readonly icon?: TabIconName | undefined;
  /** Draw as the circle rising over the bar. */
  readonly raised?: boolean;
};

export type MotionTabBarProps = {
  readonly items: readonly MotionTabItem[];
  readonly activeKey: string | undefined;
  readonly onPress: (key: string) => void;
  readonly onLongPress?: (key: string) => void;
  readonly palette: TabBarPalette;
  /** Background of the screen above, painted behind the raised circle. */
  readonly backdropColor: string;
  readonly bottomInset?: number;
};

const BAR_PADDING_TOP = 8;
const OUTLINE_SIZE = 25;
/** Drawn at its resting size, not scaled up to it, so the vector stays sharp. */
const ACTIVE_SIZE = 27;
const ICON_SLOT = 32;
const PILL_WIDTH = 58;
const LABEL_GAP = 4;
const RAISED_SIZE = 58;
const RAISED_ICON_SIZE = 28;
const RAISED_LABEL_GAP = 4;
/** How far the circle rises above the bar, so its label lines up with the others. */
const RAISED_RISE = RAISED_SIZE + RAISED_LABEL_GAP - (ICON_SLOT + LABEL_GAP) - BAR_PADDING_TOP;

const PILL_RANGES = bakeTrack(PILL_OPEN);

export function MotionTabBar({
  items,
  activeKey,
  onPress,
  onLongPress,
  palette,
  backdropColor,
  bottomInset = 0,
}: MotionTabBarProps) {
  const reduceMotion = useReduceMotion();
  const hasRaised = items.some((item) => item.raised);

  const tabs = items.map((item): TabProps => ({
    item,
    active: item.key === activeKey,
    palette,
    reduceMotion,
    onPress: () => onPress(item.key),
    onLongPress: () => onLongPress?.(item.key),
  }));

  return (
    // The navigator lays the bar out under the screens, not over them, so the bar reserves the
    // strip the circle rises into. Android also needs the circle inside its parent to be tapped.
    <View style={{ backgroundColor: backdropColor, paddingTop: hasRaised ? RAISED_RISE : 0 }}>
      <View
        style={[
          styles.bar,
          {
            backgroundColor: palette.bar,
            shadowColor: palette.barShadow,
            paddingBottom: Math.max(bottomInset, 10),
          },
        ]}
      >
        {tabs.map((tab) =>
          tab.item.raised ? (
            <RaisedLabel key={tab.item.key} {...tab} />
          ) : (
            <TabButton key={tab.item.key} {...tab} />
          ),
        )}
      </View>

      {/* Same slots as the bar, so the circle sits exactly over its own label. */}
      {hasRaised ? (
        <View style={styles.overlay}>
          {tabs.map((tab) =>
            tab.item.raised ? (
              <View key={tab.item.key} style={styles.overlaySlot}>
                <RaisedButton {...tab} />
              </View>
            ) : (
              <View key={tab.item.key} style={[styles.overlaySlot, styles.passThrough]} />
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

type TabProps = {
  readonly item: MotionTabItem;
  readonly active: boolean;
  readonly palette: TabBarPalette;
  readonly reduceMotion: boolean;
  readonly onPress: () => void;
  readonly onLongPress: () => void;
};

function TabButton({ item, active, palette, reduceMotion, onPress, onLongPress }: TabProps) {
  const select = useSelection(active);
  const { play, replay } = usePlay(reduceMotion);
  const press = usePressScale(reduceMotion);

  // The first selected tab is simply shown selected; only a change plays the sequence.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) replay();
    wasActive.current = active;
  }, [active, replay]);

  const handlePress = () => {
    if (active) replay();
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: active }}
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.item}
    >
      <Animated.View style={[styles.iconSlot, { transform: [{ scale: press.scale }] }]}>
        <Animated.View
          style={[
            styles.pill,
            {
              backgroundColor: palette.activePill,
              opacity: select,
              transform: [{ scaleX: play.interpolate(PILL_RANGES) }],
            },
          ]}
        />
        {item.icon ? (
          <>
            <Animated.View style={[styles.glyph, { opacity: inverse(select) }]}>
              <TabIconOutline name={item.icon} size={OUTLINE_SIZE} color={palette.inactive} />
            </Animated.View>
            <Animated.View style={[styles.glyph, { opacity: select }]}>
              <TabIconLayers
                name={item.icon}
                size={ACTIVE_SIZE}
                colors={{
                  solid: palette.active,
                  soft: palette.activeSoft,
                  cutout: palette.activeCutout,
                }}
                play={play}
              />
            </Animated.View>
          </>
        ) : null}
      </Animated.View>
      <TabLabel label={item.label} select={select} palette={palette} />
    </Pressable>
  );
}

/**
 * The label under the raised circle is a second, larger target for the same item. Screen readers
 * get the circle alone, so it is announced once.
 */
function RaisedLabel({ item, active, palette, onPress, onLongPress }: TabProps) {
  const select = useSelection(active);
  return (
    <Pressable
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.item}
    >
      <View style={styles.iconSlot} />
      <TabLabel label={item.label} select={select} palette={palette} />
    </Pressable>
  );
}

function RaisedButton({ item, active, palette, reduceMotion, onPress, onLongPress }: TabProps) {
  const { play, replay } = usePlay(reduceMotion);
  const press = usePressScale(reduceMotion);

  const handlePressIn = () => {
    press.onPressIn();
    replay();
  };

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.raised,
          {
            backgroundColor: pressed ? palette.scanButtonPressed : palette.scanButton,
            shadowColor: palette.scanButton,
          },
        ]}
      >
        {item.icon ? (
          <TabIconLayers
            name={item.icon}
            size={RAISED_ICON_SIZE}
            pop={false}
            colors={{
              solid: palette.scanIcon,
              soft: palette.scanIcon,
              cutout: palette.scanButton,
            }}
            play={play}
          />
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** Two stacked labels crossfading: the native driver cannot animate a text colour or weight. */
function TabLabel({
  label,
  select,
  palette,
}: {
  readonly label: string;
  readonly select: Animated.Value;
  readonly palette: TabBarPalette;
}) {
  return (
    <View style={styles.labelSlot}>
      <Animated.Text
        numberOfLines={1}
        style={[styles.label, { color: palette.inactive, opacity: inverse(select) }]}
      >
        {label}
      </Animated.Text>
      <Animated.Text
        numberOfLines={1}
        style={[styles.label, styles.labelActive, { color: palette.active, opacity: select }]}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

function inverse(value: Animated.Value) {
  return value.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
}

/** Fades 0 to 1 as the tab becomes selected. */
function useSelection(active: boolean): Animated.Value {
  const select = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(select, {
      toValue: active ? 1 : 0,
      duration: active ? TAB_MOTION.selectMs : TAB_MOTION.deselectMs,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [active, select]);
  return select;
}

/** The sequence clock. It rests at 1, where every layer is exactly as drawn. */
function usePlay(reduceMotion: boolean): { play: Animated.Value; replay: () => void } {
  const play = useRef(new Animated.Value(1)).current;
  const replay = useCallback(() => {
    play.stopAnimation();
    if (reduceMotion) {
      play.setValue(1);
      return;
    }
    play.setValue(0);
    // Linear: the easing is baked into each track's keyframes.
    Animated.timing(play, {
      toValue: 1,
      duration: TAB_MOTION.playMs,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [play, reduceMotion]);
  useEffect(() => () => play.stopAnimation(), [play]);
  return { play, replay };
}

/** A small squeeze while the finger is down, springing back on release. */
function usePressScale(reduceMotion: boolean) {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (toValue: number) =>
    Animated.spring(scale, { toValue, speed: 40, bounciness: 8, useNativeDriver: true }).start();
  return {
    scale,
    onPressIn: () => {
      if (!reduceMotion) springTo(TAB_MOTION.pressScale);
    },
    // Always springs back, in case the setting changed while the finger was down.
    onPressOut: () => springTo(1),
  };
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: BAR_PADDING_TOP,
    paddingHorizontal: 6,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
  },
  iconSlot: {
    width: PILL_WIDTH,
    height: ICON_SLOT,
  },
  pill: {
    ...StyleSheet.absoluteFill,
    borderRadius: ICON_SLOT / 2,
  },
  glyph: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The crossfading labels overlap, so the bold one (always the wider) sets the slot's height.
  labelSlot: {
    alignSelf: 'stretch',
    marginTop: LABEL_GAP,
  },
  label: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '500',
  },
  labelActive: {
    position: 'relative',
    fontWeight: '700',
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingHorizontal: 6,
    // Android draws siblings by elevation, so the circle must out-rank the bar's shadow.
    zIndex: 1,
    elevation: 14,
    pointerEvents: 'box-none',
  },
  overlaySlot: {
    flex: 1,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  passThrough: {
    pointerEvents: 'none',
  },
  raised: {
    width: RAISED_SIZE,
    height: RAISED_SIZE,
    borderRadius: RAISED_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 14,
  },
});
