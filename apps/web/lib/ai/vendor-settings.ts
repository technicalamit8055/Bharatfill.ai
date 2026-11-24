import 'server-only';

import type { AiWireFormat } from '@assistigo/ai/types';
import type { AssistigoSupabaseClient } from '../supabase/server';
import type {
  OrganizationAiProvider,
  OrganizationAiSettingsRow,
  PlatformAiSettingsRow,
} from '../supabase/database.types';

/**
 * An organization's own AI vendor configuration (docs/AI_PIPELINE.md §2, docs/SECURITY.md §4).
 *
 * This is a new, genuinely sensitive surface — a third-party API key stored per organization —
 * so every read/write of the key goes through this one module rather than being open-coded at
 * each call site, the same reason `packages/core/src/privacy/crypto.ts` exists as a single
 * sanctioned path.
 */

const AAD_SUFFIX = 'ai_vendor_api_key';
const PLATFORM_AAD = 'platform:ai_vendor_api_key';

export type ProviderPreset = {
  label: string;
  /** Empty string for `custom`: there is no vendor-specific default to offer. */
  defaultBaseUrl: string;
  defaultModel?: string;
  wireFormat: AiWireFormat;
};

/**
 * Presets are a UI convenience, not a second integration per vendor: every one of them speaks
 * the OpenAI-compatible chat-completions shape, the Anthropic messages shape or Vertex AI's
 * generateContent shape, which `packages/ai/src/providers/ai-vision.ts` implements generically.
 * Adding a new hosted vendor that speaks one of these shapes is a preset entry, never new
 * request-building code.
 */
export const AI_PROVIDER_PRESETS: Record<OrganizationAiProvider, ProviderPreset> = {
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4o',
    wireFormat: 'openai_compatible',
  },
  anthropic: {
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-sonnet-latest',
    wireFormat: 'anthropic_messages',
  },
  deepseek: {
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    wireFormat: 'openai_compatible',
  },
  gemini: {
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.6-flash',
    wireFormat: 'openai_compatible',
  },
  vertex: {
    // Vertex AI's API-key ("express mode") endpoint. Same Gemini models as the preset above, but
    // billed through the Google Cloud account rather than AI Studio prepay — and it speaks
    // Google's generateContent shape, not chat-completions.
    label: 'Google Vertex AI',
    defaultBaseUrl: 'https://aiplatform.googleapis.com',
    defaultModel: 'gemini-3.6-flash',
    wireFormat: 'vertex_generate_content',
  },
  ollama: {
    // No default: Assistigo's servers, not the owner's computer, make this request, so
    // `localhost` is never reachable here. The owner must supply a real HTTPS endpoint — a
    // tunnel or a reverse proxy in front of their Ollama instance.
    label: 'Ollama (self-hosted, via a reachable HTTPS endpoint)',
    defaultBaseUrl: '',
    wireFormat: 'openai_compatible',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api',
    wireFormat: 'openai_compatible',
  },
  custom: {
    label: 'Custom / OpenAI-compatible',
    defaultBaseUrl: '',
    wireFormat: 'openai_compatible',
  },
};

export type ResolvedAiVendorSettings = {
  provider: OrganizationAiProvider;
  wireFormat: AiWireFormat;
  baseUrl: string | null;
  model: string | null;
  /** Decrypted. Never sent back to a client — only used server-side to build a provider config. */
  apiKey: string | null;
  customPrompt: string | null;
};

/** The shared setup, plus the on/off switch that covers every centre. */
export type PlatformAiSettings = ResolvedAiVendorSettings & {
  hasApiKey: boolean;
  enabled: boolean;
};

export function encryptPlatformAiApiKey(apiKey: string): Promise<string> {
  return import('@assistigo/core/privacy/crypto').then(({ encryptField }) =>
    encryptField(apiKey, PLATFORM_AAD),
  );
}

async function decryptKey(ciphertext: string | null, aad: string): Promise<string | null> {
  if (!ciphertext) return null;
  try {
    const { decryptField } = await import('@assistigo/core/privacy/crypto');
    return decryptField(ciphertext, aad);
  } catch {
    return null;
  }
}

/**
 * The one AI setup every centre shares (0049), or `null` until a Super Admin saves it — callers
 * then fall back to the centre's earlier row. Needs the service-role client: RLS grants tenants
 * nothing on this table. `apiKey` is decrypted, so pick fields before returning any of this.
 */
export async function loadPlatformAiSettings(
  supabase: AssistigoSupabaseClient,
): Promise<PlatformAiSettings | null> {
  const { data, error } = await supabase
    .from('platform_ai_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as PlatformAiSettingsRow;
  return {
    provider: row.provider,
    wireFormat: row.wire_format,
    baseUrl: row.base_url,
    model: row.model,
    apiKey: await decryptKey(row.api_key_encrypted, PLATFORM_AAD),
    customPrompt: row.custom_prompt,
    hasApiKey: Boolean(row.api_key_encrypted),
    enabled: row.enabled,
  };
}

/**
 * Loads and decrypts an organization's configured vendor, for the extraction job only.
 *
 * Returns `null` when the organization has never configured one — the caller falls back to the
 * deployment-wide, environment-configured provider, exactly as before this feature existed.
 * A corrupted ciphertext or a rotated `FIELD_ENCRYPTION_KEY` degrades to "no key" rather than
 * throwing, because a bad key must surface as "AI reading is not configured" — a warning the
 * pipeline already knows how to show — not a failed document.
 */
export async function loadOrgAiSettings(
  supabase: AssistigoSupabaseClient,
  organizationId: string,
): Promise<ResolvedAiVendorSettings | null> {
  const { data, error } = await supabase
    .from('organization_ai_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as OrganizationAiSettingsRow;

  const apiKey = await decryptKey(row.api_key_encrypted, `${organizationId}:${AAD_SUFFIX}`);

  return {
    provider: row.provider,
    wireFormat: row.wire_format,
    baseUrl: row.base_url,
    model: row.model,
    apiKey,
    customPrompt: row.custom_prompt,
  };
}

/**
 * A base URL an owner may point this at.
 *
 * Anything but `https://` is refused outright — including `http://` — because the settings page
 * is the one place in the product that turns an operator-typed string into a server-initiated
 * request (docs/SECURITY.md §1). Loopback and private/link-local hosts are refused too, so an
 * owner account cannot be used to make this server probe internal infrastructure by pointing the
 * "AI vendor" at it (self-hosted `ollama` deployments are expected to sit behind a public
 * HTTPS-terminating proxy, not be reached directly).
 */
export function isAllowedVendorBaseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') return false;

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname === '169.254.169.254' || // cloud metadata endpoint
    hostname.endsWith('.local') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    return false;
  }

  return true;
}
