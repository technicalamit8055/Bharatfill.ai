'use client';

import { useState } from 'react';
import type { AiKeySource } from '@/lib/ai/key-sources';
import type { ProviderPreset } from '@/lib/ai/vendor-settings';
import type { OrganizationAiProvider } from '@/lib/supabase/database.types';
import { useTranslations } from '@/lib/i18n/client';
import {
  AdminButton,
  AdminCard,
  AdminCheckbox,
  AdminField,
  AdminInput,
  AdminNote,
  AdminSelect,
  AdminTextarea,
} from '../ui';

type Initial = {
  provider: OrganizationAiProvider;
  baseUrl: string;
  model: string;
  customPrompt: string;
  hasApiKey: boolean;
  enabled: boolean;
};

type FieldKey = { key: string; label: string };

const PROVIDER_ORDER: OrganizationAiProvider[] = [
  'openai',
  'anthropic',
  'deepseek',
  'gemini',
  'vertex',
  'ollama',
  'openrouter',
  'custom',
];

/**
 * The shared AI vendor settings form (docs/AI_PIPELINE.md §2).
 *
 * The API key field is write-only by design: the server never returns a stored key, so this
 * form only ever shows whether one is set (`hasApiKey`) and lets a Super Admin type a replacement.
 * Leaving it blank on save keeps whatever is already stored; typing a new value replaces it.
 */
export function AiSettingsForm({
  initial,
  keySources,
  fieldKeys,
  presets,
}: {
  initial: Initial;
  keySources: AiKeySource[];
  fieldKeys: FieldKey[];
  presets: Record<OrganizationAiProvider, ProviderPreset>;
}) {
  const t = useTranslations();

  const [provider, setProvider] = useState<OrganizationAiProvider>(initial.provider);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState('');
  // The key itself stays on the server; only the centre's id is sent.
  const [copyFrom, setCopyFrom] = useState<AiKeySource | null>(null);
  const [customPrompt, setCustomPrompt] = useState(initial.customPrompt);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [hasApiKey, setHasApiKey] = useState(initial.hasApiKey);

  const [pending, setPending] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  function handleProviderChange(next: OrganizationAiProvider) {
    setProvider(next);
    // Only replace the base URL when it still matches the previous preset's default (or is
    // empty) — someone who typed their own endpoint should never see it silently overwritten.
    const previousDefault = presets[provider]?.defaultBaseUrl ?? '';
    if (baseUrl === '' || baseUrl === previousDefault) {
      setBaseUrl(presets[next]?.defaultBaseUrl ?? '');
    }
    setTestResult(null);
  }

  function selectKeyFrom(source: AiKeySource) {
    setCopyFrom(source);
    setApiKey('');
    setProvider(source.provider);
    setBaseUrl(source.baseUrl ?? presets[source.provider]?.defaultBaseUrl ?? '');
    setModel(source.model ?? '');
    setTestResult(null);
    setSaved(false);
    setError(null);
  }

  async function save() {
    if (enabled && !hasApiKey && apiKey === '' && !copyFrom) {
      setSaved(false);
      setError('admin.aiSettings.keyRequired');
      return;
    }
    setPending('save');
    setError(null);
    setSaved(false);
    setTestResult(null);

    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl,
          model,
          ...(copyFrom
            ? { copyKeyFrom: copyFrom.organizationId }
            : apiKey !== ''
              ? { apiKey }
              : {}),
          customPrompt,
          enabled,
        }),
      });

      const json = (await response.json()) as
        | { data: { hasApiKey: boolean } }
        | { error: { messageKey: string; details?: { fields?: Record<string, string> } } };

      if (!response.ok || 'error' in json) {
        setError(
          'error' in json
            ? (Object.values(json.error.details?.fields ?? {})[0] ?? json.error.messageKey)
            : 'errors.internal',
        );
        return;
      }

      setHasApiKey(json.data.hasApiKey);
      setApiKey('');
      setCopyFrom(null);
      setSaved(true);
    } catch {
      setError('errors.internal');
    } finally {
      setPending(null);
    }
  }

  async function testConnection() {
    setPending('test');
    setError(null);
    setTestResult(null);

    try {
      const response = await fetch('/api/admin/ai-settings/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl,
          model,
          ...(copyFrom
            ? { copyKeyFrom: copyFrom.organizationId }
            : apiKey !== ''
              ? { apiKey }
              : {}),
        }),
      });

      const json = (await response.json()) as
        | { data: { ok: true } | { ok: false; reason: string } }
        | { error: { messageKey: string; details?: { fields?: Record<string, string> } } };

      if (!response.ok || 'error' in json) {
        setError(
          'error' in json
            ? (Object.values(json.error.details?.fields ?? {})[0] ?? json.error.messageKey)
            : 'errors.internal',
        );
        return;
      }

      setTestResult(json.data);
    } catch {
      setError('errors.internal');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminCard title={t('admin.aiSettings.vendorTitle')}>
        <div className="space-y-4">
          <AdminField label={t('admin.aiSettings.provider')} htmlFor="ai-provider">
            <AdminSelect
              id="ai-provider"
              value={provider}
              onChange={(event) => handleProviderChange(event.target.value as OrganizationAiProvider)}
            >
              {PROVIDER_ORDER.map((name) => (
                <option key={name} value={name}>
                  {presets[name]?.label ?? name}
                </option>
              ))}
            </AdminSelect>
          </AdminField>

          <AdminField
            label={t('admin.aiSettings.baseUrl')}
            htmlFor="ai-base-url"
            hint={t('admin.aiSettings.baseUrlHint')}
          >
            <AdminInput
              id="ai-base-url"
              value={baseUrl}
              placeholder={presets[provider]?.defaultBaseUrl || 'https://…'}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </AdminField>

          <AdminField label={t('admin.aiSettings.model')} htmlFor="ai-model">
            <AdminInput
              id="ai-model"
              value={model}
              placeholder="gpt-4o, gemini-3.6-flash, deepseek-chat…"
              onChange={(event) => setModel(event.target.value)}
            />
          </AdminField>

          <AdminField
            label={t('admin.aiSettings.apiKey')}
            htmlFor="ai-api-key"
            hint={
              hasApiKey
                ? t('admin.aiSettings.apiKeyHintConfigured')
                : t('admin.aiSettings.apiKeyHintEmpty')
            }
          >
            <AdminInput
              id="ai-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={
                hasApiKey
                  ? t('admin.aiSettings.apiKeyConfigured')
                  : t('admin.aiSettings.apiKeyPlaceholder')
              }
              onChange={(event) => {
                setApiKey(event.target.value);
                setCopyFrom(null);
              }}
            />
          </AdminField>

          {keySources.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {keySources.map((source) => (
                <AdminButton
                  key={source.organizationId}
                  type="button"
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => selectKeyFrom(source)}
                >
                  {t('admin.aiSettings.copyKey', { name: source.name })}
                </AdminButton>
              ))}
            </div>
          ) : null}
          {copyFrom ? (
            <AdminNote tone="info">
              {t('admin.aiSettings.copySelected', { name: copyFrom.name })}
            </AdminNote>
          ) : null}

          {testResult ? (
            <AdminNote tone={testResult.ok ? 'success' : 'danger'}>
              {testResult.ok
                ? t('admin.aiSettings.testSuccess')
                : t(testResult.reason ?? 'errors.ocr_provider_failed')}
            </AdminNote>
          ) : null}

          <AdminButton type="button" disabled={pending !== null} onClick={testConnection}>
            {t('admin.aiSettings.testConnection')}
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard
        title={t('admin.aiSettings.promptTitle')}
        description={t('admin.aiSettings.promptHelp')}
      >
        <div className="space-y-3">
          <AdminTextarea
            aria-label={t('admin.aiSettings.promptTitle')}
            rows={10}
            value={customPrompt}
            placeholder={t('admin.aiSettings.promptPlaceholder')}
            onChange={(event) => setCustomPrompt(event.target.value)}
          />
          <div className="rounded-md border border-slate-800 p-3 text-xs text-slate-400">
            <p className="font-medium text-slate-300">
              {t('admin.aiSettings.promptVariablesTitle')}
            </p>
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto font-mono">
              {fieldKeys.map((field) => (
                <li key={field.key}>
                  {field.key} <span className="font-sans text-slate-500">({field.label})</span>
                </li>
              ))}
            </ul>
          </div>
          <AdminNote tone="warning">{t('admin.aiSettings.promptSafetyNote')}</AdminNote>
        </div>
      </AdminCard>

      <AdminCard title={t('admin.aiSettings.processingTitle')}>
        <AdminCheckbox
          label={t('admin.aiSettings.enableLabel')}
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <p className="mt-2 text-xs text-slate-500">{t('admin.aiSettings.enableHint')}</p>
      </AdminCard>

      {error ? <AdminNote tone="danger">{t(error)}</AdminNote> : null}
      {saved ? <AdminNote tone="success">{t('admin.aiSettings.saved')}</AdminNote> : null}

      <AdminButton type="button" variant="primary" disabled={pending !== null} onClick={save}>
        {pending === 'save' ? t('common.saving') : t('common.save')}
      </AdminButton>
    </div>
  );
}
