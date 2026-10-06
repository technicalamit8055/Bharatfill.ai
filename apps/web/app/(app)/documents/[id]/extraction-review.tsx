'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Input } from '@assistigo/ui';
import { useI18n, useTranslations } from '@/lib/i18n/client';
import { formatConfidence } from '@/lib/documents/format';

export type ReviewField = {
  key: string;
  label: string;
  value: string;
  confidence: number;
  sourceText: string;
  page: number;
  status: 'ok' | 'needs_review';
  reviewReason: string | null;
  fieldLabel: { en: string; hi: string } | null;
  sensitivity: 'normal' | 'sensitive' | 'high_risk';
  /** The value is already on the customer's profile, unchanged (lib/documents/profile-match.ts). */
  matchesProfile: boolean;
};

type Decision = { action: 'accept' | 'edit' | 'reject'; value: string };

const CONFIDENCE_TONE = (confidence: number): 'success' | 'warning' | 'danger' =>
  confidence >= 0.9 ? 'success' : confidence >= 0.7 ? 'warning' : 'danger';

/**
 * The human review screen (§12.6, §7.4.4).
 *
 * Every proposed field is shown with its confidence, the reason it needs a human, and the exact
 * line it was read from — an operator who can see the source checks a value in a second instead
 * of opening the scan. Nothing new is accepted by default: a field the operator does not act on
 * is simply not submitted.
 *
 * The one exception is a field whose value is already on the profile, unchanged — typically the
 * name and date of birth on a second document for an existing customer. Those start accepted and
 * sit in a collapsed "Already matched" section, so the operator's attention goes to what is new.
 * Accepting one changes no value; it records this document as a source for it. Opening the
 * section gives the same edit, reject and undo actions as every other field.
 */
export function ExtractionReview({
  documentId,
  fields,
  hasCustomer,
  canReview,
  onSaved,
}: {
  documentId: string;
  fields: ReviewField[];
  hasCustomer: boolean;
  canReview: boolean;
  /** Called after a successful save, before the router refresh it triggers. */
  onSaved?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();

  const reviewFields = useMemo(() => fields.filter((field) => !field.matchesProfile), [fields]);
  const matchedFields = useMemo(() => fields.filter((field) => field.matchesProfile), [fields]);

  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    canReview && hasCustomer
      ? Object.fromEntries(
          matchedFields.map((field) => [field.key, { action: 'accept', value: field.value }]),
        )
      : {},
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decidedCount = useMemo(
    () => Object.values(decisions).filter((decision) => decision.action !== 'reject').length,
    [decisions],
  );

  function setDecision(key: string, decision: Decision | null) {
    setDecisions((current) => {
      const next = { ...current };
      if (decision === null) delete next[key];
      else next[key] = decision;
      return next;
    });
  }

  async function submit() {
    const payload = Object.entries(decisions).map(([fieldKey, decision]) => ({
      fieldKey,
      action: decision.action,
      ...(decision.action === 'edit' ? { value: decision.value } : {}),
    }));

    if (payload.length === 0) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decisions: payload }),
      });

      const json = (await response.json()) as { data: unknown } | { error: { messageKey: string } };

      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'errors.internal');
        setPending(false);
        return;
      }

      onSaved?.();
      router.refresh();
    } catch {
      setError('errors.internal');
      setPending(false);
    }
  }

  if (fields.length === 0) {
    return (
      <Card title={t('documents.review.title')}>
        <p className="text-sm text-slate-500">{t('documents.review.noFields')}</p>
      </Card>
    );
  }

  return (
    <Card title={t('documents.review.title')}>
      <p className="mb-4 text-sm text-slate-600">{t('documents.review.help')}</p>

      {!hasCustomer ? (
        <Alert tone="warning" title={t('documents.review.noCustomerTitle')}>
          {t('documents.review.noCustomerHelp')}
        </Alert>
      ) : null}

      {reviewFields.length > 0 ? (
        <ul className="divide-y divide-slate-200">
          {reviewFields.map((field) => (
            <ReviewFieldRow
              key={field.key}
              field={field}
              decision={decisions[field.key]}
              canReview={canReview}
              onDecide={(decision) => setDecision(field.key, decision)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">{t('documents.review.allMatched')}</p>
      )}

      {matchedFields.length > 0 ? (
        <details className="mt-4 rounded-md border border-slate-200">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-800">
            {t('documents.review.matchedTitle', { count: matchedFields.length })}
          </summary>
          <div className="border-t border-slate-200 px-4">
            <p className="pt-3 text-xs text-slate-500">{t('documents.review.matchedHelp')}</p>
            <ul className="divide-y divide-slate-200">
              {matchedFields.map((field) => (
                <ReviewFieldRow
                  key={field.key}
                  field={field}
                  decision={decisions[field.key]}
                  canReview={canReview}
                  onDecide={(decision) => setDecision(field.key, decision)}
                />
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-4">
          {t(error)}
        </Alert>
      ) : null}

      {canReview ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={submit}
            loading={pending}
            disabled={Object.keys(decisions).length === 0 || !hasCustomer}
          >
            {t('documents.review.save')}
          </Button>
          <p className="text-sm text-slate-500">
            {t('documents.review.pendingCount', {
              accepted: decidedCount,
              total: fields.length,
            })}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function ReviewFieldRow({
  field,
  decision,
  canReview,
  onDecide,
}: {
  field: ReviewField;
  decision: Decision | undefined;
  canReview: boolean;
  onDecide: (decision: Decision | null) => void;
}) {
  const t = useTranslations();
  const { locale } = useI18n();

  const rejected = decision?.action === 'reject';
  const editing = decision?.action === 'edit';
  const fieldName = field.fieldLabel ? field.fieldLabel[locale] : field.key;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{fieldName}</p>
          {/* What the document actually printed, next to what we mapped it to. */}
          <p className="mt-0.5 text-xs text-slate-500">{field.label}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={CONFIDENCE_TONE(field.confidence)}>
            {formatConfidence(field.confidence)}
          </Badge>
          {field.reviewReason ? (
            <Badge tone="neutral">{t(`documents.review.reasons.${field.reviewReason}`)}</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        {editing ? (
          <Input
            aria-label={fieldName}
            value={decision.value}
            autoFocus
            onChange={(event) => onDecide({ action: 'edit', value: event.target.value })}
          />
        ) : (
          <p
            className={
              rejected ? 'text-sm text-slate-400 line-through' : 'text-sm font-medium text-slate-900'
            }
          >
            {field.value}
          </p>
        )}
      </div>

      <p className="mt-2 truncate text-xs text-slate-400" title={field.sourceText}>
        {t('documents.review.source')}: {field.sourceText}
      </p>

      {canReview ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={decision?.action === 'accept' ? 'primary' : 'secondary'}
            onClick={() => onDecide({ action: 'accept', value: field.value })}
          >
            {t('documents.review.accept')}
          </Button>
          <Button
            size="sm"
            variant={editing ? 'primary' : 'secondary'}
            onClick={() => onDecide({ action: 'edit', value: decision?.value ?? field.value })}
          >
            {t('common.edit')}
          </Button>
          <Button
            size="sm"
            variant={rejected ? 'primary' : 'ghost'}
            onClick={() => onDecide({ action: 'reject', value: '' })}
          >
            {t('documents.review.reject')}
          </Button>
          {decision ? (
            <Button size="sm" variant="ghost" onClick={() => onDecide(null)}>
              {t('documents.review.undo')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
