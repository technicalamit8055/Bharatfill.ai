'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, ProgressBar, Table, TBody, TD, TH, THead, TR, cn } from '@assistigo/ui';
import { DOCUMENT_FOLDERS, type DocumentFolder } from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import {
  AllFoldersIcon,
  CertificatesSectionIcon,
  EducationSectionIcon,
  FromAppIcon,
  IdentitySectionIcon,
  OtherFolderIcon,
  PhotoSignatureFolderIcon,
} from '../icons';
import { DocumentRowActions } from './document-row-actions';

/** One row, already localised by the server component (`customer-documents.tsx`). */
export type FolderDocument = {
  id: string;
  filename: string;
  typeLabel: string;
  mimeType: string;
  status: string;
  sizeLabel: string;
  addedOn: string;
  folder: DocumentFolder;
  /** Uploaded by the citizen in the BharatDoc app (0041 mirror). */
  fromApp: boolean;
};

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  uploaded: 'neutral',
  processing: 'info',
  extracted: 'info',
  review_required: 'warning',
  verified: 'success',
  stored: 'success',
  failed: 'danger',
};

const FOLDER_ICON: Record<DocumentFolder, (props: { className?: string }) => React.JSX.Element> = {
  identity: IdentitySectionIcon,
  academic: EducationSectionIcon,
  certificate: CertificatesSectionIcon,
  form_asset: PhotoSignatureFolderIcon,
  other: OtherFolderIcon,
};

const FOLDER_TONE: Record<DocumentFolder, string> = {
  identity: 'bg-sky-50 text-sky-600',
  academic: 'bg-violet-50 text-violet-600',
  certificate: 'bg-amber-50 text-amber-600',
  form_asset: 'bg-emerald-50 text-emerald-600',
  other: 'bg-slate-100 text-slate-500',
};

type Selection = DocumentFolder | 'all';

/** The file-type chip beside a document's name: red for a PDF, blue for a photo or scan. */
function FileChip({ mimeType }: { mimeType: string }) {
  const isPdf = mimeType === 'application/pdf';
  return (
    <span
      aria-hidden
      className={`flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-bold uppercase ${
        isPdf ? 'bg-red-50 text-red-600' : 'bg-sky-50 text-sky-600'
      }`}
    >
      {isPdf ? 'pdf' : 'img'}
    </span>
  );
}

/**
 * A customer's documents laid out like the BharatDoc app vault: a tile per folder with its
 * count, and the list below narrowed to the folder picked. Same folders and order as the app
 * (`DOCUMENT_FOLDERS`), so an operator and a citizen looking at the same account see the same
 * thing. Empty folders stay visible (greyed) so the layout never jumps.
 */
export function DocumentFolders({
  documents,
  canDownload,
}: {
  documents: FolderDocument[];
  canDownload: boolean;
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState<Selection>('all');

  const counts = useMemo(() => {
    const result = Object.fromEntries(DOCUMENT_FOLDERS.map((folder) => [folder, 0])) as Record<
      DocumentFolder,
      number
    >;
    for (const document of documents) result[document.folder] += 1;
    return result;
  }, [documents]);

  const visible =
    selected === 'all' ? documents : documents.filter((document) => document.folder === selected);

  const tile = (
    value: Selection,
    label: string,
    count: number,
    Icon: typeof AllFoldersIcon,
    tone: string,
  ) => {
    const active = selected === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={active}
        onClick={() => setSelected(value)}
        className={cn(
          'flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
          active
            ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
          count === 0 && !active && value !== 'all' ? 'opacity-60' : null,
        )}
      >
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-800">{label}</span>
          <span className="block text-xs tabular-nums text-slate-500">{count}</span>
        </span>
      </button>
    );
  };

  return (
    <div>
      <div
        role="group"
        aria-label={t('documents.folders.label')}
        className="grid grid-cols-2 gap-2 border-b border-slate-100 px-5 py-4 sm:grid-cols-3 lg:grid-cols-6"
      >
        {tile(
          'all',
          t('documents.folders.all'),
          documents.length,
          AllFoldersIcon,
          'bg-brand-50 text-brand-600',
        )}
        {DOCUMENT_FOLDERS.map((folder) =>
          tile(
            folder,
            t(`documents.folders.${folder}`),
            counts[folder],
            FOLDER_ICON[folder],
            FOLDER_TONE[folder],
          ),
        )}
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          {t('documents.folders.empty')}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="pl-5">{t('documents.file')}</TH>
              <TH>{t('documents.type')}</TH>
              <TH>{t('documents.size')}</TH>
              <TH>{t('settings.status')}</TH>
              <TH>{t('customers.addedOn')}</TH>
              <TH className="pr-5 text-right">{t('customers.actions')}</TH>
            </TR>
          </THead>
          <TBody>
            {visible.map((document) => (
              <TR key={document.id}>
                <TD className="pl-5">
                  <div className="flex items-center gap-2.5">
                    <FileChip mimeType={document.mimeType} />
                    <div className="min-w-0">
                      <Link
                        href={`/documents/${document.id}`}
                        className="break-all font-medium text-brand-700 hover:underline"
                      >
                        {document.filename}
                      </Link>
                      {document.fromApp ? (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <FromAppIcon className="h-3.5 w-3.5" />
                          {t('documents.folders.fromApp')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </TD>
                <TD className="text-slate-600">{document.typeLabel}</TD>
                <TD className="tabular-nums text-slate-500">{document.sizeLabel}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[document.status] ?? 'neutral'}>
                    {t(`documents.statuses.${document.status}`)}
                  </Badge>
                  {document.status === 'processing' ? (
                    <ProgressBar className="mt-1.5 max-w-[10rem]" />
                  ) : null}
                </TD>
                <TD className="text-slate-500">{document.addedOn}</TD>
                <TD className="pr-5">
                  <DocumentRowActions
                    documentId={document.id}
                    fileName={document.filename}
                    canDownload={canDownload}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
