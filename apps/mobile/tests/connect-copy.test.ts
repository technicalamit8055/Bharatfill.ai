/**
 * Guards the Connect tab copy: every key the screen renders, including the ones built from an
 * action, a help topic, a centre's services or an unavailable feature, must resolve in both
 * catalogues — and keep the placeholders the screen fills in.
 */

import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import hi from '../messages/hi.json';
import {
  CONNECT_ACTIONS,
  CSC_HELP_TOPICS,
  CSC_OFFERINGS,
  WEEKDAYS,
} from '../lib/connect/connect-screen';
import { NEARBY_VIEWS } from '../lib/connect/nearby-search';

const RENDERED_KEYS = [
  'share.title',
  'connect.heading',
  'connect.subtitle',
  'connect.help',
  'connect.about.title',
  'connect.about.body',
  'connect.hero.title',
  'connect.hero.body',
  'connect.hero.action',
  ...CONNECT_ACTIONS.flatMap((action) => [
    `connect.actions.${action}.title`,
    `connect.actions.${action}.body`,
  ]),
  // Find Nearby opens Nearby CSC Centers; the other actions are not live yet.
  ...CONNECT_ACTIONS.filter((action) => action !== 'find_nearby').map(
    (action) => `connect.unavailable.${action}`,
  ),
  ...Object.keys(en.connect.nearby).map((key) => `connect.nearby.${key}`),
  ...Object.keys(en.connect.finder)
    .filter((key) => key !== 'views')
    .map((key) => `connect.finder.${key}`),
  ...NEARBY_VIEWS.map((view) => `connect.finder.views.${view}`),
  ...CSC_OFFERINGS.map((offering) => `connect.offerings.${offering}`),
  'connect.services.title',
  'connect.services.viewAll',
  'connect.services.viewAllHint',
  ...CSC_HELP_TOPICS.flatMap((topic) => [
    `connect.services.${topic}.title`,
    `connect.services.${topic}.caption`,
  ]),
  'connect.unavailable.services',
  'connect.unavailable.location',
  'connect.unavailable.directions',
  'connect.unavailable.notify',
  'connect.unavailable.call',
  'connect.unavailable.service',
  ...Object.entries(en.connect.centre)
    .filter(([, value]) => typeof value === 'string')
    .map(([key]) => `connect.centre.${key}`),
  ...WEEKDAYS.map((day) => `connect.centre.weekdays.${day}`),
  ...CSC_OFFERINGS.flatMap((offering) => [
    `connect.centre.offerings.${offering}.title`,
    `connect.centre.offerings.${offering}.caption`,
  ]),
  'common.errorTitle',
  'common.comingSoon',
  'common.ok',
];

/** Keys whose copy must keep a placeholder the screen interpolates. */
const PLACEHOLDERS: Record<string, readonly string[]> = {
  'connect.nearby.distanceMeters': ['{distance}'],
  'connect.nearby.distanceKm': ['{distance}'],
  'connect.nearby.moreServices': ['{count}'],
  'connect.nearby.page': ['{page}', '{count}'],
  'connect.nearby.distanceMetersShort': ['{distance}'],
  'connect.nearby.distanceKmShort': ['{distance}'],
  'connect.finder.within': ['{km}'],
  'connect.finder.filtersActive': ['{count}'],
  'connect.finder.bookmark': ['{name}'],
  'connect.finder.unbookmark': ['{name}'],
  'connect.finder.directionsTo': ['{name}'],
  'connect.finder.connectTo': ['{name}'],
  'connect.finder.notifyFor': ['{name}'],
  'connect.centre.photo': ['{name}', '{page}', '{count}'],
  'connect.centre.call': ['{phone}'],
  'connect.centre.range': ['{from}', '{to}'],
  'connect.centre.am': ['{time}'],
  'connect.centre.pm': ['{time}'],
};

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

describe('connect copy', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s', (_locale, dictionary) => {
    for (const key of RENDERED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('keeps the interpolation placeholders in %s', (_locale, dictionary) => {
    for (const [key, placeholders] of Object.entries(PLACEHOLDERS)) {
      for (const placeholder of placeholders) {
        expect(lookup(dictionary, key), key).toContain(placeholder);
      }
    }
  });

  it('defines the same connect keys in Hindi as in English', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(hi.connect).sort()).toEqual(keys(en.connect).sort());
  });

  it('tells the citizen nothing was shared or located when a feature is not live', () => {
    expect(en.connect.unavailable.share_document).toMatch(/nothing has been shared/i);
    expect(en.connect.unavailable.location).toMatch(/location has not been used/i);
  });
});
