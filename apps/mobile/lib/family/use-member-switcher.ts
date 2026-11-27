/**
 * Everything a tab needs for its member switcher: the family (`use-family.ts`), the chips with
 * their expiry dots worked out from all the vault's documents, and what tapping does. "Add"
 * opens the Family screen's add flow.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useTranslation } from '../i18n/I18nProvider';
import type { VaultDocument } from '../vault/vault-index';
import {
  expiryAlerts,
  MAX_FAMILY_MEMBERS,
  type MemberChip,
  memberIdFromValue,
  memberValue,
  switcherChips,
} from './family';
import { type FamilyState, useFamily } from './use-family';

export type MemberSwitcherState = {
  readonly family: FamilyState;
  readonly chips: readonly MemberChip[];
  readonly selected: string;
  readonly onSelect: (value: string) => void;
  /** Absent when the family is full. */
  readonly onAdd?: () => void;
};

export function useMemberSwitcher(
  allDocuments: readonly VaultDocument[],
  now: Date,
): MemberSwitcherState {
  const { t } = useTranslation();
  const router = useRouter();
  const family = useFamily();
  const { members, labels, setActive } = family;

  const chips = useMemo(
    () => switcherChips(members, labels, expiryAlerts(allDocuments, now), t('family.you')),
    [allDocuments, labels, members, now, t],
  );
  const onSelect = useCallback(
    (value: string) => setActive(memberIdFromValue(value)),
    [setActive],
  );
  const onAdd = useCallback(() => {
    router.push({ pathname: '/family', params: { add: '1' } });
  }, [router]);

  return {
    family,
    chips,
    selected: memberValue(family.active),
    onSelect,
    ...(members.length < MAX_FAMILY_MEMBERS ? { onAdd } : {}),
  };
}
