/**
 * Environment access, validated once.
 *
 * Server-only secrets are read through `serverEnv()`, which throws if called from the browser.
 * That makes an accidental import into a client component a build-time crash rather than a
 * leaked service-role key.
 */

import { z } from 'zod';

/**
 * `.env.local` conventionally leaves an unconfigured optional secret as a bare `KEY=` line
 * rather than omitting it, which sets `process.env.KEY` to `""` — not `undefined`. Zod's
 * `.optional()` only tolerates `undefined`, so a blank value would otherwise still have to
 * satisfy the base schema (e.g. `.min(16)`) and fail. Preprocessing blank strings to
 * `undefined` makes "blank" and "absent" mean the same thing everywhere below.
 */
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalString = (schema: z.ZodString) => z.preprocess(blankToUndefined, schema.optional());

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_ENV: z.enum(['local', 'development', 'staging', 'production']).default('local'),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  FIELD_ENCRYPTION_KEY: optionalString(z.string().min(1)),
  /**
   * The local, on-box reader — the one that never lets a byte leave this server. `local` reads
   * embedded PDF text and text uploads; `mock` reads the demo fixtures and is what the test
   * suite pins itself to (docs/AI_PIPELINE.md §2).
   */
  OCR_PROVIDER: z.enum(['mock', 'local', 'tesseract', 'anthropic']).default('local'),
  /**
   * The AI vision reader. `none` by default, so the AI path fails closed: an organization that
   * has opted in still gets nothing until an operator of this deployment configures a provider.
   */
  OCR_AI_PROVIDER: z.enum(['none', 'deepseek', 'anthropic']).default('none'),
  /** Required when OCR_AI_PROVIDER=deepseek. */
  DEEPSEEK_API_KEY: optionalString(z.string()),
  /** Overrides the provider's default endpoint — any OpenAI-compatible base URL. */
  OCR_AI_BASE_URL: optionalString(z.string().url()),
  /** Overrides the provider's default model id. */
  OCR_AI_MODEL: optionalString(z.string()),
  ANTHROPIC_API_KEY: optionalString(z.string()),
  BILLING_PROVIDER: z.enum(['mock', 'razorpay', 'stripe']).default('mock'),
  EXTENSION_ALLOWED_IDS: optionalString(z.string()),
  /**
   * Shared secret for `POST /api/jobs/run`. That route runs with the service-role client, so
   * it fails closed: unset means the endpoint refuses every request rather than running
   * unauthenticated work.
   */
  JOB_RUNNER_SECRET: optionalString(z.string().min(16)),
  /**
   * Shared secret the configured billing provider must present on `POST /api/billing/webhook`.
   * That route runs with the service-role client, so — same as `JOB_RUNNER_SECRET` — it fails
   * closed: unset means the endpoint refuses every request rather than processing an
   * unauthenticated billing event.
   */
  BILLING_WEBHOOK_SECRET: optionalString(z.string().min(16)),
  /**
   * Whether `POST /api/documents/:id/process` runs that document's extraction job in-request
   * instead of leaving it for a scheduler.
   *
   * On by default, because the alternative is worse: with no scheduler pointed at
   * `/api/jobs/run`, an uploaded document sits at `processing` — "Reading" in the UI — forever.
   * The inline run claims only the job belonging to the document being processed, so one
   * tenant's upload never ends up running another's work.
   *
   * Set to `off` when a scheduler owns the queue and upload requests should stay fast.
   */
  JOB_INLINE_RUNNER: z.enum(['on', 'off']).default('on'),
  /**
   * Walk-in document drop channels (spec §9.1).
   *
   * Every one of these is optional and every one fails closed: with no credentials configured
   * the channel refuses to mint a session and its webhook returns 404, rather than half-working.
   * The mobile web drop needs none of them, so a deployment that configures nothing here still
   * has a working walk-in intake.
   */
  /** Verify token echoed back to Meta during the webhook handshake. */
  WHATSAPP_VERIFY_TOKEN: optionalString(z.string().min(16)),
  /** Graph API token used to fetch inbound media and post the acknowledgement replies. */
  WHATSAPP_ACCESS_TOKEN: optionalString(z.string().min(16)),
  /** The business phone number id messages are sent from. */
  WHATSAPP_PHONE_NUMBER_ID: optionalString(z.string()),
  /** The public number a citizen messages, used to build the `wa.me` deep link. */
  WHATSAPP_BOT_NUMBER: optionalString(z.string()),
  /**
   * Meta's `X-Hub-Signature-256` app secret. Separate from the verify token, which only
   * authenticates the one-time handshake and says nothing about a later delivery.
   */
  WHATSAPP_APP_SECRET: optionalString(z.string().min(16)),
  TELEGRAM_BOT_TOKEN: optionalString(z.string().min(16)),
  /** The bot's @handle, used to build the `t.me` deep link. */
  TELEGRAM_BOT_USERNAME: optionalString(z.string()),
  /** Secret token Telegram echoes in `X-Telegram-Bot-Api-Secret-Token` on every delivery. */
  TELEGRAM_WEBHOOK_SECRET: optionalString(z.string().min(16)),
  /**
   * Comma-separated emails that are treated as platform Super Admins even without a
   * `platform_admins` row (spec §6.1).
   *
   * This is a bootstrap, not the mechanism: the first owner has to be able to open /admin on a
   * fresh database in order to add anybody else. Unset means no bootstrap — the roster table is
   * then the only way in, which is where a mature deployment should end up.
   */
  ADMIN_EMAILS: optionalString(z.string()),
  /**
   * Whether the scraper's `http` fetcher may make outbound requests to a source URL.
   *
   * Off by default and deliberately a deployment-level switch rather than a per-source setting.
   * Configuring a source is a content decision an employee makes; pointing this product's servers
   * at a government portal is an operational and legal one that belongs to whoever runs the
   * deployment. With it off, an `http` source stages nothing and its run records why.
   */
  SCRAPER_HTTP_ENABLED: z.enum(['on', 'off']).default('off'),
  /**
   * Whether "Continue with Google" on the sign-in screen starts an OAuth flow.
   *
   * Off by default. Turning it on also needs the Google provider configured in Supabase Auth,
   * and is a product decision: a first Google sign-in creates an account without the sign-up
   * form's terms/privacy consent step. With it off the button explains that it is unavailable.
   */
  AUTH_GOOGLE_ENABLED: z.enum(['on', 'off']).default('off'),
  /**
   * Whether visitors can create an account. `off` is the pre-launch mode: /sign-up shows the
   * launch notice instead of the form, `signUpAction` refuses every submission, and the landing
   * CTAs open the launch dialog. Sign-in is unaffected, so the team can keep using the product.
   *
   * This only closes the app's own form. Supabase Auth's "Allow new users to sign up" must be
   * turned off too, or an account can still be created against Supabase directly, or by a first
   * Google sign-in.
   */
  SIGNUPS_ENABLED: z.enum(['on', 'off']).default('off'),
  /**
   * Where the launch notice sends people to hear about launch day — a WhatsApp channel,
   * Instagram or X profile. HTTPS only. Unset means the notice shows no follow link.
   */
  LAUNCH_CHANNEL_URL: optionalString(z.string().url().startsWith('https://')),
  /**
   * Extra hosts the `http` fetcher may contact, comma-separated (e.g. `ssc.gov.in`).
   *
   * Empty means only the well-known public government domains in
   * apps/web/lib/admin/scraper/fetchers/http.ts are allowed. A source URL outside both lists is
   * refused before any request is made.
   */
  SCRAPER_ALLOWED_HOSTS: optionalString(z.string()),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

// Next inlines process.env.NEXT_PUBLIC_* at build time only for literal property access,
// so these must be written out rather than looped over.
const rawPublic = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
};

let cachedPublic: PublicEnv | null = null;

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse(rawPublic);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(
      `Missing or invalid public environment variables: ${missing}. ` +
      'Copy .env.example to .env.local and run `npm run verify:env`.',
    );
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

let cachedServer: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Server secrets must never be bundled.');
  }
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Missing or invalid server environment variables: ${missing}.`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export function isProduction(): boolean {
  return publicEnv().NEXT_PUBLIC_APP_ENV === 'production';
}

export function isLocal(): boolean {
  return publicEnv().NEXT_PUBLIC_APP_ENV === 'local';
}
