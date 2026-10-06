/**
 * Base64 ⇄ bytes, for the two extension hops that carry a file (worker → page, worker →
 * offscreen). Extension messages are JSON, so bytes travel as base64 or not at all.
 */

/** Base64 for a `Uint8Array`, chunked so a large file cannot blow the argument limit. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
