'use client';

import { useActionState } from 'react';
import { useTranslations } from '@/lib/i18n/client';
import { AdminButton, AdminCard, AdminNote } from '../../ui';
import { deleteSchemeAction, setPublishedAction, type SchemeActionState } from '../actions';

/**
 * Publish / unpublish and delete.
 *
 * Kept out of the main editor form: publishing is not "saving edits", it is the moment a claim
 * about a government rule becomes visible to every centre in the country, and it deserves its own
 * button rather than a checkbox somebody ticks on the way past.
 */
export function SchemeRowActions({
  schemeId,
  isPublished,
  canPublish,
  canDelete,
}: {
  schemeId: string;
  isPublished: boolean;
  canPublish: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations();
  const [publishState, publishAction, publishPending] = useActionState<SchemeActionState, FormData>(
    setPublishedAction,
    {},
  );
  const [deleteState, deleteAction, deletePending] = useActionState<SchemeActionState, FormData>(
    deleteSchemeAction,
    {},
  );

  if (!canPublish && !canDelete) return null;

  return (
    <AdminCard title={t('admin.schemes.dangerTitle')} description={t('admin.schemes.dangerHelp')}>
      {publishState.error ? <AdminNote tone="danger">{t(publishState.error)}</AdminNote> : null}
      {publishState.notice ? (
        <AdminNote tone="success">{t(publishState.notice)}</AdminNote>
      ) : null}
      {deleteState.error ? <AdminNote tone="danger">{t(deleteState.error)}</AdminNote> : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canPublish ? (
          <form action={publishAction}>
            <input type="hidden" name="id" value={schemeId} />
            <input type="hidden" name="publish" value={isPublished ? 'false' : 'true'} />
            <AdminButton
              type="submit"
              variant={isPublished ? 'secondary' : 'primary'}
              disabled={publishPending}
            >
              {isPublished ? t('admin.schemes.unpublish') : t('admin.schemes.publish')}
            </AdminButton>
          </form>
        ) : null}

        {canDelete ? (
          <form
            action={deleteAction}
            onSubmit={(event) => {
              // Deleting a global row removes a scheme from every centre's catalogue at once, and
              // there is no undo. A confirm is the least this deserves.
              if (!window.confirm(t('admin.schemes.confirmDelete'))) event.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={schemeId} />
            <AdminButton type="submit" variant="danger" disabled={deletePending}>
              {t('admin.schemes.delete')}
            </AdminButton>
          </form>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-slate-600">{t('admin.schemes.builtInFallbackNote')}</p>
    </AdminCard>
  );
}
