/**
 * Content script entry point.
 * Master spec §15.1.3, §19.6.
 *
 * Runs inside a page Assistigo does not control. It therefore:
 *   - validates every inbound message and verifies the sender,
 *   - never renders host-page text with innerHTML,
 *   - never logs a field value,
 *   - never stores anything.
 *
 * It is injected on demand via `chrome.scripting.executeScript` after a user gesture, so it is
 * not running on every page the operator visits.
 */

import { parseMessage, type Message } from '../shared/messages';
import { collectPageContext, detectFieldsInFrames, isBlockedPage } from './detector';
import { applyFill, attachFiles } from './filler';
import { fillPortalLogin } from './login-filler';

const MARKER_ATTRIBUTE = 'data-assistigo-extension';

/**
 * Lets the dashboard's first-run checklist see that the extension is installed (§7.3.1).
 * It is a presence marker and nothing else — no data flows through it, in either direction.
 */
function markPresence(): void {
  document.documentElement.setAttribute(MARKER_ATTRIBUTE, '1');
}

/** Guards against being injected twice into the same page. */
declare global {
  interface Window {
    __assistigoContentLoaded?: boolean;
  }
}

function handleMessage(
  message: Message,
  sendResponse: (response: unknown) => void,
): boolean | undefined {
  switch (message.type) {
    case 'PING':
      sendResponse({ ok: true, data: { alive: true } });
      return undefined;

    case 'DETECT_FIELDS': {
      if (isBlockedPage(window.location)) {
        sendResponse({ ok: false, error: 'blocked_page' });
        return undefined;
      }
      const payload = {
        page: collectPageContext(document),
        fields: detectFieldsInFrames(document),
      };
      sendResponse({ ok: true, data: payload });
      return undefined;
    }

    case 'APPLY_FILL': {
      // Async: the reply is sent from the promise, so the channel must stay open.
      applyFill(document, message.instructions)
        // Files go last: attaching one can make a portal re-render the section around it, and a
        // typed value written into a field that is about to be replaced would be lost.
        .then((results) => [...results, ...attachFiles(document, message.fileInstructions ?? [])])
        .then((results) => sendResponse({ ok: true, data: { results } }))
        .catch(() => sendResponse({ ok: false, error: 'fill_failed' }));
      return true;
    }

    case 'APPLY_PORTAL_LOGIN': {
      // Top frame only (§ Portal login). The worker addresses frame 0; an iframe instance that
      // somehow receives this anyway stays out of it.
      if (window.top !== window) {
        sendResponse({ ok: false, error: 'not_top_frame' });
        return undefined;
      }
      const result = fillPortalLogin(document, window.location, {
        loginId: message.loginId,
        password: message.password,
        hosts: message.hosts,
      });
      sendResponse({ ok: true, data: result });
      return undefined;
    }

    default:
      sendResponse({ ok: false, error: 'unsupported_message' });
      return undefined;
  }
}

function start(): void {
  if (window.__assistigoContentLoaded) return;
  window.__assistigoContentLoaded = true;

  markPresence();

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const message = parseMessage(raw, sender);
    if (!message) {
      // Unknown or unverified: dropped silently. Replying would confirm the extension is here
      // to a page that guessed the extension id.
      return undefined;
    }
    return handleMessage(message, sendResponse);
  });
}

start();
