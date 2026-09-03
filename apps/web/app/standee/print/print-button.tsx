'use client';

import { Button } from '@assistigo/ui';

/**
 * The only interactive thing on the counter card page, so it is the only client component.
 *
 * `window.print()` rather than a download: the operator wants paper in their hand, and every
 * print dialog on every platform already offers "Save as PDF" if they wanted a file.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button size="sm" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
