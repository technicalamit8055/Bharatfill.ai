'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Field, Input, Select, TextField } from '@assistigo/ui';
import {
  PORTALS,
  checkPasswordAgainstPolicy,
  formatIndianDate,
  generatePortalPassword,
  getPortal,
  supportsOneClickLogin,
  type CredentialSecretPart,
  type LinkedApplication,
  type PortalCredentialView,
  type PortalKey,
} from '@assistigo/core';
import { useI18n } from '@/lib/i18n/client';
import { localised } from '@/lib/i18n';
import { DetailCard, DetailEmpty, ICON_BUTTON, OUTLINE_BUTTON, PRIMARY_BUTTON } from './detail-card';
import {
  CopiedIcon,
  CopyIcon,
  DeleteIcon,
  EditIcon,
  GenerateIcon,
  HiddenIcon,
  PlusIcon,
  PortalLoginIcon,
  PrintIcon,
  ViewIcon,
  WhatsappIcon,
} from '../icons';

/**
 * The customer's portal login vault (spec §19.7a; migration 0036).
 *
 * The list arrives masked. A secret is fetched only when the operator asks for that one part,
 * shown for 30 seconds, then dropped from memory. A printed slip is rendered only for the print
 * dialog and removed straight after, so a password is never left sitting in the page.
 */

const REVEAL_MS = 30_000;
const SLIP_ID = 'credential-slip';
const PRINTING_CLASS = 'printing-credential-slip';

type Slip = {
  portalName: string;
  loginIdLabel: string;
  loginId: string;
  password: string | null;
  homeUrl: string | null;
  customerName: string;
};

type Editor = { mode: 'new' } | { mode: 'edit'; credential: PortalCredentialView };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { messageKey?: string };
  } | null;
  if (!response.ok || !json || json.data === undefined) {
    throw new Error(json?.error?.messageKey ?? 'errors.internal');
  }
  return json.data;
}

function messageKeyOf(error: unknown): string {
  return error instanceof Error && error.message.includes('.') ? error.message : 'errors.internal';
}

export function PortalLoginsCard({
  customerId,
  canManage,
  hasMobile,
}: {
  customerId: string;
  canManage: boolean;
  hasMobile: boolean;
}) {
  const { t, locale } = useI18n();
  const base = `/api/customers/${customerId}/portal-credentials`;

  const [credentials, setCredentials] = useState<PortalCredentialView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let live = true;
    api<{ credentials: PortalCredentialView[] }>(base)
      .then((data) => live && setCredentials(data.credentials))
      .catch((caught: unknown) => live && setError(messageKeyOf(caught)));
    return () => {
      live = false;
    };
  }, [base]);

  // Drop every revealed value when the card goes away.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  // Print the slip once it is in the DOM, then remove it again.
  useEffect(() => {
    if (!slip) return;
    const done = () => {
      document.body.classList.remove(PRINTING_CLASS);
      setSlip(null);
    };
    document.body.classList.add(PRINTING_CLASS);
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
      document.body.classList.remove(PRINTING_CLASS);
    };
  }, [slip]);

  const hide = useCallback((key: string) => {
    setRevealed((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    const timer = timers.current.get(key);
    if (timer) clearTimeout(timer);
    timers.current.delete(key);
  }, []);

  async function reveal(credentialId: string, part: CredentialSecretPart) {
    const key = `${credentialId}:${part}`;
    setError(null);
    setBusy(key);
    try {
      const data = await api<{ value: string }>(`${base}/${credentialId}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ part }),
      });
      setRevealed((current) => ({ ...current, [key]: data.value }));
      timers.current.set(
        key,
        setTimeout(() => hide(key), REVEAL_MS),
      );
    } catch (caught) {
      setError(messageKeyOf(caught));
    } finally {
      setBusy(null);
    }
  }

  async function copy(key: string) {
    const value = revealed[key];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    } catch {
      // Clipboard blocked by the browser: the value is on screen to read instead.
    }
  }

  async function issueSlip(credentialId: string, channel: 'print' | 'whatsapp') {
    setError(null);
    setNotice(null);
    setBusy(`${credentialId}:${channel}`);
    try {
      if (channel === 'print') {
        const data = await api<{ slip: Slip }>(`${base}/${credentialId}/slip`, {
          method: 'POST',
          body: JSON.stringify({ channel }),
        });
        setSlip(data.slip);
      } else {
        await api<{ sent: true }>(`${base}/${credentialId}/slip`, {
          method: 'POST',
          body: JSON.stringify({ channel }),
        });
        setNotice(t('customers.portalLogins.sent'));
      }
    } catch (caught) {
      setError(messageKeyOf(caught));
    } finally {
      setBusy(null);
    }
  }

  async function remove(credentialId: string) {
    setError(null);
    setBusy(`${credentialId}:delete`);
    try {
      const data = await api<{ credentials: PortalCredentialView[] }>(`${base}/${credentialId}`, {
        method: 'DELETE',
      });
      setCredentials(data.credentials);
      setConfirmDelete(null);
    } catch (caught) {
      setError(messageKeyOf(caught));
    } finally {
      setBusy(null);
    }
  }

  function portalName(credential: PortalCredentialView): string {
    if (credential.portalKey === 'other' && credential.portalLabel) return credential.portalLabel;
    return localised(getPortal(credential.portalKey).name, locale);
  }

  function secretRow(credential: PortalCredentialView, part: CredentialSecretPart, masked: string) {
    const key = `${credential.id}:${part}`;
    const value = revealed[key];
    return (
      <span className="inline-flex items-center gap-1.5">
        <code className="rounded bg-slate-50 px-1.5 py-0.5 font-mono text-sm text-slate-800">
          {value ?? masked}
        </code>
        {value ? (
          <>
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('common.copy')}
              title={t('common.copy')}
              onClick={() => void copy(key)}
            >
              {copied === key ? <CopiedIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('customers.portalLogins.hide')}
              title={t('customers.portalLogins.hide')}
              onClick={() => hide(key)}
            >
              <HiddenIcon className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label={t('common.reveal')}
            title={t('common.reveal')}
            disabled={busy === key}
            onClick={() => void reveal(credential.id, part)}
          >
            <ViewIcon className="h-4 w-4" />
          </button>
        )}
      </span>
    );
  }

  return (
    <>
      <DetailCard
        id="portal-logins"
        icon={PortalLoginIcon}
        tone="violet"
        title={t('customers.portalLogins.title')}
        actions={
          canManage && !editor ? (
            <button type="button" className={PRIMARY_BUTTON} onClick={() => setEditor({ mode: 'new' })}>
              <PlusIcon className="h-4 w-4" />
              {t('customers.portalLogins.add')}
            </button>
          ) : null
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">{t('customers.portalLogins.subtitle')}</p>
          {error ? <Alert tone="danger">{t(error)}</Alert> : null}
          {notice ? <Alert tone="success">{notice}</Alert> : null}

          {editor ? (
            <CredentialEditor
              editor={editor}
              existing={credentials ?? []}
              base={base}
              onCancel={() => setEditor(null)}
              onSaved={(next) => {
                setCredentials(next);
                setEditor(null);
              }}
            />
          ) : null}

          {credentials === null && !error ? (
            <p className="text-sm text-slate-500">{t('common.loading')}</p>
          ) : null}

          {credentials && credentials.length === 0 && !editor ? (
            <DetailEmpty
              title={t('customers.portalLogins.empty')}
              description={t('customers.portalLogins.emptyHelp')}
            />
          ) : null}

          {credentials && credentials.length > 0 ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {credentials.map((credential) => (
                <li key={credential.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{portalName(credential)}</span>
                      <Badge tone={supportsOneClickLogin(credential.portalKey) ? 'info' : 'neutral'}>
                        {supportsOneClickLogin(credential.portalKey)
                          ? t('customers.portalLogins.oneClick')
                          : t('customers.portalLogins.vaultOnly')}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={OUTLINE_BUTTON}
                        disabled={busy === `${credential.id}:print`}
                        onClick={() => void issueSlip(credential.id, 'print')}
                      >
                        <PrintIcon className="h-4 w-4" />
                        {t('customers.portalLogins.printSlip')}
                      </button>
                      <button
                        type="button"
                        className={OUTLINE_BUTTON}
                        disabled={!hasMobile || busy === `${credential.id}:whatsapp`}
                        title={hasMobile ? undefined : t('errors.portal_slip_no_mobile')}
                        onClick={() => void issueSlip(credential.id, 'whatsapp')}
                      >
                        <WhatsappIcon className="h-4 w-4" />
                        {t('customers.portalLogins.sendWhatsapp')}
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={t('common.edit')}
                            title={t('common.edit')}
                            onClick={() => setEditor({ mode: 'edit', credential })}
                          >
                            <EditIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                            onClick={() => setConfirmDelete(credential.id)}
                          >
                            <DeleteIcon className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {confirmDelete === credential.id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                      <span>{t('customers.portalLogins.confirmDelete')}</span>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={busy === `${credential.id}:delete`}
                        onClick={() => void remove(credential.id)}
                      >
                        {t('common.delete')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : null}

                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
                    <dt className="text-slate-500">
                      {localised(getPortal(credential.portalKey).loginIdLabel, locale)}
                    </dt>
                    <dd>{secretRow(credential, 'login_id', credential.loginIdHint)}</dd>

                    <dt className="text-slate-500">{t('customers.portalLogins.password')}</dt>
                    <dd>
                      {credential.hasPassword ? (
                        secretRow(credential, 'password', '••••••••')
                      ) : (
                        <span className="text-slate-400">{t('customers.portalLogins.noPassword')}</span>
                      )}
                    </dd>

                    {credential.securityQuestion ? (
                      <>
                        <dt className="text-slate-500">{t('customers.portalLogins.securityQuestion')}</dt>
                        <dd className="space-y-1">
                          <p className="text-slate-800">{credential.securityQuestion}</p>
                          {credential.hasSecurityAnswer
                            ? secretRow(credential, 'security_answer', '••••••')
                            : null}
                        </dd>
                      </>
                    ) : null}

                    {credential.linkedApplications.length > 0 ? (
                      <>
                        <dt className="text-slate-500">{t('customers.portalLogins.linkedApplications')}</dt>
                        <dd>
                          <ul className="space-y-0.5">
                            {credential.linkedApplications.map((application, index) => (
                              <li key={index} className="text-slate-800">
                                {application.label} —{' '}
                                <span className="font-mono">{application.number}</span>
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  <p className="text-xs text-slate-400">
                    {[
                      credential.passwordUpdatedAt
                        ? t('customers.portalLogins.passwordSaved', {
                            date: formatIndianDate(credential.passwordUpdatedAt.slice(0, 10)) ?? '—',
                          })
                        : null,
                      credential.lastUsedAt
                        ? t('customers.portalLogins.lastUsed', {
                            date: formatIndianDate(credential.lastUsedAt.slice(0, 10)) ?? '—',
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-xs text-slate-400">{t('customers.portalLogins.privacyNote')}</p>
        </div>
      </DetailCard>

      {slip ? <CredentialSlip slip={slip} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

function CredentialEditor({
  editor,
  existing,
  base,
  onCancel,
  onSaved,
}: {
  editor: Editor;
  existing: readonly PortalCredentialView[];
  base: string;
  onCancel: () => void;
  onSaved: (credentials: PortalCredentialView[]) => void;
}) {
  const { t, locale } = useI18n();
  const editing = editor.mode === 'edit' ? editor.credential : null;

  // A catalogued portal already in the vault is offered for editing, not adding twice.
  const taken = new Set(existing.filter((c) => c.portalKey !== 'other').map((c) => c.portalKey));
  const firstFree = PORTALS.find((portal) => !taken.has(portal.key))?.key ?? 'other';

  const [portalKey, setPortalKey] = useState<PortalKey>(editing?.portalKey ?? firstFree);
  const [portalLabel, setPortalLabel] = useState(editing?.portalLabel ?? '');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [securityQuestion, setSecurityQuestion] = useState(editing?.securityQuestion ?? '');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [linked, setLinked] = useState<LinkedApplication[]>(editing?.linkedApplications ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policy = getPortal(portalKey).passwordPolicy;
  const issues = password ? checkPasswordAgainstPolicy(password, policy) : [];

  function generate() {
    setPassword(generatePortalPassword(policy));
    setShowPassword(true);
    setClearPassword(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const cleanLinked = linked
      .map((row) => ({ label: row.label.trim(), number: row.number.trim() }))
      .filter((row) => row.label && row.number);

    try {
      let body: Record<string, unknown>;
      if (!editing) {
        body = {
          portalKey,
          ...(portalKey === 'other' ? { portalLabel } : {}),
          loginId,
          ...(password ? { password } : {}),
          ...(securityQuestion.trim() ? { securityQuestion } : {}),
          ...(securityAnswer.trim() ? { securityAnswer } : {}),
          linkedApplications: cleanLinked,
        };
      } else {
        // Only what changed, so the audit line names exactly what the operator touched.
        const question = securityQuestion.trim() ? securityQuestion.trim() : null;
        const questionChanged = question !== (editing.securityQuestion ?? null);
        const linkedChanged =
          JSON.stringify(cleanLinked) !== JSON.stringify(editing.linkedApplications);
        body = {
          ...(portalKey === 'other' && portalLabel.trim() && portalLabel.trim() !== editing.portalLabel
            ? { portalLabel }
            : {}),
          ...(loginId.trim() ? { loginId } : {}),
          ...(clearPassword ? { password: null } : password ? { password } : {}),
          ...(questionChanged ? { securityQuestion: question } : {}),
          ...(question === null && editing.hasSecurityAnswer
            ? { securityAnswer: null }
            : securityAnswer.trim()
              ? { securityAnswer }
              : {}),
          ...(linkedChanged ? { linkedApplications: cleanLinked } : {}),
        };
      }

      const data = await api<{ credentials: PortalCredentialView[] }>(
        editing ? `${base}/${editing.id}` : base,
        { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      // The typed secrets go out of scope with the form.
      onSaved(data.credentials);
    } catch (caught) {
      setError(messageKeyOf(caught));
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4"
      autoComplete="off"
    >
      {error ? <Alert tone="danger">{t(error)}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('customers.portalLogins.portal')} htmlFor="portal-key" required>
          <Select
            id="portal-key"
            value={portalKey}
            disabled={Boolean(editing)}
            onChange={(event) => setPortalKey(event.target.value as PortalKey)}
          >
            {PORTALS.map((portal) => (
              <option
                key={portal.key}
                value={portal.key}
                disabled={!editing && portal.key !== 'other' && taken.has(portal.key)}
              >
                {localised(portal.name, locale)}
              </option>
            ))}
          </Select>
        </Field>

        {portalKey === 'other' ? (
          <TextField
            label={t('customers.portalLogins.portalLabel')}
            value={portalLabel}
            maxLength={80}
            required={!editing}
            onChange={(event) => setPortalLabel(event.target.value)}
          />
        ) : null}

        <TextField
          label={localised(getPortal(portalKey).loginIdLabel, locale)}
          value={loginId}
          maxLength={120}
          required={!editing}
          autoComplete="off"
          spellCheck={false}
          hint={
            editing
              ? t('customers.portalLogins.keepLoginId', { hint: editing.loginIdHint })
              : undefined
          }
          onChange={(event) => setLoginId(event.target.value)}
        />

        <Field
          label={t('customers.portalLogins.password')}
          htmlFor="portal-password"
          hint={
            issues.length > 0
              ? t('customers.portalLogins.policyWarning', {
                  issues: issues.map((issue) => t(`customers.portalLogins.issues.${issue}`)).join(', '),
                })
              : editing?.hasPassword
                ? t('customers.portalLogins.keepPassword')
                : t('customers.portalLogins.generateHelp')
          }
        >
          <div className="flex gap-2">
            <Input
              id="portal-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              maxLength={128}
              autoComplete="new-password"
              spellCheck={false}
              disabled={clearPassword}
              onChange={(event) => setPassword(event.target.value)}
              className="font-mono"
            />
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={showPassword ? t('customers.portalLogins.hide') : t('common.reveal')}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <HiddenIcon className="h-4 w-4" /> : <ViewIcon className="h-4 w-4" />}
            </button>
            <button type="button" className={OUTLINE_BUTTON} onClick={generate}>
              <GenerateIcon className="h-4 w-4" />
              {t('customers.portalLogins.generate')}
            </button>
          </div>
          {editing?.hasPassword ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(event) => {
                  setClearPassword(event.target.checked);
                  if (event.target.checked) setPassword('');
                }}
              />
              {t('customers.portalLogins.clearPassword')}
            </label>
          ) : null}
        </Field>

        <TextField
          label={t('customers.portalLogins.securityQuestion')}
          value={securityQuestion}
          maxLength={200}
          onChange={(event) => setSecurityQuestion(event.target.value)}
        />
        <TextField
          label={t('customers.portalLogins.securityAnswer')}
          value={securityAnswer}
          maxLength={200}
          autoComplete="off"
          disabled={!securityQuestion.trim()}
          hint={editing?.hasSecurityAnswer ? t('customers.portalLogins.keepAnswer') : undefined}
          onChange={(event) => setSecurityAnswer(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-800">
          {t('customers.portalLogins.linkedApplications')}
        </p>
        {linked.map((row, index) => (
          <div key={index} className="flex flex-wrap gap-2">
            <Input
              aria-label={t('customers.portalLogins.linkedLabel')}
              placeholder={t('customers.portalLogins.linkedLabel')}
              value={row.label}
              maxLength={80}
              className="min-w-0 flex-1"
              onChange={(event) =>
                setLinked((current) =>
                  current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)),
                )
              }
            />
            <Input
              aria-label={t('customers.portalLogins.linkedNumber')}
              placeholder={t('customers.portalLogins.linkedNumber')}
              value={row.number}
              maxLength={60}
              className="min-w-0 flex-1 font-mono"
              onChange={(event) =>
                setLinked((current) =>
                  current.map((item, i) => (i === index ? { ...item, number: event.target.value } : item)),
                )
              }
            />
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('customers.portalLogins.remove')}
              onClick={() => setLinked((current) => current.filter((_, i) => i !== index))}
            >
              <DeleteIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
        {linked.length < 20 ? (
          <button
            type="button"
            className={OUTLINE_BUTTON}
            onClick={() => setLinked((current) => [...current, { label: '', number: '' }])}
          >
            <PlusIcon className="h-4 w-4" />
            {t('customers.portalLogins.addLinked')}
          </button>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Thermal slip (58/80 mm). Hidden on screen; globals.css shows only this while printing.
// ---------------------------------------------------------------------------

function CredentialSlip({ slip }: { slip: Slip }) {
  const { t } = useI18n();
  const today = formatIndianDate(new Date().toISOString().slice(0, 10)) ?? '';
  return (
    <div id={SLIP_ID} aria-hidden>
      <p className="slip-title">{t('customers.portalLogins.slip.title', { portal: slip.portalName })}</p>
      <p>
        {t('customers.portalLogins.slip.candidate')}: {slip.customerName}
      </p>
      <hr />
      <p>{slip.loginIdLabel}</p>
      <p className="slip-value">{slip.loginId}</p>
      {slip.password !== null ? (
        <>
          <p>{t('customers.portalLogins.password')}</p>
          <p className="slip-value">{slip.password}</p>
        </>
      ) : null}
      {slip.homeUrl ? <p className="slip-small">{slip.homeUrl}</p> : null}
      <hr />
      <p className="slip-small">{t('customers.portalLogins.slip.keepPrivate')}</p>
      <p className="slip-small">{t('customers.portalLogins.slip.printed', { date: today })}</p>
    </div>
  );
}
