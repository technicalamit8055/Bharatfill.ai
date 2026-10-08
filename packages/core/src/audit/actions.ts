/**
 * Audit action catalogue.
 * Master spec §19.5 (minimum audit events), §18.2 (audit_logs).
 *
 * Audit rows are insert-only. There is no update or delete policy for any role.
 */

export const AUDIT_SENSITIVITY = ['normal', 'sensitive', 'critical'] as const;
export type AuditSensitivity = (typeof AUDIT_SENSITIVITY)[number];

export const AUDIT_ACTOR_TYPES = ['user', 'extension', 'system', 'support', 'webhook'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export type AuditActionDef = {
  action: string;
  entityType: string;
  sensitivity: AuditSensitivity;
  description: string;
};

const define = <T extends readonly AuditActionDef[]>(actions: T) => actions;

export const AUDIT_ACTIONS = define([
  // --- auth / membership ---------------------------------------------------
  {
    action: 'auth.login_failed',
    entityType: 'user',
    sensitivity: 'sensitive',
    description: 'Failed sign-in attempt',
  },
  {
    action: 'auth.session_revoked',
    entityType: 'user',
    sensitivity: 'sensitive',
    description: 'Session revoked',
  },
  {
    // The password was replaced through the emailed recovery link. Never carries the password,
    // only how the change was authorised and how many other sessions were signed out with it.
    action: 'auth.password_changed',
    entityType: 'user',
    sensitivity: 'sensitive',
    description: 'Password changed',
  },
  {
    // Recorded when the operator authorises the browser extension from the dashboard, which is
    // the moment they grant it their session (docs/EXTENSION.md §3).
    action: 'extension.paired',
    entityType: 'user',
    sensitivity: 'sensitive',
    description: 'Browser extension paired with this account',
  },
  {
    action: 'member.invited',
    entityType: 'organization_member',
    sensitivity: 'sensitive',
    description: 'Member invited',
  },
  {
    action: 'member.accepted',
    entityType: 'organization_member',
    sensitivity: 'normal',
    description: 'Invitation accepted',
  },
  {
    action: 'member.removed',
    entityType: 'organization_member',
    sensitivity: 'sensitive',
    description: 'Member removed',
  },
  {
    action: 'member.role_changed',
    entityType: 'organization_member',
    sensitivity: 'critical',
    description: 'Member role changed',
  },

  // --- organization --------------------------------------------------------
  {
    action: 'organization.created',
    entityType: 'organization',
    sensitivity: 'normal',
    description: 'Organization created',
  },
  {
    action: 'organization.updated',
    entityType: 'organization',
    sensitivity: 'normal',
    description: 'Organization settings updated',
  },
  {
    action: 'organization.security_updated',
    entityType: 'organization',
    sensitivity: 'critical',
    description: 'Security settings changed',
  },
  {
    action: 'organization.ai_settings_updated',
    entityType: 'organization',
    sensitivity: 'critical',
    description: 'AI vendor settings changed',
  },
  {
    action: 'organization.deleted',
    entityType: 'organization',
    sensitivity: 'critical',
    description: 'Organization deleted',
  },

  // --- customers -----------------------------------------------------------
  {
    action: 'customer.created',
    entityType: 'customer',
    sensitivity: 'normal',
    description: 'Customer created',
  },
  {
    action: 'customer.updated',
    entityType: 'customer',
    sensitivity: 'normal',
    description: 'Customer updated',
  },
  {
    action: 'customer.deleted',
    entityType: 'customer',
    sensitivity: 'critical',
    description: 'Customer deleted',
  },
  {
    action: 'customer.sensitive_revealed',
    entityType: 'customer',
    sensitivity: 'critical',
    description: 'Sensitive field revealed',
  },
  {
    action: 'customer.exported',
    entityType: 'customer',
    sensitivity: 'critical',
    description: 'Customer data exported',
  },

  // --- cross-centre roaming access (migration 0024) -------------------------
  // The only path in the product by which one tenant reads another tenant's citizen, so the
  // whole sequence is recorded — including the lookup that found nothing, because a pattern of
  // those is what an operator fishing for numbers looks like.
  {
    action: 'customer.roaming_lookup',
    entityType: 'customer',
    sensitivity: 'normal',
    description: 'Looked up a customer across the Assistigo network by mobile',
  },
  {
    action: 'customer.roaming_linked',
    entityType: 'customer_roaming_link',
    sensitivity: 'normal',
    description: 'Customer registered at another centre linked to this counter',
  },
  {
    action: 'customer.roaming_otp_requested',
    entityType: 'customer',
    sensitivity: 'sensitive',
    description: 'Consent OTP sent to a roaming customer',
  },
  {
    // Critical: this is the moment another centre's citizen record becomes readable here.
    action: 'customer.roaming_access_granted',
    entityType: 'customer_access_grant',
    sensitivity: 'critical',
    description: 'Time-limited access to a roaming customer granted after consent',
  },
  {
    action: 'customer.roaming_access_revoked',
    entityType: 'customer_access_grant',
    sensitivity: 'sensitive',
    description: 'Roaming access session ended early',
  },
  {
    action: 'customer.roaming_access_expired',
    entityType: 'customer_access_grant',
    sensitivity: 'normal',
    description: 'Roaming access session expired on its timer',
  },

  // --- documents -----------------------------------------------------------
  {
    action: 'document.uploaded',
    entityType: 'document',
    sensitivity: 'sensitive',
    description: 'Document uploaded',
  },
  {
    action: 'document.downloaded',
    entityType: 'document',
    sensitivity: 'sensitive',
    description: 'Signed URL issued for a document',
  },
  {
    action: 'document.deleted',
    entityType: 'document',
    sensitivity: 'critical',
    description: 'Document deleted',
  },
  {
    action: 'extraction.completed',
    entityType: 'document_extraction',
    sensitivity: 'normal',
    description: 'OCR extraction completed',
  },
  {
    action: 'extraction.accepted',
    entityType: 'document_extraction',
    sensitivity: 'sensitive',
    description: 'Extracted fields accepted into the profile',
  },
  {
    action: 'extraction.rejected',
    entityType: 'document_extraction',
    sensitivity: 'normal',
    description: 'Extracted fields rejected',
  },
  {
    action: 'derivative.created',
    entityType: 'document_derivative',
    sensitivity: 'normal',
    description: 'Prepared file generated',
  },

  // --- walk-in document drop (§9.1) ----------------------------------------
  {
    // Opening a drop session publishes a code that, until it expires, lets anyone who can read
    // it send documents into this organization. Worth a row for that reason alone.
    action: 'drop_session.created',
    entityType: 'document_drop_session',
    sensitivity: 'sensitive',
    description: 'Walk-in document drop session opened',
  },
  {
    // The moment staged intake becomes customer data: a profile appears, documents are created
    // and extraction is queued. Critical because it is the only step that crosses that line.
    action: 'drop_session.converted',
    entityType: 'document_drop_session',
    sensitivity: 'critical',
    description: 'Walk-in drop session converted into a customer and documents',
  },
  {
    action: 'drop_session.discarded',
    entityType: 'document_drop_session',
    sensitivity: 'sensitive',
    description: 'Walk-in drop session discarded without intake',
  },
  {
    // Reading staged bytes before the citizen is a customer. Every other route to a document's
    // contents is audited (document.downloaded), and an identity document is no less sensitive
    // for sitting in staging — so previewing one is a row here too.
    action: 'drop_file.previewed',
    entityType: 'document_drop_file',
    sensitivity: 'sensitive',
    description: 'Signed URL issued for a staged walk-in drop file',
  },
  {
    // A visiting centre writing into a citizen's home organization under a consent grant. The
    // only write in the product that crosses a tenant boundary, so it is critical and carries
    // the grant it was performed under.
    action: 'drop_file.saved_to_roaming',
    entityType: 'customer',
    sensitivity: 'critical',
    description: 'Walk-in drop files saved to a roaming customer at their home centre',
  },

  // --- form filling --------------------------------------------------------
  {
    action: 'fill_session.started',
    entityType: 'fill_session',
    sensitivity: 'sensitive',
    description: 'Form detection started',
  },
  {
    action: 'fill_session.completed',
    entityType: 'fill_session',
    sensitivity: 'sensitive',
    description: 'Fields filled on a form',
  },
  {
    action: 'form_report.created',
    entityType: 'form_report',
    sensitivity: 'normal',
    description: 'Unsupported form reported',
  },
  {
    action: 'adapter.updated',
    entityType: 'portal_adapter',
    sensitivity: 'normal',
    description: 'Portal adapter changed',
  },

  // --- applications --------------------------------------------------------
  {
    action: 'application.created',
    entityType: 'application',
    sensitivity: 'normal',
    description: 'Application created',
  },
  {
    action: 'application.updated',
    entityType: 'application',
    sensitivity: 'normal',
    description: 'Application updated',
  },
  {
    action: 'application.status_changed',
    entityType: 'application',
    sensitivity: 'normal',
    description: 'Application status changed',
  },
  {
    action: 'application.deleted',
    entityType: 'application',
    sensitivity: 'sensitive',
    description: 'Application deleted',
  },
  {
    action: 'application.document_updated',
    entityType: 'application_document',
    sensitivity: 'normal',
    description: 'Application document checklist updated',
  },

  // --- billing -------------------------------------------------------------
  {
    action: 'billing.plan_changed',
    entityType: 'subscription',
    sensitivity: 'sensitive',
    description: 'Plan changed',
  },
  {
    action: 'billing.webhook_processed',
    entityType: 'subscription',
    sensitivity: 'normal',
    description: 'Billing webhook processed',
  },

  // --- privacy -------------------------------------------------------------
  {
    action: 'consent.granted',
    entityType: 'consent_record',
    sensitivity: 'sensitive',
    description: 'Consent recorded',
  },
  {
    action: 'consent.withdrawn',
    entityType: 'consent_record',
    sensitivity: 'sensitive',
    description: 'Consent withdrawn',
  },
  {
    action: 'data.export_requested',
    entityType: 'data_request',
    sensitivity: 'critical',
    description: 'Data export requested',
  },
  {
    action: 'data.delete_requested',
    entityType: 'data_request',
    sensitivity: 'critical',
    description: 'Data deletion requested',
  },
  {
    action: 'data.deleted',
    entityType: 'data_request',
    sensitivity: 'critical',
    description: 'Data deleted',
  },

  // --- support -------------------------------------------------------------
  {
    action: 'support.access_granted',
    entityType: 'support_access_grant',
    sensitivity: 'critical',
    description: 'Support access granted',
  },
  {
    action: 'support.access_used',
    entityType: 'support_access_grant',
    sensitivity: 'critical',
    description: 'Support access used',
  },
  {
    action: 'support.access_revoked',
    entityType: 'support_access_grant',
    sensitivity: 'critical',
    description: 'Support access revoked',
  },

  // --- platform (Super Admin panel, §6.1) ----------------------------------
  // These rows carry organization_id = null: they are platform-wide acts, not tenant acts. Every
  // one of them changes what centres across the country see, so none is `normal`.
  {
    action: 'platform.admin_signed_in',
    entityType: 'platform_admin',
    sensitivity: 'sensitive',
    description: 'Internal staff opened the admin panel',
  },
  {
    action: 'platform.admin_granted',
    entityType: 'platform_admin',
    sensitivity: 'critical',
    description: 'Platform admin access granted',
  },
  {
    action: 'platform.admin_role_changed',
    entityType: 'platform_admin',
    sensitivity: 'critical',
    description: 'Platform admin role changed',
  },
  {
    action: 'platform.admin_revoked',
    entityType: 'platform_admin',
    sensitivity: 'critical',
    description: 'Platform admin access revoked',
  },
  {
    action: 'platform.scheme_created',
    entityType: 'schemes_catalog',
    sensitivity: 'sensitive',
    description: 'Global scheme created',
  },
  {
    action: 'platform.scheme_updated',
    entityType: 'schemes_catalog',
    sensitivity: 'sensitive',
    description: 'Global scheme updated',
  },
  {
    // Split from scheme_updated because it is the highest-frequency change and the one most
    // likely to be wrong in a way a citizen feels — a countdown that closes a day early.
    action: 'platform.scheme_deadline_updated',
    entityType: 'schemes_catalog',
    sensitivity: 'sensitive',
    description: 'Global scheme application window changed',
  },
  {
    // Split from scheme_updated because the upload path is separate and a logo is the one piece
    // of the catalogue that is an image rather than a claim — worth finding on its own.
    action: 'platform.scheme_logo_updated',
    entityType: 'schemes_catalog',
    sensitivity: 'normal',
    description: 'Global scheme logo uploaded or removed',
  },
  {
    // The detail page's banner and illustration (0028). Kept apart from the logo's action so its
    // history reads as before; `metadata.kind` says which image changed.
    action: 'platform.scheme_artwork_updated',
    entityType: 'schemes_catalog',
    sensitivity: 'normal',
    description: 'Global scheme banner or illustration uploaded or removed',
  },
  {
    action: 'platform.scheme_published',
    entityType: 'schemes_catalog',
    sensitivity: 'critical',
    description: 'Global scheme published or unpublished',
  },
  {
    action: 'platform.scheme_deleted',
    entityType: 'schemes_catalog',
    sensitivity: 'critical',
    description: 'Global scheme deleted',
  },
  {
    action: 'platform.adapter_updated',
    entityType: 'portal_adapter',
    sensitivity: 'sensitive',
    description: 'Global portal adapter changed',
  },
  {
    action: 'platform.scraper_source_updated',
    entityType: 'scraper_source',
    sensitivity: 'sensitive',
    description: 'Scraper source created, changed or removed',
  },
  {
    action: 'platform.scraper_run_triggered',
    entityType: 'scraper_run',
    sensitivity: 'sensitive',
    description: 'Scraper run triggered',
  },
  {
    action: 'platform.queue_item_approved',
    entityType: 'scraped_schemes_queue',
    sensitivity: 'critical',
    description: 'Scraped scheme approved and published to the live catalogue',
  },
  {
    action: 'platform.queue_item_rejected',
    entityType: 'scraped_schemes_queue',
    sensitivity: 'sensitive',
    description: 'Scraped scheme rejected',
  },
  {
    // Every centre's walk-in intake shares one WhatsApp/Telegram bot, so a change here is
    // platform-wide and touches a stored secret — critical for the same reason
    // organization.ai_settings_updated is.
    action: 'platform.channel_settings_updated',
    entityType: 'platform_channel_settings',
    sensitivity: 'critical',
    description: 'WhatsApp/Telegram channel settings changed',
  },
  {
    action: 'platform.plan_created',
    entityType: 'plans',
    sensitivity: 'critical',
    description: 'Billing plan created',
  },
  {
    // Critical: a limit changed here applies to every organization on the plan at once, and a
    // retired plan disappears from every centre's catalogue.
    action: 'platform.plan_updated',
    entityType: 'plans',
    sensitivity: 'critical',
    description: 'Billing plan changed, retired or reactivated',
  },
  {
    action: 'platform.channel_webhook_registered',
    entityType: 'platform_channel_settings',
    sensitivity: 'sensitive',
    description: 'Telegram webhook registered with Telegram',
  },
  {
    // A real account presented valid credentials at a console sign-in page and was turned away:
    // not staff, revoked, or at the wrong portal for its role. Wrong passwords never reach this —
    // there is no account to attribute them to — so a run of these is somebody who *can* sign in
    // probing a door they were not given.
    action: 'platform.console_access_denied',
    entityType: 'user',
    sensitivity: 'sensitive',
    description: 'Console sign-in refused for a signed-in account',
  },
  {
    // Critical: every member of the centre loses the dashboard and the extension at once.
    action: 'platform.tenant_suspended',
    entityType: 'organization',
    sensitivity: 'critical',
    description: 'Organization suspended by platform staff',
  },
  {
    action: 'platform.tenant_reactivated',
    entityType: 'organization',
    sensitivity: 'critical',
    description: 'Suspended organization reactivated by platform staff',
  },
  {
    // A billing override (spec §6.1): the plan a centre is on changed without the centre paying
    // for it or asking. `metadata` carries the from/to plan codes and the stated reason.
    action: 'platform.tenant_plan_overridden',
    entityType: 'organization',
    sensitivity: 'critical',
    description: 'Organization plan set manually by platform staff',
  },
  {
    // The early-access list left the console as a CSV. `metadata` carries the row count only.
    action: 'platform.launch_leads_exported',
    entityType: 'launch_lead',
    sensitivity: 'sensitive',
    description: 'Launch early-access list exported by platform staff',
  },
  {
    // An operator was taken off the early-access list. The number itself is never recorded.
    action: 'platform.launch_lead_deleted',
    entityType: 'launch_lead',
    sensitivity: 'sensitive',
    description: 'Launch early-access lead removed by platform staff',
  },
] as const);

export type AuditAction = (typeof AUDIT_ACTIONS)[number]['action'];

export const AUDIT_ACTION_BY_NAME: ReadonlyMap<string, AuditActionDef> = new Map(
  AUDIT_ACTIONS.map((definition) => [definition.action, definition]),
);

export function auditSensitivityFor(action: AuditAction): AuditSensitivity {
  return AUDIT_ACTION_BY_NAME.get(action)?.sensitivity ?? 'sensitive';
}

export function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === 'string' && AUDIT_ACTION_BY_NAME.has(value);
}

/**
 * Shape of an audit entry. `metadata` must already be redacted — build it with
 * `redact()` from ../privacy/redact.js.
 */
export type AuditEntry = {
  organizationId: string | null;
  actorUserId: string | null;
  actorType: AuditActorType;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  sensitivity: AuditSensitivity;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};
