/**
 * What tapping a checklist row does, for Home and both checklist screens: a document that is
 * ready opens; anything else offers the ways to add it.
 */

import { useRouter } from 'expo-router';
import { Camera, CreditCard, FileScan, Upload } from 'lucide-react-native';
import { useCallback } from 'react';

import { type DialogIcon, showActionSheet } from '../dialog/dialog-store';
import type { Locale, Translate } from '../i18n';
import { useTranslation } from '../i18n/I18nProvider';
import { documentTypeLabelKey } from '../vault/save-document';
import { type AddMethod, addMethods, type DocumentChecklistItem, presetFor } from './checklist';
import { type ChecklistOrigin, originParam } from './scan-goal';

const METHOD_ICONS: Readonly<Record<AddMethod, DialogIcon>> = {
  scan_card: CreditCard,
  scan: FileScan,
  photo: Camera,
  upload: Upload,
};

/** The row's name: its document type's, or the form's own. */
export function checklistItemLabel(
  item: DocumentChecklistItem,
  t: Translate,
  locale: Locale,
): string {
  if (item.type) return t(documentTypeLabelKey(item.type));
  return item.label?.[locale] ?? item.label?.en ?? item.key;
}

export function useChecklistActions(
  origin: ChecklistOrigin,
): (item: DocumentChecklistItem) => void {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const from = originParam(origin);

  return useCallback(
    (item) => {
      if (item.state === 'ready' && item.documentId) {
        router.push({ pathname: '/document-details', params: { id: item.documentId } });
        return;
      }

      const add = (method: AddMethod) => {
        const params = {
          preset: presetFor(item.type, method),
          // The vault has no type for it yet: filed as "Other", under the name they give it.
          type: item.type ?? 'generic',
          from,
        };
        router.push({ pathname: method === 'upload' ? '/import' : '/scanner', params });
      };
      const label = checklistItemLabel(item, t, locale);
      showActionSheet({
        title: t('checklist.add.title', { name: label }),
        ...(item.state === 'expired' ? { message: t('checklist.add.expired') } : {}),
        ...(item.state === 'check_manually' ? { message: t('checklist.add.manual') } : {}),
        actions: addMethods(item.type).map((method) => ({
          key: method,
          label: t(`checklist.add.methods.${method}`),
          icon: METHOD_ICONS[method],
          onPress: () => add(method),
        })),
        cancelLabel: t('common.cancel'),
      });
    },
    [from, locale, router, t],
  );
}
