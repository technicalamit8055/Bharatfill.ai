'use client';

import { useActionState, useState } from 'react';
import Image from 'next/image';
import { cn } from '@assistigo/ui';
import type { SchemeImageKind } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { AdminButton, AdminCard, AdminNote } from '../../ui';
import {
  removeSchemeImageAction,
  uploadSchemeImageAction,
  type SchemeActionState,
} from '../actions';

/** Each preview is drawn in the shape the image takes on the page. */
const PREVIEW: Record<SchemeImageKind, { box: string; fit: string }> = {
  logo: { box: 'h-16 w-16 rounded-full', fit: 'object-contain p-1.5' },
  banner: { box: 'h-[72px] w-32 rounded-md', fit: 'object-cover' },
  illustration: { box: 'h-16 w-16 rounded-md', fit: 'object-contain p-1' },
};

/**
 * The pictures attached to this scheme: the hub card's logo, and the detail page's banner and
 * benefit illustration.
 *
 * Its own card with its own actions, apart from the editor form: saving the definition must
 * never be able to drop an image, and swapping a picture should not mean re-submitting
 * eligibility. Only available once the row exists, because uploads are filed under its slug.
 */
export function SchemeImagesCard({
  schemeId,
  images,
  canEdit,
}: {
  schemeId: string;
  /** Each current image's URL on the app's own route, or null. */
  images: Record<SchemeImageKind, string | null>;
  canEdit: boolean;
}) {
  const t = useTranslations();
  return (
    <AdminCard title={t('admin.schemes.imagesTitle')} description={t('admin.schemes.imagesHelp')}>
      <div className="divide-y divide-slate-800">
        {(['logo', 'banner', 'illustration'] as const).map((kind) => (
          <SchemeImageRow
            key={kind}
            schemeId={schemeId}
            kind={kind}
            src={images[kind]}
            canEdit={canEdit}
          />
        ))}
      </div>
    </AdminCard>
  );
}

function SchemeImageRow({
  schemeId,
  kind,
  src,
  canEdit,
}: {
  schemeId: string;
  kind: SchemeImageKind;
  src: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const [uploadState, uploadAction, uploadPending] = useActionState<SchemeActionState, FormData>(
    uploadSchemeImageAction,
    {},
  );
  const [removeState, removeAction, removePending] = useActionState<SchemeActionState, FormData>(
    removeSchemeImageAction,
    {},
  );
  const [picked, setPicked] = useState(false);

  const state = uploadState.error || uploadState.notice ? uploadState : removeState;
  const preview = PREVIEW[kind];
  const key = (suffix: string) => t(`admin.schemes.${kind}${suffix}`);

  return (
    <div className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div>
        <h3 className="text-sm font-medium text-slate-200">{key('Title')}</h3>
        <p className="mt-0.5 text-xs text-slate-400">{key('Help')}</p>
      </div>

      {state.error ? <AdminNote tone="danger">{t(state.error)}</AdminNote> : null}
      {state.notice ? <AdminNote tone="success">{t(state.notice)}</AdminNote> : null}

      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            'relative flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-slate-700',
            preview.box,
          )}
        >
          {src ? (
            // Unoptimised: the optimiser would fetch our signed-in route without the admin's
            // cookies and get a 401.
            <Image
              src={src}
              alt={key('Current')}
              fill
              sizes="128px"
              unoptimized
              className={preview.fit}
            />
          ) : (
            <span className="px-1 text-center text-[10px] leading-tight text-slate-500">
              {key('None')}
            </span>
          )}
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <form
              action={uploadAction}
              // React resets the file input once the action settles; this keeps the button's
              // enabled state in step with it.
              onSubmit={() => setPicked(false)}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="id" value={schemeId} />
              <input type="hidden" name="kind" value={kind} />
              <input
                type="file"
                name="image"
                accept="image/png,image/jpeg,image/webp"
                aria-label={key('Pick')}
                onChange={(event) => setPicked(Boolean(event.target.files?.length))}
                className="max-w-[16rem] text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-sm file:text-slate-200 hover:file:bg-slate-700"
              />
              <AdminButton type="submit" variant="primary" disabled={!picked || uploadPending}>
                {uploadPending ? t('common.saving') : src ? key('Replace') : key('Upload')}
              </AdminButton>
            </form>

            {src ? (
              <form action={removeAction}>
                <input type="hidden" name="id" value={schemeId} />
                <input type="hidden" name="kind" value={kind} />
                <AdminButton type="submit" variant="ghost" disabled={removePending}>
                  {key('Remove')}
                </AdminButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">{key('Rules')}</p>
    </div>
  );
}
