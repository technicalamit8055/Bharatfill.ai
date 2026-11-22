/**
 * Where the citizen app's cloud lives (docs/VAULT_BRIDGE_DESIGN.md §2).
 *
 * Three public values, set per build (EAS env or `.env` for `expo start`):
 *
 *   EXPO_PUBLIC_SUPABASE_URL        Supabase project URL — phone OTP sign-in
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY   its public anon key (not a secret; RLS is the gate)
 *   EXPO_PUBLIC_BHARATFILL_API_URL  the dashboard origin that serves /api/citizen/*
 *
 * All three or nothing: a build without them is the offline app it was before — sign-in says
 * "not available yet" and nothing leaves the phone. Only `https:` is accepted, except loopback
 * and private-LAN hosts in development builds (a dev server on the same Wi-Fi).
 */

export type CloudConfig = {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly apiUrl: string;
};

export type CloudEnv = {
  readonly EXPO_PUBLIC_SUPABASE_URL?: string;
  readonly EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly EXPO_PUBLIC_BHARATFILL_API_URL?: string;
};

const DEV_HOST = /^(localhost|127\.0\.0\.1|10\.0\.2\.2|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)$/;

function originOf(raw: string | undefined, allowDevHttp: boolean): string | null {
  if (!raw || raw.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const secure = url.protocol === 'https:';
  const devHttp = allowDevHttp && url.protocol === 'http:' && DEV_HOST.test(url.hostname);
  if (!secure && !devHttp) return null;
  return `${url.protocol}//${url.host}`;
}

/** Pure: the config from these values, or `null` when the cloud is not configured. */
export function parseCloudConfig(env: CloudEnv, allowDevHttp: boolean): CloudConfig | null {
  const supabaseUrl = originOf(env.EXPO_PUBLIC_SUPABASE_URL, allowDevHttp);
  const apiUrl = originOf(env.EXPO_PUBLIC_BHARATFILL_API_URL, allowDevHttp);
  const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!supabaseUrl || !apiUrl || supabaseAnonKey === '') return null;
  return { supabaseUrl, supabaseAnonKey, apiUrl };
}

let cached: CloudConfig | null | undefined;

/** The build's cloud config, or `null` for an offline-only build. */
export function cloudConfig(): CloudConfig | null {
  if (cached !== undefined) return cached;
  // Expo inlines EXPO_PUBLIC_* only for literal property access, so each is written out.
  cached = parseCloudConfig(
    {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_BHARATFILL_API_URL: process.env.EXPO_PUBLIC_BHARATFILL_API_URL,
    },
    typeof __DEV__ !== 'undefined' && __DEV__,
  );
  return cached;
}
