import { safeConsoleNext } from './console-session';

/** Why a console sign-in page was opened, when the console sent somebody there. */
export type ConsoleLoginReason = 'reauth' | 'locked' | 'signed_out' | null;

const REASONS = new Set<ConsoleLoginReason>(['reauth', 'locked', 'signed_out']);

/** The two query parameters a console sign-in page reads, validated. */
export function parseLoginParams(params: Record<string, string | string[] | undefined>): {
  next: string;
  reason: ConsoleLoginReason;
} {
  const reason = typeof params.reason === 'string' ? params.reason : null;
  return {
    next: safeConsoleNext(params.next),
    reason: REASONS.has(reason as ConsoleLoginReason) ? (reason as ConsoleLoginReason) : null,
  };
}
