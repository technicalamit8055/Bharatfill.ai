/**
 * The wording of an expiry reminder, in the citizen's language. A notification can show on the
 * lock screen, so it says whose document it is only by relation ("Papa's document expires in
 * 7 days, on 12 Dec 2026") and how far off the date is — never a member's own name, nor the
 * document's name, type, kind or tags. A due date (a bill) reads as "a due date", not "a bill".
 */

import { useCallback } from 'react';

import { useTranslation } from '../i18n/I18nProvider';
import { formatDateOfBirth, MONTH_KEYS } from '../profile/date-of-birth';
import { countdownKey, daysUntil } from '../vault/everyday';
import type { ReminderCopyFor } from '../vault/vault-storage';
import { relationLabelKey } from './family';

export function useReminderCopy(): ReminderCopyFor {
  const { t } = useTranslation();
  return useCallback<ReminderCopyFor>(
    (owner, plan) => {
      const monthNames = MONTH_KEYS.map((key) => t(`profileSetup.months.${key}`));
      const date = formatDateOfBirth(plan.expiresOn, monthNames) ?? plan.expiresOn;
      // Counted from the day it fires, so "in 7 days" is true when it is read.
      const countdown = countdownKey(daysUntil(plan.expiresOn, plan.at) ?? 0);
      const when = t(countdown.key, countdown.values);
      const meaning = plan.dateMeaning;
      return {
        title: t(`saveDocument.notification.title.${meaning}`),
        body: owner
          ? t(`family.notification.${meaning}`, {
              relation: t(relationLabelKey(owner.relation)),
              when,
              date,
            })
          : t(`saveDocument.notification.${meaning}`, { when, date }),
        channelName: t('saveDocument.notification.channel'),
      };
    },
    [t],
  );
}
