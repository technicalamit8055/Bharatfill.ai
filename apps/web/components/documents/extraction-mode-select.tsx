'use client';

import { Alert, Select } from '@assistigo/ui';
import { EXTRACTION_MODES, type ExtractionMode } from '@assistigo/ai/types';
import { useTranslations } from '@/lib/i18n/client';

/**
 * How the operator wants a document read (docs/AI_PIPELINE.md §2).
 *
 * The three options are a genuine trade-off, not a settings maze, so each one says what it costs
 * rather than what it is called: the basic reader is instant and keeps the file on our server but
 * cannot see a photograph; the AI reader reads a phone snap of a certificate but sends the page to
 * a third party.
 *
 * That last point is why picking "AI" surfaces a notice. Choosing it here is a request, not
 * consent — the pipeline still refuses unless the workspace owner has turned AI processing on
 * (§12.3, §19.3) — and an operator who is about to send a customer's certificate off our
 * infrastructure should be told, not have it happen behind a dropdown.
 */
export function ExtractionModeSelect({
  id = 'extraction-mode',
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: ExtractionMode;
  onChange: (mode: ExtractionMode) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {t('documents.extractionMode.label')}
      </label>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ExtractionMode)}
      >
        {EXTRACTION_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {t(`documents.extractionMode.options.${mode}`)}
          </option>
        ))}
      </Select>
      <p className="text-xs text-slate-500">{t(`documents.extractionMode.hints.${value}`)}</p>

      {value === 'ai' ? (
        <Alert tone="warning">{t('documents.extractionMode.aiNotice')}</Alert>
      ) : null}
    </div>
  );
}
