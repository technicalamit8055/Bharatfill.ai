/**
 * The Vault mockup's documents, for development builds only. They fill the screen while the
 * phone's vault is empty so the layout can be reviewed; the Vault route never shows them in a
 * production build, and starring or deleting one only changes what is on screen.
 *
 * Sample data, not a real citizen's: the thumbnails are the Home mockup's sample documents, and
 * the PAN card has none, so its row shows the no-thumbnail icon. Sizes are the mockup's.
 *
 * A `.tsx` file only because Metro resolves image assets through `require()`, which the lint
 * config allows under `components/**\/*.tsx`.
 */

import type { Translate } from '../../lib/i18n';
import type { VaultItem } from '../../lib/vault/vault-screen';

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

export const DEMO_ID_PREFIX = 'demo-';

export function demoVaultItems(now: Date, t: Translate): VaultItem[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

  return [
    {
      id: `${DEMO_ID_PREFIX}aadhaar`,
      title: t('vault.demo.aadhaar'),
      category: 'identity',
      tag: t('vault.demo.tagAadhaar'),
      createdAt: ago(1),
      pageCount: 2,
      mimeType: 'image/jpeg',
      sizeBytes: 2.4 * MB,
      starred: true,
      thumbnail: { kind: 'asset', source: require('../../assets/home/thumb-aadhaar.jpg') },
    },
    {
      id: `${DEMO_ID_PREFIX}photo`,
      title: t('vault.demo.photo'),
      category: 'form_asset',
      tag: t('vault.demo.tagPhoto'),
      createdAt: ago(3),
      pageCount: 1,
      mimeType: 'image/jpeg',
      sizeBytes: 1.2 * MB,
      starred: false,
      thumbnail: { kind: 'asset', source: require('../../assets/home/thumb-photo.jpg') },
    },
    {
      id: `${DEMO_ID_PREFIX}marksheet`,
      title: t('vault.demo.marksheet'),
      category: 'academic',
      tag: t('vault.demo.tagMarksheet'),
      createdAt: ago(8),
      pageCount: 1,
      mimeType: 'image/jpeg',
      sizeBytes: 1.8 * MB,
      starred: false,
      thumbnail: { kind: 'asset', source: require('../../assets/home/thumb-marksheet.jpg') },
    },
    {
      id: `${DEMO_ID_PREFIX}signature`,
      title: t('vault.demo.signature'),
      category: 'form_asset',
      tag: t('vault.demo.tagSignature'),
      createdAt: ago(14),
      pageCount: 1,
      mimeType: 'image/png',
      sizeBytes: 0.3 * MB,
      starred: true,
      thumbnail: { kind: 'asset', source: require('../../assets/home/thumb-signature.jpg') },
    },
    {
      id: `${DEMO_ID_PREFIX}pan`,
      title: t('vault.demo.pan'),
      category: 'identity',
      tag: t('vault.demo.tagPan'),
      createdAt: ago(40),
      pageCount: 1,
      mimeType: 'image/jpeg',
      sizeBytes: 1.1 * MB,
      starred: false,
      thumbnail: { kind: 'none' },
    },
  ];
}
