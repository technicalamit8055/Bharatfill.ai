'use client';

import { useState } from 'react';
import { Alert, Button, Card, Input, Select, Switch, Textarea } from '@assistigo/ui';
import type { ProviderPreset } from '@/lib/ai/vendor-settings';
import type { OrganizationAiProvider } from '@/lib/supabase/database.types';
import { useTranslations } from '@/lib/i18n/client';

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
  'ollama',
  'openrouter',
  'custom',
];

/**
 * Organization AI vendor settings form (docs/AI_PIPELINE.md §2).
 *
 * The API key field is write-only by design: the server never returns a stored key, so this
 * form only ever shows whether one is set (`hasApiKey`) and lets the owner type a replacement.
 * Leaving it blank on save keeps whatever is already stored; typing a new value replaces it.
 */
export function AiSettingsForm({
  initial,
  fieldKeys,
  presets,
}: {
  initial: Initial;
  fieldKeys: FieldKey[];
  presets: Record<OrganizationAiProvider, ProviderPreset>;
}) {
  const t = useTranslations();

  const [provider, setProvider] = useState<OrganizationAiProvider>(initial.provider);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState('');
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
    // empty) — an owner who typed their own endpoint should never see it silently overwritten.
    const previousDefault = presets[provider]?.defaultBaseUrl ?? '';
    if (baseUrl === '' || baseUrl === previousDefault) {
      setBaseUrl(presets[next]?.defaultBaseUrl ?? '');
    }
    setTestResult(null);
  }

  async function save() {
    setPending('save');
    setError(null);
    setSaved(false);
    setTestResult(null);

    try {
      const response = await fetch('/api/organizations/ai-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl,
          model,
          ...(apiKey !== '' ? { apiKey } : {}),
          customPrompt,
          enabled,
        }),
      });

      const json = (await response.json()) as
        | { data: { hasApiKey: boolean } }
        | { error: { messageKey: string } };

      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'errors.internal');
        return;
      }

      setHasApiKey(json.data.hasApiKey);
      setApiKey('');
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
      const response = await fetch('/api/organizations/ai-settings/test-connection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider,
          baseUrl,
          model,
          ...(apiKey !== '' ? { apiKey } : {}),
        }),
      });

      const json = (await response.json()) as
        | { data: { ok: true } | { ok: false; reason: string } }
        | { error: { messageKey: string } };

      if (!response.ok || 'error' in json) {
        setError('error' in json ? json.error.messageKey : 'errors.internal');
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
      <Card title={t('settings.ai.vendorTitle')}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="ai-provider" className="text-sm font-medium text-slate-800">
              {t('settings.ai.provider')}
            </label>
            <Select
              id="ai-provider"
              value={provider}
              onChange={(event) => handleProviderChange(event.target.value as OrganizationAiProvider)}
            >
              {PROVIDER_ORDER.map((name) => (
                <option key={name} value={name}>
                  {presets[name]?.label ?? name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ai-base-url" className="text-sm font-medium text-slate-800">
              {t('settings.ai.baseUrl')}
            </label>
            <Input
              id="ai-base-url"
              value={baseUrl}
              placeholder={presets[provider]?.defaultBaseUrl || 'https://…'}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
            <p className="text-xs text-slate-500">{t('settings.ai.baseUrlHint')}</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ai-model" className="text-sm font-medium text-slate-800">
              {t('settings.ai.model')}
            </label>
            <Input
              id="ai-model"
              value={model}
              placeholder="gpt-4o, gemini-3.6-flash, deepseek-chat…"
              onChange={(event) => setModel(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ai-api-key" className="text-sm font-medium text-slate-800">
              {t('settings.ai.apiKey')}
            </label>
            <Input
              id="ai-api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={hasApiKey ? t('settings.ai.apiKeyConfigured') : t('settings.ai.apiKeyPlaceholder')}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <p className="text-xs text-slate-500">
              {hasApiKey ? t('settings.ai.apiKeyHintConfigured') : t('settings.ai.apiKeyHintEmpty')}
            </p>
          </div>

          {testResult ? (
            <Alert tone={testResult.ok ? 'success' : 'danger'}>
              {testResult.ok
                ? t('settings.ai.testSuccess')
                : t(testResult.reason ?? 'errors.ocr_provider_failed')}
            </Alert>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            loading={pending === 'test'}
            onClick={testConnection}
          >
            {t('settings.ai.testConnection')}
          </Button>
        </div>
      </Card>

      <Card title={t('settings.ai.promptTitle')}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t('settings.ai.promptHelp')}</p>
          <Textarea
            aria-label={t('settings.ai.promptTitle')}
            rows={10}
            value={customPrompt}
            placeholder={t('settings.ai.promptPlaceholder')}
            onChange={(event) => setCustomPrompt(event.target.value)}
          />
          <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">{t('settings.ai.promptVariablesTitle')}</p>
            <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto font-mono">
              {fieldKeys.map((field) => (
                <li key={field.key}>
                  {field.key} <span className="font-sans text-slate-400">({field.label})</span>
                </li>
              ))}
            </ul>
          </div>
          <Alert tone="warning">{t('settings.ai.promptSafetyNote')}</Alert>
        </div>
      </Card>

      <Card title={t('settings.ai.processingTitle')}>
        <Switch
          label={t('settings.ai.enableLabel')}
          hint={t('settings.ai.enableHint')}
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </Card>

      {error ? <Alert tone="danger">{t(error)}</Alert> : null}
      {saved ? <Alert tone="success">{t('settings.ai.saved')}</Alert> : null}

      <Button onClick={save} loading={pending === 'save'}>
        {t('common.save')}
      </Button>
    </div>
  );
}
