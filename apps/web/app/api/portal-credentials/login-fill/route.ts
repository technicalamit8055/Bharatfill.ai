import {
  AppError,
  notFound,
  portalForUrl,
  portalLoginFillRequestSchema,
  type PortalLoginFill,
} from '@assistigo/core';
import { requirePermission, resolveContext } from '@/lib/api/context';
import { handler, ok, parseBody } from '@/lib/api/response';
import { writeAuditLog } from '@/lib/api/audit';
import {
  NO_STORE,
  loadCredentialForPortal,
  loadOwnCustomer,
  touchLastUsed,
} from '@/lib/portal-credentials/access';
import { readSecret } from '@/lib/portal-credentials/rows';

/**
 * POST /api/portal-credentials/login-fill
 *
 * The extension's one-click login (spec §19.7a; docs/EXTENSION.md § Portal login). Called only
 * after the operator presses "Log in as …" in the side panel.
 *
 * The portal is decided here from the page URL, never named by the caller: the URL must be
 * `https:` on a catalogue host (`portalForUrl`), so a look-alike page cannot be handed a
 * password by asking for "ssc". The content script re-checks its own location against the
 * returned hosts before it types anything. Nothing is ever submitted — the operator solves the
 * CAPTCHA and presses the portal's login button.
 */
export const POST = handler('api.portal_credentials.login_fill', async (request) => {
  const context = await resolveContext(request);
  requirePermission(context, 'credential.use');
  requirePermission(context, 'fill.run');

  const { customerId, pageUrl } = await parseBody(request, portalLoginFillRequestSchema);

  const portal = portalForUrl(pageUrl);
  if (!portal) throw new AppError('VALIDATION_FAILED', 'errors.portal_login_host_not_allowed');

  await loadOwnCustomer(context, customerId);
  const row = await loadCredentialForPortal(context, customerId, portal.key);
  if (!row) throw notFound('errors.portal_credential_missing');

  const loginId = readSecret(row, 'login_id');
  if (loginId === null) throw new AppError('INTERNAL', 'errors.portal_credential_unreadable');
  const password = readSecret(row, 'password');

  await writeAuditLog(context, {
    action: 'customer.portal_login_filled',
    entityType: 'customer',
    entityId: customerId,
    // The host is public; the path and query are not kept.
    metadata: { credentialId: row.id, portalKey: portal.key, host: new URL(pageUrl).hostname },
  });
  await touchLastUsed(context, row.id);

  const fill: PortalLoginFill = { portalKey: portal.key, hosts: portal.hosts, loginId, password };
  return ok(fill, NO_STORE);
});
