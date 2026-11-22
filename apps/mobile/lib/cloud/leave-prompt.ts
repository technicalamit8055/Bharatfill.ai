/**
 * What Log out and Delete account say before they act, and which choices they offer. Pure, so
 * the copy decisions are tested without a device.
 *
 * Product call (2026-11-22, delegated to engineering — see docs/VAULT_BRIDGE_DESIGN.md §1 D16):
 * family phones are often shared, so leaving always asks what happens to the documents on this
 * phone — remove them, or keep them — instead of deciding silently. Neither choice is
 * pre-selected; the warning names how many documents exist only on this phone, because those
 * are lost for good if removed. With nothing on the phone there is nothing to choose.
 *
 * Copy lives under `profile.leave.<kind>.*`; counts pick the `One` / `Other` key.
 */

import type { PhoneVaultSummary } from '../vault/vault-index';

export type LeaveKind = 'log_out' | 'delete_account';

/** `choose`: remove-or-keep plus cancel. `confirm`: one action plus cancel (nothing on the phone). */
export type LeavePrompt = {
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly params: { readonly count: number; readonly lost: number };
  readonly buttons: 'choose' | 'confirm';
};

function plural(base: string, count: number): string {
  return `${base}${count === 1 ? 'One' : 'Other'}`;
}

export function leavePrompt(kind: LeaveKind, summary: PhoneVaultSummary): LeavePrompt {
  const root = `profile.leave.${kind}`;
  const params = { count: summary.total, lost: summary.onlyOnPhone };
  const titleKey = `${root}.title`;

  if (summary.total === 0)
    return { titleKey, bodyKey: `${root}.bodyEmpty`, params, buttons: 'confirm' };

  // Deleting the account deletes the cloud copies too, so every document here is "only here".
  if (kind === 'delete_account') {
    return { titleKey, bodyKey: plural(`${root}.body`, summary.total), params, buttons: 'choose' };
  }

  const bodyKey =
    summary.onlyOnPhone === 0
      ? plural(`${root}.bodySynced`, summary.total)
      : plural(`${root}.bodyAtRisk`, summary.onlyOnPhone);
  return { titleKey, bodyKey, params, buttons: 'choose' };
}
