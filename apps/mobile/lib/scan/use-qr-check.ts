/**
 * Runs a QR check over a document's pages from a screen, and holds its outcome while the screen
 * is open. The check stops when the screen goes or the pages change, so a stale result never
 * lands on another document. What the code says stays in this state, in memory only.
 */

import type { QrCheck } from '@assistigo/document-tools/qr';
import { useCallback, useEffect, useRef, useState } from 'react';

import { checkDocumentPages, type QrPageSource } from './qr-scan';

export type QrCheckState =
  | { readonly status: 'idle' }
  | { readonly status: 'checking' }
  | { readonly status: 'none' }
  | { readonly status: 'done'; readonly check: QrCheck };

export const QR_IDLE: QrCheckState = { status: 'idle' };

/**
 * `sources` is read when `run` is called; `key` names the pages it was given, so a change of
 * pages drops an outcome that no longer applies.
 */
export function useQrCheck(key: string) {
  const [state, setState] = useState<QrCheckState>(QR_IDLE);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setState(QR_IDLE);
    return () => {
      generation.current += 1;
    };
  }, [key]);

  const run = useCallback(async (sources: readonly QrPageSource[]): Promise<QrCheck | null> => {
    generation.current += 1;
    const mine = generation.current;
    const cancelled = () => generation.current !== mine;
    setState({ status: 'checking' });
    let check: QrCheck | null = null;
    try {
      check = await checkDocumentPages(sources, { cancelled });
    } catch {
      check = null;
    }
    if (cancelled()) return null;
    setState(check ? { status: 'done', check } : { status: 'none' });
    return check;
  }, []);

  return { state, run };
}
