import 'server-only';

import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  MAX_TILE_LOGOS,
  PORTAL_LOGOS,
  PORTALS,
  type PortalLogo,
  type PortalLogoSources,
} from './where-it-works';

const LOGO_DIR = '/portal-logos';
const EXTENSIONS = ['svg', 'png', 'webp'] as const;

function publicFile(url: string): string {
  return path.join(process.cwd(), 'public', ...url.split('/').filter(Boolean));
}

function resolve({ name, src }: PortalLogo): string | undefined {
  const candidates = src ? [src] : EXTENSIONS.map((ext) => `${LOGO_DIR}/${name}.${ext}`);
  return candidates.find((url) => existsSync(publicFile(url)));
}

/**
 * Checked on the server so a missing logo never reaches the browser as a broken image: the card
 * just keeps its icon. The landing page is static, so new files show up on the next build.
 */
export function getPortalLogoSources(): PortalLogoSources {
  const sources: PortalLogoSources = {};
  for (const { key } of PORTALS) {
    const found = PORTAL_LOGOS[key]
      .map(resolve)
      .filter((url): url is string => url !== undefined)
      .slice(0, MAX_TILE_LOGOS);
    if (found.length > 0) sources[key] = found;
  }
  return sources;
}
