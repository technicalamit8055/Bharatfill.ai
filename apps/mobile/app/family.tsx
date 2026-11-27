/**
 * Family route — `/family`, from Profile → Family members, or `/family?add=1` from the member
 * switcher's "Add". The screen lives in `components/family/FamilyScreen.tsx`; this route reads
 * the encrypted vault and owns adding, renaming, changing the relation and removing members.
 *
 * Adding asks for the relation, then an optional name. Opened from the switcher, a new member
 * becomes the one on show and the citizen goes straight back, so their next scan is filed under
 * them. Removing a member deletes their documents from this phone, after saying how many.
 * Nothing here is sent anywhere: members and their documents stay in the on-phone vault.
 */

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pencil, Trash2, Users } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TextEntrySheet } from '../components/document-details/DocumentSheets';
import { FamilyScreen, type FamilyScreenState } from '../components/family/FamilyScreen';
import { OptionSheet } from '../components/registration/OptionSheet';
import { showActionSheet, showDialog } from '../lib/dialog/dialog-store';
import {
  documentsOf,
  FAMILY_RELATIONS,
  type FamilyMember,
  type FamilyRelation,
  familyRows,
  MAX_FAMILY_MEMBERS,
  MAX_MEMBER_NAME_LENGTH,
  memberIdFromValue,
  memberLabels,
  normaliseMemberName,
  relationLabelKey,
} from '../lib/family/family';
import { setActiveMember, useActiveMemberChoice } from '../lib/family/active-member';
import { useReminderCopy } from '../lib/family/use-reminder-copy';
import { useTranslation } from '../lib/i18n/I18nProvider';
import { membersOf, type VaultIndex } from '../lib/vault/vault-index';
import {
  addFamilyMember,
  readVaultIndex,
  removeFamilyMember,
  updateFamilyMember,
} from '../lib/vault/vault-storage';

/** What is being asked: the relation for a new member, then its name; or an edit. */
type Sheet =
  | { readonly kind: 'newRelation' }
  | { readonly kind: 'newName'; readonly relation: FamilyRelation }
  | { readonly kind: 'rename'; readonly member: FamilyMember }
  | { readonly kind: 'relation'; readonly member: FamilyMember }
  | null;

export default function FamilyRoute() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ add?: string }>();
  const fromSwitcher = params.add === '1';
  const choice = useActiveMemberChoice();
  const reminderCopy = useReminderCopy();

  const [index, setIndex] = useState<VaultIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(fromSwitcher ? { kind: 'newRelation' } : null);
  const [now, setNow] = useState(() => new Date());
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++latestLoad.current;
    try {
      const read = await readVaultIndex();
      if (ticket !== latestLoad.current) return;
      setIndex(read);
      setFailed(false);
      setNow(new Date());
    } catch {
      if (ticket === latestLoad.current) setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const relationLabel = useCallback(
    (relation: FamilyRelation) => t(relationLabelKey(relation)),
    [t],
  );
  const members = index ? membersOf(index) : [];
  const labels = memberLabels(members, relationLabel);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router]);

  const showError = useCallback(
    (key: string) => {
      showDialog(t('common.errorTitle'), t(key), [{ text: t('common.ok') }], { tone: 'danger' });
    },
    [t],
  );

  // A full family cannot take another: say so instead of opening the add sheet.
  useEffect(() => {
    if (sheet?.kind === 'newRelation' && index && members.length >= MAX_FAMILY_MEMBERS) {
      setSheet(null);
      showDialog(t('family.fullTitle'), t('family.full'), [{ text: t('common.ok') }]);
    }
  }, [index, members.length, sheet, t]);

  const add = useCallback(
    async (relation: FamilyRelation, rawName: string) => {
      try {
        const member = await addFamilyMember({ relation, name: normaliseMemberName(rawName) });
        if (fromSwitcher) {
          setActiveMember(member.id);
          back();
          return;
        }
        await load();
      } catch (error) {
        showError(error instanceof RangeError ? 'family.full' : 'family.errors.add');
      }
    },
    [back, fromSwitcher, load, showError],
  );

  const change = useCallback(
    async (member: FamilyMember, update: Parameters<typeof updateFamilyMember>[1]) => {
      try {
        await updateFamilyMember(member.id, update, reminderCopy);
      } catch {
        showError('family.errors.update');
      }
      await load();
    },
    [load, reminderCopy, showError],
  );

  const confirmRemove = useCallback(
    (member: FamilyMember) => {
      const label = labels.get(member.id) ?? relationLabel(member.relation);
      const count = index ? documentsOf(index.documents, member.id).length : 0;
      const remove = async () => {
        try {
          await removeFamilyMember(member.id);
          if (choice === member.id) setActiveMember(null);
        } catch {
          showError('family.errors.remove');
        }
        await load();
      };
      showDialog(
        t('family.remove.title', { name: label }),
        count === 0
          ? t('family.remove.bodyEmpty', { name: label })
          : t('family.remove.body', { name: label, count }),
        [
          { text: t('family.cancel'), style: 'cancel' },
          { text: t('family.remove.confirm'), style: 'destructive', onPress: () => void remove() },
        ],
        { icon: Trash2 },
      );
    },
    [choice, index, labels, load, relationLabel, showError, t],
  );

  const actions = useCallback(
    (value: string) => {
      const member = members.find((each) => each.id === value);
      if (!member) return;
      showActionSheet({
        title: labels.get(member.id) ?? relationLabel(member.relation),
        cancelLabel: t('family.cancel'),
        actions: [
          {
            key: 'rename',
            label: t('family.actions.rename'),
            icon: Pencil,
            onPress: () => setSheet({ kind: 'rename', member }),
          },
          {
            key: 'relation',
            label: t('family.actions.relation'),
            icon: Users,
            onPress: () => setSheet({ kind: 'relation', member }),
          },
          {
            key: 'remove',
            label: t('family.actions.remove'),
            icon: Trash2,
            destructive: true,
            onPress: () => confirmRemove(member),
          },
        ],
      });
    },
    [confirmRemove, labels, members, relationLabel, t],
  );

  const open = useCallback(
    (value: string) => {
      setActiveMember(memberIdFromValue(value));
      router.navigate('/(tabs)/vault');
    },
    [router],
  );

  const state: FamilyScreenState = failed
    ? { status: 'error' }
    : index === null
      ? { status: 'loading' }
      : {
          status: 'ready',
          canAdd: members.length < MAX_FAMILY_MEMBERS,
          rows: familyRows({
            members,
            labels,
            documents: index.documents,
            now,
            active: members.some((member) => member.id === choice) ? choice : null,
            youLabel: t('family.you'),
            relationLabel,
          }),
        };

  const relationOptions = FAMILY_RELATIONS.map((relation) => ({
    value: relation,
    label: relationLabel(relation),
  }));

  return (
    <>
      <FamilyScreen
        state={state}
        onBack={back}
        onAdd={() => setSheet({ kind: 'newRelation' })}
        onOpen={open}
        onActions={actions}
      />

      {sheet?.kind === 'newRelation' && index ? (
        <OptionSheet
          title={t('family.addSheet.relationTitle')}
          closeLabel={t('family.cancel')}
          options={relationOptions}
          selected={null}
          onSelect={(relation) => setSheet({ kind: 'newName', relation })}
          onClose={() =>
            setSheet((current) => (current?.kind === 'newRelation' ? null : current))
          }
        />
      ) : null}

      {sheet?.kind === 'newName' ? (
        <TextEntrySheet
          title={t('family.addSheet.nameTitle', { relation: relationLabel(sheet.relation) })}
          closeLabel={t('family.cancel')}
          inputLabel={t('family.addSheet.nameLabel')}
          placeholder={t('family.addSheet.namePlaceholder')}
          maxLength={MAX_MEMBER_NAME_LENGTH}
          submitLabel={t('family.addSheet.submit')}
          onSubmit={(raw) => {
            void add(sheet.relation, raw);
            return null;
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.kind === 'rename' ? (
        <TextEntrySheet
          title={t('family.actions.rename')}
          closeLabel={t('family.cancel')}
          inputLabel={t('family.addSheet.nameLabel')}
          placeholder={t('family.addSheet.namePlaceholder')}
          initialValue={sheet.member.name ?? ''}
          maxLength={MAX_MEMBER_NAME_LENGTH}
          submitLabel={t('family.save')}
          onSubmit={(raw) => {
            void change(sheet.member, { name: normaliseMemberName(raw) });
            return null;
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {sheet?.kind === 'relation' ? (
        <OptionSheet
          title={t('family.actions.relation')}
          closeLabel={t('family.cancel')}
          options={relationOptions}
          selected={sheet.member.relation}
          onSelect={(relation) => {
            if (relation !== sheet.member.relation) void change(sheet.member, { relation });
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </>
  );
}
