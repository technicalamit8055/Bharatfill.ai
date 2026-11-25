/**
 * Document checklist route — `/checklist`, from Home. The documents forms ask for most, ticked
 * against the vault, then every form a checklist can be made for (`/form-checklist`).
 */

import { SCHEME_CATEGORY_LABELS } from '@assistigo/core';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { ChecklistPage, ChecklistSection } from '../components/checklist/ChecklistPage';
import { ChecklistProgressBar } from '../components/checklist/ChecklistProgressBar';
import { ChecklistRows } from '../components/checklist/ChecklistRows';
import { FormRows } from '../components/checklist/FormRows';
import {
  CHECKLIST_GROUPS,
  checklistProgress,
  formGroups,
  groupChecklist,
} from '../lib/checklist/checklist';
import { useChecklistActions } from '../lib/checklist/use-checklist-actions';
import { useVaultDocuments } from '../lib/checklist/use-vault-documents';
import { useTranslation } from '../lib/i18n/I18nProvider';

const FORM_GROUPS = formGroups();

export default function ChecklistRoute() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { documents, failed, now } = useVaultDocuments();
  const onItem = useChecklistActions({ screen: 'checklist' });

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  return (
    <ChecklistPage
      title={t('checklist.title')}
      status={failed ? 'failed' : documents ? 'ready' : 'loading'}
      onBack={back}
    >
      {CHECKLIST_GROUPS.map((group) => {
        const items = groupChecklist(group, documents ?? [], now);
        const progress = checklistProgress(items);
        return (
          <ChecklistSection
            key={group}
            title={t(`checklist.groups.${group}`)}
            note={
              group === 'core' ? t('checklist.progress', progress) : t('checklist.ifYourFormAsks')
            }
          >
            {group === 'core' ? <ChecklistProgressBar {...progress} /> : null}
            <ChecklistRows items={items} onItem={onItem} />
          </ChecklistSection>
        );
      })}

      <ChecklistSection title={t('checklist.forms.title')} note={t('checklist.forms.note')} />
      {FORM_GROUPS.map(({ category, schemes }) => (
        <ChecklistSection key={category} title={SCHEME_CATEGORY_LABELS[category][locale]}>
          <FormRows
            schemes={schemes}
            onForm={(scheme) =>
              router.push({ pathname: '/form-checklist', params: { slug: scheme.slug } })
            }
          />
        </ChecklistSection>
      ))}
    </ChecklistPage>
  );
}
