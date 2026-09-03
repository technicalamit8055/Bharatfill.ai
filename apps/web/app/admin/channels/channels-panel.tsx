'use client';

import { useState } from 'react';
import type {
  ChannelSettingsResponse,
  TelegramChannelSummary,
  WhatsappChannelSummary,
} from '@assistigo/core';
import { useTranslations } from '@/lib/i18n/client';
import { AdminBadge, AdminButton, AdminCard, AdminField, AdminInput, AdminNote } from '../ui';

/**
 * Client panel for Super Admin "Channels & Bots" (§9.1).
 *
 * Two independent cards, one per channel, each with its own save/test/(webhook) actions — the
 * two channels never touch each other's state, so a WhatsApp token typo cannot block saving
 * Telegram. Every secret field is write-only: the server never returns a decrypted value, so
 * this panel only ever renders "configured" (`hasAccessToken` / `hasBotToken` / `hasAppSecret`)
 * and lets the operator type a replacement. Leaving a secret field blank on save keeps whatever
 * is already stored.
 */

function randomToken(bytes = 24): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function postJson<T>(url: string, body: unknown): Promise<{ data: T } | { error: { messageKey: string } }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { data: T } | { error: { messageKey: string } };
  if (!response.ok || 'error' in json) {
    return 'error' in json ? json : { error: { messageKey: 'errors.internal' } };
  }
  return json;
}

function SourceBadge({ source, isEnabled }: { source: string; isEnabled: boolean }) {
  const t = useTranslations();
  if (!isEnabled || source === 'unconfigured') {
    return <AdminBadge tone="neutral">{t('admin.channels.inactive')}</AdminBadge>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <AdminBadge tone="success">{t('admin.channels.active')}</AdminBadge>
      <AdminBadge tone={source === 'database' ? 'info' : 'neutral'}>
        {source === 'database' ? t('admin.channels.sourceDatabase') : t('admin.channels.sourceEnvironment')}
      </AdminBadge>
    </div>
  );
}

function CopyableUrl({ value }: { value: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the URL is still selectable text.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300">
        {value}
      </code>
      <AdminButton type="button" variant="ghost" onClick={copy}>
        {copied ? t('common.copied') : t('common.copy')}
      </AdminButton>
    </div>
  );
}

export function ChannelsPanel({ initial }: { initial: ChannelSettingsResponse }) {
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [telegram, setTelegram] = useState(initial.telegram);

  return (
    <div className="space-y-5">
      <WhatsAppCard initial={whatsapp} onSaved={setWhatsapp} />
      <TelegramCard initial={telegram} onSaved={setTelegram} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

function WhatsAppCard({
  initial,
  onSaved,
}: {
  initial: WhatsappChannelSummary;
  onSaved: (next: WhatsappChannelSummary) => void;
}) {
  const t = useTranslations();

  const [isEnabled, setIsEnabled] = useState(initial.isEnabled);
  const [phoneNumberId, setPhoneNumberId] = useState(initial.phoneNumberId ?? '');
  const [botNumber, setBotNumber] = useState(initial.botNumber ?? '');
  const [verifyToken, setVerifyToken] = useState(initial.verifyToken ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');

  const [pending, setPending] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  async function save() {
    setPending('save');
    setError(null);
    setSaved(false);
    setTestResult(null);

    const result = await postJson<WhatsappChannelSummary>('/api/admin/channels', {
      channel: 'whatsapp',
      isEnabled,
      phoneNumberId,
      botNumber,
      verifyToken,
      ...(accessToken !== '' ? { accessToken } : {}),
      ...(appSecret !== '' ? { appSecret } : {}),
    });

    setPending(null);
    if ('error' in result) {
      setError(result.error.messageKey);
      return;
    }
    onSaved(result.data);
    setAccessToken('');
    setAppSecret('');
    setSaved(true);
  }

  async function test() {
    setPending('test');
    setError(null);
    setTestResult(null);
    const result = await postJson<{ ok: boolean; reason?: string }>('/api/admin/channels/test', {
      channel: 'whatsapp',
    });
    setPending(null);
    if ('error' in result) {
      setError(result.error.messageKey);
      return;
    }
    setTestResult(result.data);
  }

  return (
    <AdminCard
      title={t('admin.channels.whatsapp.title')}
      description={t('admin.channels.whatsapp.subtitle')}
      actions={<SourceBadge source={initial.source} isEnabled={isEnabled} />}
    >
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(event) => setIsEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
          />
          {t('admin.channels.enableLabel')}
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label={t('admin.channels.whatsapp.phoneNumberId')} htmlFor="wa-phone-id">
            <AdminInput
              id="wa-phone-id"
              value={phoneNumberId}
              onChange={(event) => setPhoneNumberId(event.target.value)}
              placeholder="111111111111111"
            />
          </AdminField>

          <AdminField label={t('admin.channels.whatsapp.botNumber')} htmlFor="wa-bot-number">
            <AdminInput
              id="wa-bot-number"
              value={botNumber}
              onChange={(event) => setBotNumber(event.target.value)}
              placeholder="919900000000"
            />
          </AdminField>
        </div>

        <AdminField
          label={t('admin.channels.whatsapp.verifyToken')}
          htmlFor="wa-verify-token"
          hint={t('admin.channels.whatsapp.verifyTokenHint')}
        >
          <div className="flex items-center gap-2">
            <AdminInput
              id="wa-verify-token"
              value={verifyToken}
              onChange={(event) => setVerifyToken(event.target.value)}
              className="font-mono"
            />
            <AdminButton type="button" variant="ghost" onClick={() => setVerifyToken(randomToken(16))}>
              {t('admin.channels.generate')}
            </AdminButton>
          </div>
        </AdminField>

        <AdminField
          label={t('admin.channels.whatsapp.accessToken')}
          htmlFor="wa-access-token"
          hint={
            initial.hasAccessToken
              ? t('admin.channels.secretConfiguredHint')
              : t('admin.channels.secretEmptyHint')
          }
        >
          <AdminInput
            id="wa-access-token"
            type="password"
            autoComplete="off"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder={initial.hasAccessToken ? t('admin.channels.secretConfigured') : ''}
          />
        </AdminField>

        <AdminField
          label={t('admin.channels.whatsapp.appSecret')}
          htmlFor="wa-app-secret"
          hint={
            initial.hasAppSecret
              ? t('admin.channels.secretConfiguredHint')
              : t('admin.channels.secretEmptyHint')
          }
        >
          <AdminInput
            id="wa-app-secret"
            type="password"
            autoComplete="off"
            value={appSecret}
            onChange={(event) => setAppSecret(event.target.value)}
            placeholder={initial.hasAppSecret ? t('admin.channels.secretConfigured') : ''}
          />
        </AdminField>

        <AdminField label={t('admin.channels.webhookUrl')} hint={t('admin.channels.whatsapp.webhookHint')}>
          <CopyableUrl value={initial.webhookUrl} />
        </AdminField>

        {testResult ? (
          <AdminNote tone={testResult.ok ? 'success' : 'danger'}>
            {testResult.ok ? t('admin.channels.testSuccess') : t(testResult.reason ?? 'admin.channels.testFailed')}
          </AdminNote>
        ) : null}
        {error ? <AdminNote tone="danger">{t(error)}</AdminNote> : null}
        {saved ? <AdminNote tone="success">{t('admin.channels.saved')}</AdminNote> : null}

        <div className="flex flex-wrap items-center gap-2">
          <AdminButton type="button" variant="primary" disabled={pending !== null} onClick={save}>
            {pending === 'save' ? t('common.saving') : t('common.save')}
          </AdminButton>
          <AdminButton type="button" variant="secondary" disabled={pending !== null} onClick={test}>
            {pending === 'test' ? t('admin.channels.testing') : t('admin.channels.testConnection')}
          </AdminButton>
        </div>
      </div>
    </AdminCard>
  );
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

function TelegramCard({
  initial,
  onSaved,
}: {
  initial: TelegramChannelSummary;
  onSaved: (next: TelegramChannelSummary) => void;
}) {
  const t = useTranslations();

  const [isEnabled, setIsEnabled] = useState(initial.isEnabled);
  const [botUsername, setBotUsername] = useState(initial.botUsername ?? '');
  const [webhookSecret, setWebhookSecret] = useState(initial.webhookSecret ?? '');
  const [botToken, setBotToken] = useState('');

  const [pending, setPending] = useState<'save' | 'test' | 'webhook' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [webhookResult, setWebhookResult] = useState<{ ok: boolean; reason?: string } | null>(null);

  async function save() {
    setPending('save');
    setError(null);
    setSaved(false);
    setTestResult(null);
    setWebhookResult(null);

    const result = await postJson<TelegramChannelSummary>('/api/admin/channels', {
      channel: 'telegram',
      isEnabled,
      botUsername,
      webhookSecret,
      ...(botToken !== '' ? { botToken } : {}),
    });

    setPending(null);
    if ('error' in result) {
      setError(result.error.messageKey);
      return;
    }
    onSaved(result.data);
    setBotToken('');
    setSaved(true);
  }

  async function test() {
    setPending('test');
    setError(null);
    setTestResult(null);
    const result = await postJson<{ ok: boolean; reason?: string }>('/api/admin/channels/test', {
      channel: 'telegram',
    });
    setPending(null);
    if ('error' in result) {
      setError(result.error.messageKey);
      return;
    }
    setTestResult(result.data);
  }

  async function setWebhook() {
    setPending('webhook');
    setError(null);
    setWebhookResult(null);
    const result = await postJson<{ ok: boolean; reason?: string }>('/api/admin/channels/set-webhook', {
      channel: 'telegram',
    });
    setPending(null);
    if ('error' in result) {
      setError(result.error.messageKey);
      return;
    }
    setWebhookResult(result.data);
  }

  return (
    <AdminCard
      title={t('admin.channels.telegram.title')}
      description={t('admin.channels.telegram.subtitle')}
      actions={<SourceBadge source={initial.source} isEnabled={isEnabled} />}
    >
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(event) => setIsEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-900"
          />
          {t('admin.channels.enableLabel')}
        </label>

        <AdminField label={t('admin.channels.telegram.botUsername')} htmlFor="tg-bot-username">
          <AdminInput
            id="tg-bot-username"
            value={botUsername}
            onChange={(event) => setBotUsername(event.target.value)}
            placeholder="my_centre_bot"
          />
        </AdminField>

        <AdminField
          label={t('admin.channels.telegram.webhookSecret')}
          htmlFor="tg-webhook-secret"
          hint={t('admin.channels.telegram.webhookSecretHint')}
        >
          <div className="flex items-center gap-2">
            <AdminInput
              id="tg-webhook-secret"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              className="font-mono"
            />
            <AdminButton type="button" variant="ghost" onClick={() => setWebhookSecret(randomToken(24))}>
              {t('admin.channels.generate')}
            </AdminButton>
          </div>
        </AdminField>

        <AdminField
          label={t('admin.channels.telegram.botToken')}
          htmlFor="tg-bot-token"
          hint={
            initial.hasBotToken
              ? t('admin.channels.secretConfiguredHint')
              : t('admin.channels.secretEmptyHint')
          }
        >
          <AdminInput
            id="tg-bot-token"
            type="password"
            autoComplete="off"
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
            placeholder={initial.hasBotToken ? t('admin.channels.secretConfigured') : ''}
          />
        </AdminField>

        <AdminField label={t('admin.channels.webhookUrl')} hint={t('admin.channels.telegram.webhookHint')}>
          <CopyableUrl value={initial.webhookUrl} />
        </AdminField>

        {testResult ? (
          <AdminNote tone={testResult.ok ? 'success' : 'danger'}>
            {testResult.ok ? t('admin.channels.testSuccess') : t(testResult.reason ?? 'admin.channels.testFailed')}
          </AdminNote>
        ) : null}
        {webhookResult ? (
          <AdminNote tone={webhookResult.ok ? 'success' : 'danger'}>
            {webhookResult.ok
              ? t('admin.channels.telegram.webhookRegistered')
              : t(webhookResult.reason ?? 'admin.channels.telegram.webhookFailed')}
          </AdminNote>
        ) : null}
        {error ? <AdminNote tone="danger">{t(error)}</AdminNote> : null}
        {saved ? <AdminNote tone="success">{t('admin.channels.saved')}</AdminNote> : null}

        <div className="flex flex-wrap items-center gap-2">
          <AdminButton type="button" variant="primary" disabled={pending !== null} onClick={save}>
            {pending === 'save' ? t('common.saving') : t('common.save')}
          </AdminButton>
          <AdminButton type="button" variant="secondary" disabled={pending !== null} onClick={test}>
            {pending === 'test' ? t('admin.channels.testing') : t('admin.channels.testConnection')}
          </AdminButton>
          <AdminButton type="button" variant="secondary" disabled={pending !== null} onClick={setWebhook}>
            {pending === 'webhook'
              ? t('admin.channels.telegram.registeringWebhook')
              : t('admin.channels.telegram.setWebhook')}
          </AdminButton>
        </div>
      </div>
    </AdminCard>
  );
}
