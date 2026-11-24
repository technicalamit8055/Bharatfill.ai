'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from '@/lib/i18n/client';

/**
 * Says when AI reading is not set up yet, and nothing otherwise. Deliberately never names the
 * vendor or model (docs/AI_PIPELINE.md §2).
 */
export function AiReaderStatus() {
  const t = useTranslations();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/organizations/ai-settings')
      .then((response) => response.json())
      .then((json: { data?: { hasApiKey: boolean } }) => {
        if (!cancelled && json.data) setMissing(!json.data.hasApiKey);
      })
      .catch(() => {
        // Not worth surfacing an error for a nice-to-have note.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!missing) return null;

  return <p className="text-xs text-slate-500">{t('documents.extractionMode.aiNotConfigured')}</p>;
}
