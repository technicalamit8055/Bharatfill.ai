'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the Chrome extension is present on this page (spec §7.2.4, §9.1).
 *
 * The content script sets `data-assistigo-extension` on <html> when it loads on a dashboard
 * page. Nothing is inferred from the absence of the marker beyond "not connected" — we never
 * probe the browser for installed extensions.
 *
 * Shared by the hero status badge and the onboarding checklist so the two cannot disagree about
 * whether the assistant is online.
 */
export function useExtensionInstalled(): boolean {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const check = () =>
      setInstalled(document.documentElement.hasAttribute('data-assistigo-extension'));

    check();
    // The service worker may inject the marker a moment after hydration.
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-assistigo-extension'],
    });
    return () => observer.disconnect();
  }, []);

  return installed;
}
