'use client';

import { Alert, type Tone } from '@assistigo/ui';
import type { QrCheck, QrCheckResult } from '@assistigo/document-tools/qr';
import { useI18n } from '@/lib/i18n/client';

/**
 * What a staged file's QR code proves, for the operator before they take it in (§9.1): an
 * Aadhaar Secure QR's UIDAI signature, or the official link on an e-District / DigiLocker
 * certificate. The check runs in this browser on the operator's own copy of the file
 * (`@assistigo/document-tools/browser/qr`), never on the citizen's word.
 *
 * The details read from the code (name, date of birth) are shown to hold against the printed
 * document and are dropped with the modal; nothing here is stored, sent or logged.
 */

export type DropQrState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'none' }
  | { status: 'locked' }
  | { status: 'failed' }
  | { status: 'done'; check: QrCheck };

const TONES: Record<QrCheckResult, Tone> = {
  aadhaar_verified: 'success',
  aadhaar_unconfirmed: 'warning',
  aadhaar_unsigned: 'neutral',
  official_link: 'info',
  other_link: 'warning',
  pan_text: 'neutral',
  unrecognised: 'neutral',
};

export function DropFileQrCheck({ state }: { state: DropQrState }) {
  const { t } = useI18n();

  if (state.status === 'idle') return null;
  if (state.status === 'checking') {
    return <Alert tone="info">{t('documentDrop.qr.checking')}</Alert>;
  }
  if (state.status !== 'done') {
    return (
      <Alert tone={state.status === 'failed' ? 'danger' : 'neutral'}>
        {t(`documentDrop.qr.${state.status}`)}
      </Alert>
    );
  }

  const { check } = state;
  const isLink = check.result === 'official_link' || check.result === 'other_link';
  const host = isLink ? check.host : '';
  const details = 'details' in check ? check.details : null;
  const rows: { label: string; value: string }[] = [];
  if (details?.name) rows.push({ label: t('documentDrop.qr.fields.name'), value: details.name });
  if (details?.dateOfBirth) {
    rows.push({ label: t('documentDrop.qr.fields.dateOfBirth'), value: details.dateOfBirth });
  }
  if (details?.gender)
    rows.push({ label: t('documentDrop.qr.fields.gender'), value: details.gender });
  if (details?.careOf)
    rows.push({ label: t('documentDrop.qr.fields.careOf'), value: details.careOf });
  if (details?.address)
    rows.push({ label: t('documentDrop.qr.fields.address'), value: details.address });
  if (details?.aadhaarLast4) {
    rows.push({
      label: t('documentDrop.qr.fields.aadhaar'),
      value: `XXXX XXXX ${details.aadhaarLast4}`,
    });
  }
  if (details?.panMasked)
    rows.push({ label: t('documentDrop.qr.fields.pan'), value: details.panMasked });

  return (
    <Alert tone={TONES[check.result]} title={t(`documentDrop.qr.title.${check.result}`, { host })}>
      <p>{t(`documentDrop.qr.body.${check.result}`, { host })}</p>
      {rows.length > 0 ? (
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="font-medium text-slate-800">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {isLink ? (
        <a
          href={check.url}
          target="_blank"
          // No referrer: the dashboard's URL is nobody else's business.
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-semibold text-blue-700 underline"
        >
          {t('documentDrop.qr.open', { host })}
        </a>
      ) : null}
    </Alert>
  );
}
