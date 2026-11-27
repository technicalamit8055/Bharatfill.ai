/**
 * Reads the scan on the Save Document screen once its pages are processed, so the screen can
 * suggest the type and name and show the details it found. Runs again only if the pages change
 * (the citizen went back to Edit Scan). Nothing is kept beyond the screen unless it is saved.
 */

import type { DocumentType } from '@assistigo/core';
import { useEffect, useState } from 'react';

import type { SessionPage } from '../scan/capture-session';
import type { DocumentReading } from './document-reading';
import { isPictureType, readScannedPages } from './read-documents';

export type ReadingState =
  /** Not started: pages still processing, or a photo or signature, which has no text. */
  | { readonly status: 'idle' }
  | { readonly status: 'reading' }
  | { readonly status: 'done'; readonly reading: DocumentReading }
  /** The phone cannot read text, or reading failed: the citizen files it by hand. */
  | { readonly status: 'unavailable' };

export function useDocumentReading(
  pages: readonly SessionPage[],
  chosenType: DocumentType | null,
): ReadingState {
  const ready = pages.length > 0 && pages.every((page) => page.status === 'ready' && page.rendered);
  const uris = ready ? pages.map((page) => page.rendered?.uri ?? '') : [];
  const key = uris.join('|');
  const [state, setState] = useState<ReadingState>({ status: 'idle' });

  useEffect(() => {
    if (key === '' || isPictureType(chosenType)) {
      setState({ status: 'idle' });
      return;
    }
    let live = true;
    setState({ status: 'reading' });
    readScannedPages(key.split('|'), chosenType)
      .then((reading) => {
        if (live) setState(reading ? { status: 'done', reading } : { status: 'unavailable' });
      })
      .catch(() => {
        if (live) setState({ status: 'unavailable' });
      });
    return () => {
      live = false;
    };
  }, [chosenType, key]);

  return state;
}
