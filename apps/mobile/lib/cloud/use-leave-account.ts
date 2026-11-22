/**
 * The Log out and Delete account conversations: count what is on the phone, ask what should
 * happen to it (`leave-prompt.ts`), then act (`account.ts`) and report. Shared by Profile and
 * Personal Information so both ask the same way.
 */

import { useCallback, useState } from 'react';

import { type DialogButton, showDialog } from '../dialog/dialog-store';
import { useTranslation } from '../i18n/I18nProvider';
import { EMPTY_VAULT_INDEX, phoneVaultSummary, type VaultIndex } from '../vault/vault-index';
import { readVaultIndex } from '../vault/vault-storage';
import { deleteCloudAccount, logOut } from './account';
import { type LeaveKind, leavePrompt } from './leave-prompt';
import { serverMessageKey } from './sign-in-flow';

export type LeaveBusy = 'logging_out' | 'deleting' | null;

async function phoneIndex(): Promise<VaultIndex> {
  try {
    return await readVaultIndex();
  } catch {
    // An unreadable vault has nothing that can be shown or removed; ask as if it were empty.
    return EMPTY_VAULT_INDEX;
  }
}

export function useLeaveAccount(onLeft: (kind: LeaveKind) => void) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<LeaveBusy>(null);

  const fail = useCallback(
    (messageKey: string) =>
      showDialog(
        t('cloud.errors.title'),
        t(serverMessageKey(messageKey, (key) => t(key) !== key)),
        [{ text: t('common.ok') }],
      ),
    [t],
  );

  const act = useCallback(
    async (kind: LeaveKind, removeDocuments: boolean) => {
      setBusy(kind === 'log_out' ? 'logging_out' : 'deleting');
      try {
        if (kind === 'log_out') {
          await logOut({ removeDocuments, untitled: (source) => t(`vault.untitled.${source}`) });
        } else {
          const result = await deleteCloudAccount({ removeDocuments });
          if (!result.ok) {
            fail(result.messageKey);
            return;
          }
        }
        onLeft(kind);
      } catch {
        fail('profile.leave.failed');
      } finally {
        setBusy(null);
      }
    },
    [fail, onLeft, t],
  );

  const ask = useCallback(
    async (kind: LeaveKind) => {
      if (busy) return;
      const prompt = leavePrompt(kind, phoneVaultSummary(await phoneIndex()));
      const root = `profile.leave.${kind}`;
      const cancel: DialogButton = { text: t('common.cancel'), style: 'cancel' };
      const buttons: [DialogButton, ...DialogButton[]] =
        prompt.buttons === 'choose'
          ? [
              {
                text: t(`${root}.remove`),
                style: 'destructive' as const,
                onPress: () => void act(kind, true),
              },
              { text: t(`${root}.keep`), onPress: () => void act(kind, false) },
              cancel,
            ]
          : [
              {
                text: t(`${root}.confirm`),
                style: 'destructive' as const,
                onPress: () => void act(kind, false),
              },
              cancel,
            ];
      showDialog(t(prompt.titleKey), t(prompt.bodyKey, prompt.params), buttons, {
        tone: kind === 'delete_account' ? 'danger' : 'warning',
      });
    },
    [act, busy, t],
  );

  return {
    busy,
    confirmLogOut: useCallback(() => void ask('log_out'), [ask]),
    confirmDeleteAccount: useCallback(() => void ask('delete_account'), [ask]),
  };
}
