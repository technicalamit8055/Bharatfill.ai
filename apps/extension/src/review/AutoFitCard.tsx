import { useCallback, useEffect, useRef, useState } from 'react';
import { fileMatchesAccept, type AttachmentKind } from '@assistigo/form-engine';
import {
  AUTO_FIT_BLOCK_MESSAGES,
  describeAutoFit,
  formatFileSize,
  planAutoFit,
} from '@assistigo/document-tools/autofit';
import type { AutoFitResult } from '../shared/autofit';
import type { MessageResponse } from '../shared/messages';
import { send } from '../shared/send';
import { AlertIcon, ExternalIcon, SparkIcon } from '../shared/Brand';

/**
 * Auto-fit in the side panel (docs/EXTENSION.md §6c).
 *
 * When the operator chooses a file for an upload box whose portal states a KB window, and the
 * file is outside it — or is a PNG for a JPEG-only box — the worker prepares a fitted copy with
 * the same encoders Document Tools Studio uses. The panel shows what changed and a preview, and
 * the copy is attached only once the operator ticks it. Nothing is fitted silently, and nothing
 * fitted is saved to the customer's profile.
 */

/** What an upload box asks for, as far as auto-fit cares. */
export type FitTarget = {
  accept: string | null;
  minBytes: number | null;
  maxBytes: number | null;
};

/** The parts of an attachment choice a fit needs. */
export type FitChoice = {
  id: string;
  kind: AttachmentKind;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

type Fitted = Extract<AutoFitResult, { status: 'fitted' }>;

export type FitState =
  | { status: 'working'; forId: string }
  | { status: 'not_needed'; forId: string }
  | { status: 'failed'; forId: string; message: string }
  | { status: 'ready'; forId: string; result: Fitted; confirmed: boolean };

/** What `planAutoFit` decides for a file, on the metadata the panel already has. */
export function planForChoice(choice: Omit<FitChoice, 'id' | 'kind'>, target: FitTarget) {
  return planAutoFit(
    { filename: choice.filename, mimeType: choice.mimeType, sizeBytes: choice.sizeBytes },
    target,
    (candidate) => fileMatchesAccept(target.accept, candidate),
  );
}

function discard(token: string): void {
  void send({ type: 'DISCARD_AUTO_FIT', token });
}

const UNAVAILABLE_MESSAGE =
  'Could not download this file to resize it. Try again, or attach it by hand.';

/**
 * Keeps one fit per chosen file, keyed by upload-box signature.
 *
 * `active` is false outside the review stage: nothing is prepared while a fill is running or on
 * the results screen, and returning to review re-prepares whatever is still chosen — the copies
 * from the last fill were spent by it.
 */
export function useAutoFits(
  attachments: Readonly<Record<string, FitChoice>>,
  targetFor: (signature: string) => FitTarget | null,
  active: boolean,
) {
  const [fits, setFits] = useState<Record<string, FitState>>({});
  // Mirrors of the latest state for async callbacks, which must not act on a stale choice.
  const fitsRef = useRef(fits);
  const attachmentsRef = useRef(attachments);

  const commit = useCallback((next: Record<string, FitState>) => {
    fitsRef.current = next;
    setFits(next);
  }, []);

  const settle = useCallback(
    (signature: string, forId: string, response: MessageResponse<AutoFitResult>) => {
      const stillChosen =
        attachmentsRef.current[signature]?.id === forId &&
        fitsRef.current[signature]?.forId === forId;
      if (!stillChosen) {
        // The operator moved on while it was being prepared. Do not hold a copy nobody wants.
        if (response.ok && response.data.status === 'fitted') discard(response.data.token);
        return;
      }

      let state: FitState;
      if (!response.ok) state = { status: 'failed', forId, message: UNAVAILABLE_MESSAGE };
      else if (response.data.status === 'already_fits') state = { status: 'not_needed', forId };
      else if (response.data.status === 'cannot_fit')
        state = { status: 'failed', forId, message: AUTO_FIT_BLOCK_MESSAGES[response.data.reason] };
      else state = { status: 'ready', forId, result: response.data, confirmed: false };

      commit({ ...fitsRef.current, [signature]: state });
    },
    [commit],
  );

  useEffect(() => {
    attachmentsRef.current = attachments;
    if (!active) return;

    const current = fitsRef.current;
    const next: Record<string, FitState> = {};
    let changed = false;

    // A box whose choice changed or was cleared loses its fit, and its held copy.
    for (const [signature, fit] of Object.entries(current)) {
      if (attachments[signature]?.id === fit.forId) {
        next[signature] = fit;
      } else {
        changed = true;
        if (fit.status === 'ready') discard(fit.result.token);
      }
    }

    for (const [signature, choice] of Object.entries(attachments)) {
      if (next[signature]) continue;
      const target = targetFor(signature);
      if (!target) continue;

      const plan = planForChoice(choice, target);
      if (plan.action === 'none') continue;

      changed = true;
      if (plan.action === 'cannot_fit') {
        next[signature] = {
          status: 'failed',
          forId: choice.id,
          message: AUTO_FIT_BLOCK_MESSAGES[plan.reason],
        };
        continue;
      }

      next[signature] = { status: 'working', forId: choice.id };
      void send<AutoFitResult>({
        type: 'PREPARE_AUTO_FIT',
        targetId: choice.id,
        kind: choice.kind,
        accept: target.accept,
        minBytes: target.minBytes,
        maxBytes: target.maxBytes,
      }).then((response) => settle(signature, choice.id, response));
    }

    if (changed) commit(next);
  }, [attachments, targetFor, active, commit, settle]);

  // Closing the panel drops every copy still held for it.
  useEffect(
    () => () => {
      for (const fit of Object.values(fitsRef.current)) {
        if (fit.status === 'ready') discard(fit.result.token);
      }
    },
    [],
  );

  const confirmFit = useCallback(
    (signature: string, confirmed: boolean) => {
      const fit = fitsRef.current[signature];
      if (fit?.status !== 'ready') return;
      commit({ ...fitsRef.current, [signature]: { ...fit, confirmed } });
    },
    [commit],
  );

  /** The token to send with this box's attachment — only for a copy the operator confirmed. */
  const fitTokenFor = useCallback((signature: string): string | undefined => {
    const fit = fitsRef.current[signature];
    return fit?.status === 'ready' && fit.confirmed ? fit.result.token : undefined;
  }, []);

  /** After a fill: confirmed copies were taken by it; the rest are dropped. */
  const resetFits = useCallback(() => {
    for (const fit of Object.values(fitsRef.current)) {
      if (fit.status === 'ready' && !fit.confirmed) discard(fit.result.token);
    }
    commit({});
  }, [commit]);

  const anyWorking = Object.values(fits).some((fit) => fit.status === 'working');

  return { fits, confirmFit, fitTokenFor, resetFits, anyWorking };
}

/**
 * The confirm card under an upload box. Rasterisation is shown as a warning, because it is the
 * one change that can make an identity document hard to read.
 */
export function AutoFitCard({
  fit,
  windowLabel,
  onConfirm,
}: {
  fit: FitState;
  windowLabel: string | null;
  onConfirm: (confirmed: boolean) => void;
}) {
  if (fit.status === 'not_needed') return null;

  if (fit.status === 'working') {
    return (
      <p className="tiny muted row" style={{ gap: 6, margin: '7px 0 0' }}>
        <span className="spinner spinner-ink" />
        Fitting this file to the portal{windowLabel ? ` (${windowLabel})` : ''}…
      </p>
    );
  }

  if (fit.status === 'failed') {
    return (
      <div className="notice notice-warn" style={{ marginTop: 7 }}>
        <AlertIcon size={12} />
        <span className="tiny">{fit.message}</span>
      </div>
    );
  }

  const { result, confirmed } = fit;
  const { headline, changes } = describeAutoFit(result.report);
  const isImage = result.mimeType.startsWith('image/');

  return (
    <div className="attach-chosen" style={{ alignItems: 'flex-start' }}>
      <span className="attach-chosen__body">
        <span className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
          <span className="badge badge-brand">
            <SparkIcon size={10} /> Fitted copy
          </span>
          <span className="badge badge-ok">{headline}</span>
        </span>
        <span className="tiny truncate" style={{ display: 'block', marginTop: 3 }}>
          {result.filename}
          {result.width && result.height ? ` · ${result.width}×${result.height}px` : ''} ·{' '}
          {formatFileSize(result.report.toBytes)}
        </span>

        {changes.map((change, index) => {
          // `describeAutoFit` puts rasterisation first when it happened.
          const legibilityRisk = index === 0 && result.report.rasterised;
          return (
            <span
              key={change}
              className={`tiny ${legibilityRisk ? 'strong' : 'muted'}`}
              style={{
                display: 'block',
                marginTop: 2,
                ...(legibilityRisk ? { color: 'var(--warn)' } : {}),
              }}
            >
              {change}
            </span>
          );
        })}

        {isImage ? (
          <img
            src={result.previewUrl}
            alt="Fitted copy preview"
            style={{
              display: 'block',
              marginTop: 6,
              maxWidth: '100%',
              maxHeight: 140,
              border: '1px solid var(--line)',
              borderRadius: 6,
            }}
          />
        ) : (
          <a
            className="btn-ghost tiny"
            href={result.previewUrl}
            target="_blank"
            rel="noreferrer"
            style={{ marginTop: 6, display: 'inline-flex' }}
          >
            <ExternalIcon size={12} />
            Open fitted PDF to check it
          </a>
        )}

        <label className="tiny row" style={{ gap: 6, marginTop: 7 }}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirm(event.target.checked)}
          />
          Attach this fitted copy instead of the original
        </label>
        <span className="tiny muted" style={{ display: 'block', marginTop: 2 }}>
          Made on this computer for this fill only — not saved to the customer&rsquo;s profile.
        </span>
      </span>
    </div>
  );
}
