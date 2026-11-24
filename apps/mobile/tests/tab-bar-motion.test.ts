/**
 * The tab bar's motion data. Every sequence must end at rest: `play` idles at 1, and is held
 * there when the phone removes animations, so a track that ends elsewhere would leave a selected
 * icon permanently distorted.
 */

import { describe, expect, it } from 'vitest';

import { tabBarPalette } from '../components/navigation/palette';
import { TAB_ICONS, type TabIconArt } from '../components/navigation/tab-icons';
import {
  bakeTrack,
  ICON_POP,
  PILL_OPEN,
  restValue,
  TAB_MOTION,
  type TabMotionTrack,
} from '../components/navigation/tab-motion';

const ICONS: readonly (readonly [string, TabIconArt])[] = Object.entries(TAB_ICONS);

const TRACKS: readonly (readonly [string, TabMotionTrack])[] = [
  ['icon pop', ICON_POP],
  ['pill', PILL_OPEN],
  ...ICONS.flatMap(([name, art]) =>
    art.layers.flatMap((layer, index) =>
      (layer.motion ?? []).map((track) => [`${name} layer ${index}`, track] as const),
    ),
  ),
];

describe('tab icon sequences', () => {
  it.each(TRACKS)('%s runs from 0 to 1 and ends at rest', (_name, track) => {
    const times = track.keys.map(([at]) => at);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(1);
    expect(track.keys.at(-1)?.[1]).toBe(restValue(track.prop));
    // The native driver needs input ranges that only increase.
    const { inputRange, outputRange } = bakeTrack(track);
    expect(outputRange).toHaveLength(inputRange.length);
    inputRange.slice(1).forEach((at, index) => expect(at).toBeGreaterThan(inputRange[index]!));
  });

  it.each(ICONS)('%s moves, and draws only valid layers', (_name, art) => {
    expect(art.layers.some((layer) => layer.motion !== undefined)).toBe(true);
    for (const layer of art.layers) {
      expect(layer.fill ?? layer.stroke).toBeDefined();
      for (const d of layer.paths) expect(d).toMatch(/^M/);
    }
  });

  it('has a still outline for every tab that can be unselected', () => {
    // Scan is the raised circle: it is always drawn solid.
    for (const [name, art] of ICONS) {
      expect(art.outline.length > 0, name).toBe(name !== 'scan');
    }
  });

  it('stays short', () => {
    expect(TAB_MOTION.playMs).toBeLessThanOrEqual(600);
    expect(TAB_MOTION.selectMs).toBeLessThanOrEqual(200);
  });
});

describe('bakeTrack', () => {
  it('passes through every keyframe', () => {
    const { inputRange, outputRange } = bakeTrack(ICON_POP);
    for (const [at, value] of ICON_POP.keys) {
      expect(outputRange[inputRange.indexOf(at)]).toBe(value);
    }
  });

  it('scales slides to pixels but leaves scales alone', () => {
    const keys = [
      [0, 4],
      [1, 0],
    ] as const;
    expect(bakeTrack({ prop: 'translateY', keys }, 2).outputRange[0]).toBe(8);
    expect(bakeTrack({ prop: 'scale', keys }, 2).outputRange[0]).toBe(4);
  });
});

describe('tab bar palette', () => {
  it.each(['light', 'dark'] as const)('%s keeps the selected tab distinct', (scheme) => {
    const palette = tabBarPalette(scheme);
    expect(palette.active).not.toBe(palette.inactive);
    expect(palette.activePill).not.toBe(palette.bar);
    expect(palette.activeSoft).not.toBe(palette.active);
  });
});
