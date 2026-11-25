import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isAuditAction, permissionsFor, type OrgRole } from '@assistigo/core';
import { createTranslator } from '../i18n';
import { organizationProfileSchema } from './organization';
import { SECURITY_ACTIVITY_ACTIONS, SETTINGS_GROUPS, visibleSettingsGroups } from './sections';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app/(app)');
const ALL = SETTINGS_GROUPS.flatMap((group) => [...group.sections]);
const hrefsFor = (role: OrgRole) =>
  visibleSettingsGroups(permissionsFor(role)).flatMap((group) => group.sections.map((s) => s.href));

describe('settings sections', () => {
  it.each(ALL.map((section) => section.href))('%s has a page behind it', (href) => {
    expect(existsSync(path.join(APP_DIR, href, 'page.tsx'))).toBe(true);
  });

  it.each(['en', 'hi'] as const)('every label exists in %s', (locale) => {
    const t = createTranslator(locale);
    const keys = [
      ...ALL.flatMap((section) => [section.labelKey, section.descriptionKey]),
      ...SETTINGS_GROUPS.map((group) => `settings.groups.${group.key}`),
      ...SECURITY_ACTIVITY_ACTIONS.map((action) => `audit.actions.${action}`),
    ];
    for (const key of keys) expect(t(key), key).not.toBe(key);
  });

  it('shows centre settings only to roles that hold the permission', () => {
    expect(hrefsFor('owner')).toHaveLength(ALL.length);
    expect(hrefsFor('operator')).toContain('/settings/security');
    expect(hrefsFor('operator')).not.toContain('/settings/organization');
    expect(hrefsFor('operator')).not.toContain('/settings/data');
    expect(hrefsFor('operator')).not.toContain('/billing');
    expect(hrefsFor('billing_admin')).toContain('/billing');
    expect(hrefsFor('billing_admin')).not.toContain('/settings/members');
  });

  it('lists only catalogued account and team events as security activity', () => {
    for (const action of SECURITY_ACTIVITY_ACTIONS) {
      expect(isAuditAction(action)).toBe(true);
      expect(action).not.toMatch(/^(customer|document)\./);
    }
  });
});

describe('organizationProfileSchema', () => {
  const valid = {
    name: ' Test Seva Kendra ',
    businessType: 'cyber_cafe',
    phone: '',
    email: '',
    city: 'Patna',
    district: ' ',
    state: 'Bihar',
    preferredLocale: 'hi',
  };

  it('trims text and clears blank fields', () => {
    expect(organizationProfileSchema.parse(valid)).toMatchObject({
      name: 'Test Seva Kendra',
      phone: null,
      email: null,
      district: null,
      city: 'Patna',
    });
  });

  it.each(['0000000000', '+91 00000 00000', '0612-0000000'])('accepts phone %s', (phone) => {
    expect(organizationProfileSchema.safeParse({ ...valid, phone }).success).toBe(true);
  });

  it.each([
    { phone: 'call me' },
    { phone: '123' },
    { email: 'nope' },
    { name: 'x' },
    { businessType: 'bank' },
  ])('rejects %o', (patch) => {
    expect(organizationProfileSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it('drops columns a centre must not set here', () => {
    const parsed = organizationProfileSchema.parse({ ...valid, plan_code: 'x', settings: {} });
    expect(parsed).not.toHaveProperty('plan_code');
    expect(parsed).not.toHaveProperty('settings');
  });
});
