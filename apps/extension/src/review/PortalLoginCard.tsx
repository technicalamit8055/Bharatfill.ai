import { useCallback, useEffect, useState } from 'react';
import { AlertIcon, CheckIcon, ExternalIcon, ShieldIcon } from '../shared/Brand';
import { send } from '../shared/send';
import type { CustomerSummary, PortalLoginStatus } from '../shared/messages';
import type { PortalLoginResult } from '../content/login-filler';

/**
 * "Log in as [Customer]" on a recognised portal login page (spec §19.7a; docs/EXTENSION.md
 * § Portal login).
 *
 * Shows nothing on any page that is not an allow-listed portal. The button sends a bare
 * `FILL_PORTAL_LOGIN`; the background worker decides the page and the customer itself, fetches
 * the login, and has the content script type it. The panel never sees the password. The operator
 * still solves the CAPTCHA and presses the portal's own login button.
 */

const ERROR_TEXT: Record<string, string> = {
  portal_not_allowed: 'This page is not a portal login Bharatfill can fill.',
  no_customer_selected: 'Pick a customer first.',
  roaming_not_supported: "Saved portal logins stay at the customer's home centre.",
  login_fill_failed: 'Could not reach this page. Reload it and try again.',
  'errors.portal_credential_missing': 'No saved login for this portal.',
  'errors.portal_login_host_not_allowed': 'This page is not a portal login Bharatfill can fill.',
  'errors.permission_denied': 'Your role cannot use saved portal logins.',
  'errors.encryption_unavailable': 'Saved logins are unavailable right now. Tell your admin.',
};

function resultText(result: PortalLoginResult, hasPassword: boolean): {
  tone: 'success' | 'warn';
  text: string;
} {
  if (result.status === 'refused') {
    return {
      tone: 'warn',
      text:
        result.reason === 'host_not_allowed'
          ? 'The page changed before filling. Nothing was typed.'
          : "Couldn't find the login boxes on this page. Open the portal's login page first.",
    };
  }
  const solve = result.captchaPresent
    ? ' Solve the CAPTCHA and press the portal’s Login button yourself.'
    : ' Check it and press the portal’s Login button yourself.';
  if (result.loginIdFilled && result.passwordFilled) {
    return { tone: 'success', text: `Login ID and password filled.${solve}` };
  }
  if (result.passwordFilled) {
    return { tone: 'success', text: `Password filled.${solve}` };
  }
  return {
    tone: 'warn',
    text: hasPassword
      ? 'Login ID filled. If the portal asks for the password on the next screen, press this button again there.'
      : `Login ID filled. No password is saved — type it in.${solve}`,
  };
}

export function PortalLoginCard({ customer }: { customer: CustomerSummary | null }) {
  const [status, setStatus] = useState<PortalLoginStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'warn'; text: string } | null>(null);

  const check = useCallback(async () => {
    const response = await send<PortalLoginStatus>({ type: 'GET_PORTAL_LOGIN' });
    setStatus(response.ok ? response.data : null);
  }, []);

  // Re-check when the customer changes, the operator switches tab, or a tab finishes loading.
  useEffect(() => {
    setOutcome(null);
    void check();
  }, [check, customer?.id]);

  useEffect(() => {
    const onActivated = () => {
      setOutcome(null);
      void check();
    };
    const onUpdated = (_tabId: number, change: chrome.tabs.TabChangeInfo) => {
      if (change.url !== undefined || change.status === 'complete') onActivated();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    window.addEventListener('focus', onActivated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      window.removeEventListener('focus', onActivated);
    };
  }, [check]);

  if (!status?.portal) return null;

  const portalName = status.portal.name;

  if (!status.credential) {
    if (status.unavailable === 'no_permission') return null;
    return (
      <div className="notice notice-info">
        <ShieldIcon size={13} />
        <span className="tiny">
          {status.unavailable === 'no_customer'
            ? `${portalName} login page — pick a customer to log in as them.`
            : status.unavailable === 'roaming'
              ? "Saved portal logins stay at the customer's home centre."
              : `No saved ${portalName} login for this customer.`}
          {status.unavailable === 'not_saved' && customer ? (
            <>
              {' '}
              <button
                type="button"
                className="btn-ghost tiny"
                style={{ padding: '0 4px' }}
                onClick={() =>
                  void send({ type: 'OPEN_DASHBOARD', path: `/customers/${customer.id}#portal-logins` })
                }
              >
                Add it <ExternalIcon size={11} />
              </button>
            </>
          ) : null}
        </span>
      </div>
    );
  }

  const credential = status.credential;

  async function logIn() {
    setBusy(true);
    setOutcome(null);
    const response = await send<PortalLoginResult>({ type: 'FILL_PORTAL_LOGIN' });
    setBusy(false);
    if (response.ok) {
      setOutcome(resultText(response.data, credential.hasPassword));
    } else {
      const key = response.messageKey ?? response.error;
      setOutcome({ tone: 'warn', text: ERROR_TEXT[key] ?? 'Could not fill the login. Try again.' });
    }
  }

  return (
    <div className="card stack-sm">
      <div className="spread">
        <span className="row small strong truncate">
          <ShieldIcon size={13} />
          {portalName}
        </span>
        <span className="badge badge-muted">{credential.loginIdHint}</span>
      </div>
      <button
        type="button"
        className="btn-primary btn-block"
        disabled={busy}
        onClick={() => void logIn()}
      >
        {busy ? <span className="spinner" /> : null}
        Log in as {customer?.displayName ?? 'customer'}
      </button>
      <p className="tiny muted">
        Fills the login ID{credential.hasPassword ? ' and password' : ''}. You solve the CAPTCHA and
        press Login — Bharatfill never submits.
      </p>
      {outcome ? (
        <div className={`notice ${outcome.tone === 'success' ? 'notice-ok' : 'notice-warn'}`}>
          {outcome.tone === 'success' ? <CheckIcon size={13} /> : <AlertIcon size={13} />}
          <span className="tiny">{outcome.text}</span>
        </div>
      ) : null}
    </div>
  );
}
