'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from '@/lib/i18n/client';

type Summary = { provider: string; enabled: boolean; hasApiKey: boolean };

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  gemini: 'Google Gemini',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  custom: 'Custom',
};

/**
 * "Currently reads with: DeepSeek" — so an operator choosing the AI reading mode knows which
 * vendor a document will actually be sent to, without needing settings access themselves
 * (docs/AI_PIPELINE.md §2). Read-only: `GET /api/organizations/ai-settings` is open to any
 * active member, but never returns the key.
 */
export function ActiveAiVendorNote() {
  const t = useTranslations();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/organizations/ai-settings')
      .then((response) => response.json())
      .then((json: { data?: Summary }) => {
        if (!cancelled && json.data) setSummary(json.data);
      })
      .catch(() => {
        // Not worth surfacing an error for a nice-to-have note.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary) return null;

  const vendorLabel = PROVIDER_LABELS[summary.provider] ?? summary.provider;

  return (
    <p className="text-xs text-slate-500">
      {summary.enabled && summary.hasApiKey
        ? t('documents.extractionMode.activeVendor', { vendor: vendorLabel })
        : t('documents.extractionMode.aiNotConfigured')}
    </p>
  );
}
