/**
 * Bottom tab bar colour tokens, one set per colour scheme.
 *
 * The light set is taken from the Home mockup (the same brand blue as the Home dashboard's
 * buttons), so the bar matches the screen it was designed with. The dark set keeps the bar
 * usable on the themed tabs in dark mode. Values live here so the tab bar obeys the "no hex
 * literals in a component" rule.
 */

import type { ColorScheme } from '../../theme';

export type TabBarPalette = {
  readonly bar: string;
  readonly barShadow: string;
  readonly active: string;
  /** Second tone in a selected icon (the folder's back, Connect's links). */
  readonly activeSoft: string;
  /** Detail cut out of a selected icon (the door, the page in the folder). */
  readonly activeCutout: string;
  /** Pill behind the selected icon. */
  readonly activePill: string;
  readonly inactive: string;
  readonly scanButton: string;
  readonly scanButtonPressed: string;
  readonly scanIcon: string;
};

const light: TabBarPalette = {
  bar: '#FFFFFF',
  barShadow: '#1E3A8A',
  active: '#0066FF',
  activeSoft: '#7FB2FF',
  activeCutout: '#FFFFFF',
  activePill: '#E3EDFF',
  inactive: '#64748B',
  scanButton: '#0066FF',
  scanButtonPressed: '#0052CC',
  scanIcon: '#FFFFFF',
};

const dark: TabBarPalette = {
  bar: '#151A25',
  barShadow: '#000000',
  active: '#5999FF',
  activeSoft: '#2F62B8',
  activeCutout: '#151A25',
  activePill: '#1D2C4A',
  inactive: '#98A1B2',
  scanButton: '#0066FF',
  scanButtonPressed: '#0052CC',
  scanIcon: '#FFFFFF',
};

export function tabBarPalette(scheme: ColorScheme): TabBarPalette {
  return scheme === 'dark' ? dark : light;
}
