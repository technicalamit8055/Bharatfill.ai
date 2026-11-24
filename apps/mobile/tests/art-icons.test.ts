/**
 * Every tile that shows a soft-3D icon uses its own key as the icon's name, so each key must
 * resolve to artwork that keeps the house rules (`scripts/generate-art-icons.mjs`).
 */

import { describe, expect, it } from 'vitest';

import { ART_ICONS, ART_TINTS, type ArtIconName } from '../components/art-icon/art-icons.generated';
import { artIconTint } from '../components/art-icon/tint';
import type { ArtIconArt } from '../components/art-icon/types';
import { CONNECT_ACTIONS } from '../lib/connect/connect-screen';
import { QUICK_ACTIONS } from '../lib/home/dashboard';
import { VAULT_CATEGORIES } from '../lib/vault/categories';

const USED: readonly ArtIconName[] = [
  ...QUICK_ACTIONS,
  ...VAULT_CATEGORIES,
  ...CONNECT_ACTIONS,
  'scan',
  'vault',
  'forms',
  'reach',
];
const ICONS: readonly (readonly [string, ArtIconArt])[] = Object.entries(ART_ICONS);

describe('art icons', () => {
  it.each(USED)('resolves %s', (name) => {
    expect(ART_ICONS[name].shapes.length).toBeGreaterThan(0);
  });

  it('draws no icon that no tile uses', () => {
    expect([...USED].sort()).toEqual(Object.keys(ART_ICONS).sort());
  });

  it.each(ICONS)('%s has at most three gradients and only paints that exist', (_name, art) => {
    expect(art.gradients.length).toBeLessThanOrEqual(3);
    for (const shape of art.shapes) {
      expect(shape.d).toMatch(/^M/);
      expect(shape.fill ?? shape.stroke).toBeDefined();
      for (const paint of [shape.fill, shape.stroke]) {
        if (paint === undefined || paint.startsWith('#')) continue;
        expect(art.gradients[Number(paint.slice(1))]).toBeDefined();
      }
    }
  });

  it.each(USED)('%s has a light and a dark tint', (name) => {
    const tints = ART_TINTS[ART_ICONS[name].hue];
    expect(artIconTint(name)).toBe(tints.light);
    expect(artIconTint(name, 'dark')).toBe(tints.dark);
    expect(tints.light).not.toBe(tints.dark);
  });
});
