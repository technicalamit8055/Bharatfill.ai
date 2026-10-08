/**
 * Guards pre-launch mode: sign-ups close only on an explicit `off`, the follow link is passed
 * through as configured, and the launch notice's copy resolves in both catalogues.
 */

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import hi from '../../messages/hi.json';
import { launchStateFrom } from './state';

const RENDERED_KEYS = [
  'launch.pill',
  'launch.title',
  'launch.body',
  'launch.offerLead',
  'launch.offerHighlight',
  'launch.channelCta',
  'launch.haveAccount',
  'launch.close',
  'auth.signupsClosed',
  ...[
    'whatsapp',
    'shopName',
    'city',
    'shopNamePlaceholder',
    'cityPlaceholder',
    'consent',
    'submit',
    'joinedTitle',
    'joinedBody',
    'whatsappInvalid',
    'shopNameInvalid',
    'cityInvalid',
    'consentRequired',
    'busy',
    'closed',
  ].map((key) => `launch.form.${key}`),
  ...[
    'title',
    'subtitle',
    'totalCount',
    'export',
    'loadFailed',
    'privacyNote',
    'joined',
    'whatsapp',
    'shopName',
    'city',
    'language',
    'actions',
    'delete',
    'confirmDelete',
    'deleted',
    'empty',
    'range',
    'previous',
    'next',
  ].map((key) => `admin.launchLeads.${key}`),
  'admin.nav.launchLeads',
];

function lookup(dictionary: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      dictionary,
    );
}

describe('launchStateFrom', () => {
  it('keeps sign-ups open unless they are switched off', () => {
    expect(launchStateFrom({ SIGNUPS_ENABLED: 'on', LAUNCH_CHANNEL_URL: undefined })).toEqual({
      signupsOpen: true,
      channelUrl: null,
    });
  });

  it('closes sign-ups in pre-launch mode and passes the channel link through', () => {
    expect(
      launchStateFrom({
        SIGNUPS_ENABLED: 'off',
        LAUNCH_CHANNEL_URL: 'https://whatsapp.com/channel/example',
      }),
    ).toEqual({ signupsOpen: false, channelUrl: 'https://whatsapp.com/channel/example' });
  });
});

describe('launch notice catalogue', () => {
  it.each([
    ['en', en],
    ['hi', hi],
  ])('resolves every rendered key in %s', (_locale, dictionary) => {
    for (const key of RENDERED_KEYS) {
      const value = lookup(dictionary, key);
      expect(typeof value, key).toBe('string');
      expect(value, key).not.toBe('');
    }
  });

  it.each([
    ['en', en],
    ['hi', hi],
  ])('names the product in the title so it can be highlighted (%s)', (_locale, dictionary) => {
    expect(String(lookup(dictionary, 'launch.title'))).toContain(String(lookup(dictionary, 'app.name')));
  });
});
