/**
 * The family members for a screen, read from the encrypted vault each time the screen comes into
 * view and after any vault change, plus whose documents are showing (`active-member.ts`) —
 * already resolved, so a member removed elsewhere falls back to the citizen.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslation } from '../i18n/I18nProvider';
import { listFamilyMembers, onVaultChanged } from '../vault/vault-storage';
import { setActiveMember, useActiveMemberChoice } from './active-member';
import {
  type FamilyMember,
  type MemberId,
  memberLabels,
  relationLabelKey,
  resolveMember,
} from './family';

export type FamilyState = {
  /** The members have been read once (or the vault could not be read). */
  readonly loaded: boolean;
  readonly members: readonly FamilyMember[];
  /** Display label per member id. */
  readonly labels: ReadonlyMap<string, string>;
  /** Whose documents are showing: the citizen (`null`) or a member that exists. */
  readonly active: MemberId;
  readonly setActive: (memberId: MemberId) => void;
  /** "You" for the citizen, otherwise the member's label. */
  readonly labelOf: (memberId: MemberId) => string;
  /** Reads the members again. */
  readonly reload: () => void;
};

const NO_MEMBERS: readonly FamilyMember[] = [];

export function useFamily(): FamilyState {
  const { t } = useTranslation();
  /** Null until the first read, so a member chosen earlier is not mistaken for a removed one. */
  const [members, setMembers] = useState<readonly FamilyMember[] | null>(null);
  const choice = useActiveMemberChoice();

  const reload = useCallback(() => {
    listFamilyMembers().then(
      (listed) => setMembers(listed),
      // An unreadable vault has no members to show; the screen reports the vault itself.
      () => setMembers([]),
    );
  }, []);

  useFocusEffect(reload);
  useEffect(() => onVaultChanged(reload), [reload]);

  const listed = members ?? NO_MEMBERS;
  const labels = useMemo(
    () => memberLabels(members ?? NO_MEMBERS, (relation) => t(relationLabelKey(relation))),
    [members, t],
  );
  // A member removed elsewhere reads as the citizen here. The stored choice is left alone: a
  // member just added may not be in this screen's list yet, and must not be switched away from.
  const active = members === null ? choice : resolveMember(members, choice);

  const labelOf = useCallback(
    (memberId: MemberId) =>
      memberId === null ? t('family.you') : (labels.get(memberId) ?? t('family.you')),
    [labels, t],
  );

  return {
    loaded: members !== null,
    members: listed,
    labels,
    active,
    setActive: setActiveMember,
    labelOf,
    reload,
  };
}
