/**
 * Row shapes for the tables the app reads.
 *
 * These are hand-written and used to annotate query results explicitly:
 *
 *   const rows = (data ?? []) as CustomerRow[];
 *
 * The Supabase clients are intentionally NOT parameterised with a `Database` generic yet.
 * A hand-maintained one would have to describe every table, column and foreign-key
 * relationship to satisfy supabase-js's query inference, and any drift from the real schema
 * would produce confidently wrong types — worse than none.
 *
 * Once a local Supabase can be started, generate the real thing:
 *
 *   npm run db:types      # supabase gen types typescript --local > database.generated.ts
 *
 * and then pass it to `createClient<Database>` in server.ts / browser.ts. Tracked in
 * docs/ROADMAP.md under Phase 1.
 */

import type { ApplicationDocumentStatus, ApplicationStatus } from '@assistigo/core';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type OrganizationRow = Timestamps & {
  id: string;
  name: string;
  business_type: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  preferred_locale: 'en' | 'hi';
  monthly_forms_estimate: string | null;
  settings: Json;
  plan_code: string;
  customer_counter: number;
  /** Permanent code printed on the counter standee, if this centre has minted one (0022). */
  counter_drop_code: string | null;
  created_by: string | null;
  deleted_at: string | null;
};

export type OrganizationAiProvider =
  'openai' | 'anthropic' | 'deepseek' | 'gemini' | 'ollama' | 'openrouter' | 'custom';

export type OrganizationAiSettingsRow = Timestamps & {
  organization_id: string;
  provider: OrganizationAiProvider;
  wire_format: 'openai_compatible' | 'anthropic_messages';
  base_url: string | null;
  model: string | null;
  api_key_encrypted: string | null;
  custom_prompt: string | null;
  updated_by: string | null;
};

export type OrgRoleValue = 'owner' | 'manager' | 'operator' | 'viewer' | 'billing_admin';

export type OrganizationMemberRow = Timestamps & {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRoleValue;
  status: 'active' | 'invited' | 'suspended';
  invited_by: string | null;
};

export type MembershipWithOrganization = OrganizationMemberRow & {
  organizations: OrganizationRow | null;
};

export type OrganizationInvitationRow = Timestamps & {
  id: string;
  organization_id: string;
  email: string;
  role: Exclude<OrgRoleValue, 'owner'>;
  token_hash: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  invited_by: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
};

export type CustomerRow = Timestamps & {
  id: string;
  organization_id: string;
  customer_code: string;
  full_name: string;
  full_name_hi: string | null;
  mobile: string | null;
  mobile_alt: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  category: string | null;
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
  guardian_name: string | null;
  address_json: Json;
  identity_summary_json: Json;
  education_json: Json;
  certificates_json: Json;
  notes: string | null;
  verification_status: string;
  assigned_to: string | null;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
  mobile_normalized: string | null;
};

export type CustomerFieldValueRow = Timestamps & {
  id: string;
  organization_id: string;
  customer_id: string;
  field_key: string;
  value_text: string | null;
  value_encrypted: string | null;
  value_json: Json;
  display_value: string | null;
  source_document_id: string | null;
  confidence: number | null;
  status: 'extracted' | 'operator_verified' | 'customer_confirmed' | 'rejected' | 'expired';
  created_by: string | null;
  updated_by: string | null;
};

export type DocumentRow = Timestamps & {
  id: string;
  organization_id: string;
  customer_id: string | null;
  application_id: string | null;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  size_bytes: number;
  sha256: string | null;
  document_type: string;
  status:
    'uploaded' | 'processing' | 'extracted' | 'review_required' | 'verified' | 'failed' | 'deleted';
  is_sensitive: boolean;
  expires_at: string | null;
  label: string | null;
  uploaded_by: string | null;
  deleted_at: string | null;
};

export type DocumentExtractionRow = Timestamps & {
  id: string;
  organization_id: string;
  document_id: string;
  provider: string;
  provider_request_id: string | null;
  document_type: string;
  raw_text: string | null;
  extracted_fields: Json;
  warnings: Json;
  confidence: number | null;
  status: 'pending' | 'completed' | 'review_required' | 'failed' | 'accepted' | 'rejected';
  error_code: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

/**
 * A prepared file (spec §13.3). Insert-only in practice: the tools never edit a derivative, they
 * produce a new one, so there is no `updated_at` on this table.
 */
export type DocumentDerivativeRow = {
  id: string;
  organization_id: string;
  source_document_id: string | null;
  customer_id: string | null;
  application_id: string | null;
  tool_type: 'photo' | 'signature' | 'pdf';
  preset_id: string | null;
  storage_bucket: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  metadata: Json;
  created_by: string | null;
  created_at: string;
};

export type ApplicationCategory =
  | 'government'
  | 'recruitment'
  | 'scholarship'
  | 'education'
  | 'banking'
  | 'certificate'
  | 'utility'
  | 'other';

export type ApplicationRow = Timestamps & {
  id: string;
  organization_id: string;
  customer_id: string;
  portal_adapter_id: string | null;
  title: string;
  category: ApplicationCategory;
  status: ApplicationStatus;
  portal_name: string | null;
  form_name: string | null;
  portal_url: string | null;
  portal_reference_number: string | null;
  deadline_at: string | null;
  amount_charged: number | null;
  payment_status: 'unpaid' | 'paid' | 'refunded' | null;
  assigned_to: string | null;
  notes: string | null;
  created_by: string | null;
  deleted_at: string | null;
};

export type ApplicationStatusEventRow = {
  id: string;
  organization_id: string;
  application_id: string;
  old_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ApplicationDocumentRow = Timestamps & {
  id: string;
  organization_id: string;
  application_id: string;
  document_id: string | null;
  derivative_id: string | null;
  requirement_key: string;
  requirement_label: string | null;
  preset_id: string | null;
  status: ApplicationDocumentStatus;
  notes: string | null;
};

export type PortalAdapterStatus = 'draft' | 'testing' | 'active' | 'deprecated';

export type PortalAdapterRow = Timestamps & {
  id: string;
  organization_id: string | null;
  slug: string;
  portal_name: string;
  form_name: string;
  region: string | null;
  url_patterns: string[];
  version: string;
  status: PortalAdapterStatus;
  field_mappings: Json;
  document_requirements: Json;
  notes: string | null;
  known_issues: string | null;
  last_verified_at: string | null;
  health: Json;
  created_by: string | null;
};

export type OrgFieldMappingRow = Timestamps & {
  id: string;
  organization_id: string;
  page_origin: string;
  field_signature: string;
  customer_field: string;
  transform: string | null;
  created_by: string | null;
};

export type FillSessionStatus = 'detected' | 'reviewed' | 'filled' | 'failed' | 'cancelled';

export type FillSessionRow = Timestamps & {
  id: string;
  organization_id: string;
  customer_id: string;
  application_id: string | null;
  portal_adapter_id: string | null;
  page_origin: string;
  page_path: string | null;
  page_title: string | null;
  detected_fields_count: number;
  proposed_fields_count: number;
  filled_fields_count: number;
  skipped_fields_count: number;
  review_required_count: number;
  captcha_fields_count: number;
  otp_fields_count: number;
  payment_fields_count: number;
  status: FillSessionStatus;
  error_summary: string | null;
  extension_version: string | null;
  created_by: string | null;
};

export type FillSessionFieldRow = {
  id: string;
  organization_id: string;
  fill_session_id: string;
  field_signature: string;
  field_label: string | null;
  input_type: string;
  mapped_customer_field: string | null;
  mapping_source: 'adapter' | 'org_custom' | 'history' | 'dictionary' | 'ai' | 'manual' | null;
  proposed_value_preview: string | null;
  confidence: number | null;
  action: 'filled' | 'skipped' | 'edited' | 'failed';
  skip_reason: string | null;
  safety_class: 'normal' | 'captcha' | 'otp' | 'payment' | 'submit';
  review_required: boolean;
  error: string | null;
  created_at: string;
};

export type FormReportStatus = 'new' | 'triaged' | 'adapter_created' | 'declined';

export type FormReportRow = Timestamps & {
  id: string;
  organization_id: string;
  fill_session_id: string | null;
  portal_adapter_id: string | null;
  page_origin: string;
  page_path: string | null;
  page_title: string | null;
  field_metadata: Json;
  note: string | null;
  screenshot_path: string | null;
  screenshot_consent: boolean;
  browser_version: string | null;
  extension_version: string | null;
  status: FormReportStatus;
  created_by: string | null;
};

export type BillingWebhookEventRow = {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  processed_at: string;
  result: 'processed' | 'ignored' | 'failed';
};

export type JobRow = Timestamps & {
  id: string;
  organization_id: string | null;
  type: string;
  payload: Json;
  status: 'pending' | 'running' | 'retry' | 'completed' | 'failed' | 'cancelled';
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_until: string | null;
  locked_by: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  created_by: string | null;
  completed_at: string | null;
};

export type AuditLogRow = {
  id: string;
  organization_id: string | null;
  actor_user_id: string | null;
  actor_type: 'user' | 'extension' | 'system' | 'support' | 'webhook';
  action: string;
  entity_type: string;
  entity_id: string | null;
  sensitivity: 'normal' | 'sensitive' | 'critical';
  ip_address: string | null;
  user_agent: string | null;
  metadata: Json;
  created_at: string;
};

export type PlanRow = Timestamps & {
  id: string;
  code: string;
  name: string;
  name_hi: string | null;
  price_monthly_inr: number;
  included_fills: number | null;
  included_ai_extractions: number | null;
  included_seats: number;
  max_customers: number | null;
  storage_mb: number;
  features: Json;
  active: boolean;
  sort_order: number;
};

export type SubscriptionRow = Timestamps & {
  id: string;
  organization_id: string;
  plan_id: string;
  provider: 'mock' | 'razorpay' | 'stripe';
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'incomplete';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export type UsageEventRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  event_type: 'fill' | 'ai_extraction' | 'document_tool' | 'storage' | 'seat';
  quantity: number;
  billable: boolean;
  metadata: Json;
  created_at: string;
};

/** Row shape returned by public.search_customers(). */
export type CustomerSearchRow = {
  id: string;
  customer_code: string;
  full_name: string;
  full_name_hi: string | null;
  mobile: string | null;
  district: string | null;
  state: string | null;
  date_of_birth: string | null;
  verification_status: string;
  created_at: string;
  rank: number;
};

/** Shape returned by public.dashboard_summary(). */
export type DashboardSummary = {
  fillsToday: number;
  customersServedToday: number;
  customersTotal: number;
  documentsProcessedToday: number;
  applicationsOpen: number;
  reviewsPending: number;
  fieldsFilledThisMonth: number;
};

export type SchemeCatalogSource = 'manual' | 'built_in' | 'sync' | 'ai_notification';

/**
 * A tracked scheme, scholarship or vacancy (migration 0020).
 *
 * `organization_id` null is the platform-wide catalogue; a row with one belongs to that centre
 * and overrides a platform row of the same slug. The localised columns and `eligibility` are
 * `Json` here rather than a shaped type on purpose — they are re-validated with Zod on read
 * (`schemeFromRow`), and a hand-written type would only make a malformed row look trustworthy.
 */
export type SchemesCatalogRow = Timestamps & {
  id: string;
  organization_id: string | null;
  slug: string;
  category: string;
  title: Json;
  short_description: Json;
  benefits_summary: Json;
  benefit_highlight: Json;
  portal_name: string;
  portal_url: string;
  adapter_slug: string | null;
  official_notification_url: string | null;
  application_start_date: string | null;
  application_end_date: string | null;
  is_always_open: boolean;
  exam_date: string | null;
  estimated_operator_fee: number;
  eligibility: Json;
  pitch_template: Json;
  upcoming_pitch_template: Json;
  source: SchemeCatalogSource;
  source_url: string | null;
  last_synced_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  is_published: boolean;
  created_by: string | null;
};

// ---------------------------------------------------------------------------
// Platform admin & scraper ingestion (0021)
//
// None of these tables carries an organization_id: they are internal staff infrastructure, not
// tenant data, and hold no personal data at all.
// ---------------------------------------------------------------------------

export type PlatformRoleValue =
  | 'super_admin'
  | 'content_manager'
  | 'scraper_operator'
  | 'support_admin';

export type PlatformAdminRow = Timestamps & {
  id: string;
  user_id: string;
  role: PlatformRoleValue;
  email: string;
  is_active: boolean;
  notes: string | null;
  granted_by: string | null;
};

export type ScraperFetcherValue = 'manual' | 'fixture' | 'http';

export type ScraperRunStatusValue =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';

export type ScraperSourceRow = Timestamps & {
  id: string;
  slug: string;
  name: string;
  portal_name: string;
  source_url: string;
  fetcher: ScraperFetcherValue;
  is_enabled: boolean;
  interval_minutes: number;
  config: Json;
  last_run_at: string | null;
  last_status: ScraperRunStatusValue | null;
  consecutive_failures: number;
  notes: string | null;
  created_by: string | null;
};

export type ScraperRunRow = Timestamps & {
  id: string;
  source_id: string;
  status: ScraperRunStatusValue;
  trigger: 'manual' | 'schedule';
  triggered_by: string | null;
  items_found: number;
  items_staged: number;
  items_skipped: number;
  error_text: string | null;
  started_at: string;
  finished_at: string | null;
};

export type QueueItemStatusValue = 'pending' | 'approved' | 'rejected' | 'superseded';
export type QueueChangeKindValue = 'new' | 'deadline_only' | 'update' | 'no_change';

export type ScrapedSchemeQueueRow = Timestamps & {
  id: string;
  source_id: string;
  run_id: string | null;
  slug: string;
  category: string;
  target_scheme_id: string | null;
  payload: Json;
  proposed_changes: Json;
  change_kind: QueueChangeKindValue;
  status: QueueItemStatusValue;
  confidence: number;
  source_url: string;
  content_hash: string;
  fetcher_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  published_scheme_id: string | null;
};

/** Shape returned by `public.platform_tenant_rows()`. Metadata and counts only (spec §6.1). */
export type PlatformTenantRow = {
  id: string;
  name: string;
  business_type: string;
  city: string | null;
  state: string | null;
  plan_code: string;
  created_at: string;
  member_count: number;
  customer_count: number;
  application_count: number;
  fill_sessions_30d: number;
  last_activity_at: string | null;
};

export type DropChannelValue = 'whatsapp' | 'telegram' | 'web';
export type DropSessionStatusValue = 'active' | 'ready' | 'converted' | 'expired' | 'abandoned';

/**
 * One unclaimed walk-in intake (0022).
 *
 * `sender_id` and `sender_name` are the citizen's own messaging identity. They exist so the
 * operator does not have to retype a phone number, and they are personal data: never log them,
 * never put them in audit metadata (§19.6).
 */
export type DocumentDropSessionRow = Timestamps & {
  id: string;
  organization_id: string;
  session_code: string;
  channel: DropChannelValue;
  sender_id: string | null;
  sender_name: string | null;
  status: DropSessionStatusValue;
  customer_id: string | null;
  metadata: Json;
  created_by: string | null;
  expires_at: string;
  converted_at: string | null;
};

export type DocumentDropFileRow = {
  id: string;
  session_id: string;
  organization_id: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  size_bytes: number;
  sha256: string | null;
  suggested_document_type: string;
  converted_document_id: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Platform channel settings (0023) — WhatsApp/Telegram bot configuration, editable
// from the Super Admin panel. Deployment-wide: no organization_id.
// ---------------------------------------------------------------------------

export type PlatformChannelValue = 'whatsapp' | 'telegram';

export type PlatformChannelSettingsRow = Timestamps & {
  channel: PlatformChannelValue;
  is_enabled: boolean;
  config: Json;
  access_token_encrypted: string | null;
  app_secret_encrypted: string | null;
  bot_token_encrypted: string | null;
  updated_by: string | null;
};

// ---------------------------------------------------------------------------
// Cross-operator roaming access (0024) — links, consent OTP challenges, time-boxed grants.
// See packages/core/src/roaming/types.ts for the shared vocabulary these mirror.
// ---------------------------------------------------------------------------

export type RoamingPurposeValue =
  | 'form_filling'
  | 'scheme_application'
  | 'profile_update'
  | 'document_access';
export type RoamingAuthMethodValue = 'otp' | 'qr_consent' | 'biometric';
export type RoamingGrantStatusValue = 'active' | 'expired' | 'revoked';
export type RoamingOtpChannelValue = 'whatsapp' | 'sms';

export type CustomerRoamingLinkRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  linked_by: string | null;
  notes: string | null;
  last_served_at: string;
  created_at: string;
};

export type CustomerAccessGrantRow = {
  id: string;
  customer_id: string;
  organization_id: string;
  granted_to_user_id: string;
  purpose: RoamingPurposeValue;
  target_scheme_slug: string | null;
  status: RoamingGrantStatusValue;
  auth_method: RoamingAuthMethodValue;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  consent_record_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

/**
 * `customer_access_challenges` has no select policy for any role (0024 header note 3), so this
 * shape is used only by server code holding the service-role client.
 */
export type CustomerAccessChallengeRow = {
  id: string;
  customer_id: string;
  organization_id: string;
  requested_by: string;
  purpose: RoamingPurposeValue;
  target_scheme_slug: string | null;
  duration_minutes: number;
  channel: RoamingOtpChannelValue;
  otp_salt: string;
  otp_hash: string;
  attempts_left: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

/** Row shape returned by `public.roaming_customer_search()` and `public.roaming_customer_card()`. */
export type RoamingCustomerCardRow = {
  customer_id: string;
  home_organization_id: string;
  full_name: string;
  mobile: string | null;
  district: string | null;
  state: string | null;
  date_of_birth: string | null;
  gender: string | null;
  category: string | null;
  education_json: Json;
  certificates_json: Json;
  identity_summary_json: Json;
  verification_status: string;
  /** Present on `roaming_customer_search` rows only. */
  created_at?: string;
  /** Present on `roaming_customer_card` rows only. */
  is_linked?: boolean;
};

/** Row shape returned by `public.roaming_linked_customers()`. */
export type RoamingLinkedCustomerRow = {
  customer_id: string;
  home_organization_id: string;
  given_name: string;
  family_initial: string | null;
  mobile_last4: string;
  district: string | null;
  state: string | null;
  verification_status: string;
  last_served_at: string;
  has_active_grant: boolean;
  grant_expires_at: string | null;
};
