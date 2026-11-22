/**
 * The counter code (design §4.2, Mode C): how the 6 digits are shown and how long they last.
 * Kept free of React Native so they are tested in Node.
 */

/** "849201" → "849 201": easier to read aloud in two halves. */
export function formatShareCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Whole seconds until the code stops working; 0 once it has. */
export function shareCodeSecondsLeft(expiresAt: string, now: Date): number {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}

/** 272 → "4:32". */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
