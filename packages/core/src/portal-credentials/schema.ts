/**
 * Request schemas and the API view for the portal credential vault.
 * Master spec §19.7a; migration 0036.
 *
 * The view never carries a secret. Login ID, password and security answer leave the server
 * only through the audited reveal, login-fill and slip endpoints, one at a time.
 */

import { z } from 'zod';
import { PORTAL_KEYS, type PortalKey } from './portals';

/** Passwords are not trimmed: a leading or trailing space may be part of one. */
const passwordSchema = z.string().min(1).max(128);
const loginIdSchema = z.string().trim().min(1).max(120);
const securityQuestionSchema = z.string().trim().min(1).max(200);
const securityAnswerSchema = z.string().trim().min(1).max(200);
const portalLabelSchema = z.string().trim().min(1).max(80);

/** An application or roll number filed under this login, e.g. "CGL 2026 — roll 2201…". */
export const linkedApplicationSchema = z.object({
  label: z.string().trim().min(1).max(80),
  number: z.string().trim().min(1).max(60),
});
export type LinkedApplication = z.infer<typeof linkedApplicationSchema>;

export const MAX_LINKED_APPLICATIONS = 20;

export const createPortalCredentialSchema = z
  .object({
    portalKey: z.enum(PORTAL_KEYS),
    portalLabel: portalLabelSchema.optional(),
    loginId: loginIdSchema,
    password: passwordSchema.optional(),
    securityQuestion: securityQuestionSchema.optional(),
    securityAnswer: securityAnswerSchema.optional(),
    linkedApplications: z.array(linkedApplicationSchema).max(MAX_LINKED_APPLICATIONS).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.portalKey === 'other' && !value.portalLabel) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['portalLabel'], message: 'required' });
    }
  });
export type CreatePortalCredentialInput = z.infer<typeof createPortalCredentialSchema>;

/**
 * A partial update. For each secret: absent keeps what is stored, a string replaces it, and
 * `null` clears it. The login ID cannot be cleared — a credential without one is not a
 * credential — so it is only ever replaced.
 */
export const updatePortalCredentialSchema = z.object({
  portalLabel: portalLabelSchema.optional(),
  loginId: loginIdSchema.optional(),
  password: passwordSchema.nullable().optional(),
  securityQuestion: securityQuestionSchema.nullable().optional(),
  securityAnswer: securityAnswerSchema.nullable().optional(),
  linkedApplications: z.array(linkedApplicationSchema).max(MAX_LINKED_APPLICATIONS).optional(),
});
export type UpdatePortalCredentialInput = z.infer<typeof updatePortalCredentialSchema>;

export const CREDENTIAL_SECRET_PARTS = ['login_id', 'password', 'security_answer'] as const;
export type CredentialSecretPart = (typeof CREDENTIAL_SECRET_PARTS)[number];

export const revealPortalCredentialSchema = z.object({ part: z.enum(CREDENTIAL_SECRET_PARTS) });

export const CREDENTIAL_SLIP_CHANNELS = ['print', 'whatsapp'] as const;
export type CredentialSlipChannel = (typeof CREDENTIAL_SLIP_CHANNELS)[number];

export const credentialSlipRequestSchema = z.object({ channel: z.enum(CREDENTIAL_SLIP_CHANNELS) });

/** The extension's one-click login request. The page URL decides the portal, not the caller. */
export const portalLoginFillRequestSchema = z.object({
  customerId: z.string().uuid(),
  pageUrl: z.string().max(2000),
});

/** One vault entry as the dashboard and the extension list it. No secret in here. */
export type PortalCredentialView = {
  id: string;
  portalKey: PortalKey;
  /** Free-text name, set only for `other`. */
  portalLabel: string | null;
  /** Last characters of the login ID, e.g. `•••••789`, so two entries can be told apart. */
  loginIdHint: string;
  hasPassword: boolean;
  securityQuestion: string | null;
  hasSecurityAnswer: boolean;
  linkedApplications: LinkedApplication[];
  passwordUpdatedAt: string | null;
  lastUsedAt: string | null;
  updatedAt: string;
};

/** What the extension receives for a one-click login. Lives only as long as the fill. */
export type PortalLoginFill = {
  portalKey: PortalKey;
  hosts: readonly string[];
  loginId: string;
  /** Null when only the login ID is on file; the operator then types the password. */
  password: string | null;
};

/** `•••••789`: the last three characters, or nothing at all for a very short ID. */
export function loginIdHint(loginId: string): string {
  const trimmed = loginId.trim();
  if (trimmed.length <= 4) return '••••';
  return `•••••${trimmed.slice(-3)}`;
}
