import type { Permission } from '@assistigo/core';

/**
 * Every destination on the settings page. Kept as data so a test can check that each `href` has a
 * page behind it: three of these once linked to routes that did not exist.
 *
 * `permission: null` means every member may open it. The permission here only hides the tile; the
 * page checks again on the server.
 */
export type SettingsSectionKey =
  | 'preferences'
  | 'sessions'
  | 'security'
  | 'extension'
  | 'organization'
  | 'members'
  | 'data'
  | 'billing';

export type SettingsSection = {
  key: SettingsSectionKey;
  href: string;
  labelKey: string;
  descriptionKey: string;
  permission: Permission | null;
};

export const SETTINGS_GROUPS: readonly {
  key: 'account' | 'centre';
  sections: readonly SettingsSection[];
}[] = [
  {
    key: 'account',
    sections: [
      {
        key: 'preferences',
        href: '/settings/preferences',
        labelKey: 'settings.preferences.navLabel',
        descriptionKey: 'settings.tiles.preferences',
        permission: null,
      },
      {
        key: 'sessions',
        href: '/settings/sessions',
        labelKey: 'settings.sessions.navLabel',
        descriptionKey: 'settings.tiles.sessions',
        permission: null,
      },
      {
        key: 'security',
        href: '/settings/security',
        labelKey: 'settings.security',
        descriptionKey: 'settings.tiles.security',
        permission: null,
      },
      {
        key: 'extension',
        href: '/settings/extension',
        labelKey: 'settings.extension.title',
        descriptionKey: 'settings.tiles.extension',
        permission: null,
      },
    ],
  },
  {
    key: 'centre',
    sections: [
      {
        key: 'organization',
        href: '/settings/organization',
        labelKey: 'settings.organization',
        descriptionKey: 'settings.tiles.organization',
        permission: 'org.settings',
      },
      {
        key: 'members',
        href: '/settings/members',
        labelKey: 'settings.members',
        descriptionKey: 'settings.tiles.members',
        permission: 'member.view',
      },
      {
        key: 'data',
        href: '/settings/data',
        labelKey: 'settings.dataRetention',
        descriptionKey: 'settings.tiles.data',
        permission: 'org.settings',
      },
      {
        key: 'billing',
        href: '/billing',
        labelKey: 'nav.billing',
        descriptionKey: 'settings.tiles.billing',
        permission: 'billing.view',
      },
    ],
  },
];

/** The groups this caller may see, without any group left empty. */
export function visibleSettingsGroups(permissions: ReadonlySet<Permission>) {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter(
      (section) => section.permission === null || permissions.has(section.permission),
    ),
  })).filter((group) => group.sections.length > 0);
}

/** The account and team events listed on the security page. Never a customer event. */
export const SECURITY_ACTIVITY_ACTIONS = [
  'auth.password_changed',
  'auth.session_revoked',
  'member.invited',
  'member.accepted',
  'member.removed',
  'member.role_changed',
  'organization.updated',
] as const;
