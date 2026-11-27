/**
 * The Home mockup's content as a dashboard, for development builds only. It lets the layout be
 * reviewed with something in it before the vault store exists. The Home route never shows it in
 * a production build.
 *
 * Sample data, not a real citizen's: "Amit Kumar" is the mockup's placeholder name, and the
 * thumbnails are the mockup's sample documents.
 *
 * A `.tsx` file only because Metro resolves image assets through `require()`, which the lint
 * config allows under `components/**\/*.tsx`.
 */

import { coreChecklist } from '../../lib/checklist/checklist';
import type { HomeDashboard } from '../../lib/home/dashboard';
import type { Translate } from '../../lib/i18n';
import { localDateParts, toIsoDate } from '../../lib/profile/date-of-birth';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function demoHomeDashboard(now: Date, t: Translate): HomeDashboard {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const inDays = (days: number) =>
    toIsoDate(localDateParts(new Date(now.getTime() + days * DAY_MS)));

  return {
    citizenName: 'Amit Kumar',
    hasUnreadNotifications: true,
    documentCounts: { identity: 3, academic: 2, certificate: 4, form_asset: 3 },
    checklist: coreChecklist([], now),
    upcoming: [
      {
        id: 'demo-puc',
        title: t('everydayKinds.vehicle_puc'),
        expiresOn: inDays(7),
        days: 7,
        state: 'soon',
        dateMeaning: 'expires',
        action: null,
        documentType: 'generic',
        everydayKind: 'vehicle_puc',
      },
      {
        id: 'demo-income',
        title: t('documentTypes.income_certificate'),
        expiresOn: inDays(30),
        days: 30,
        state: 'soon',
        dateMeaning: 'expires',
        action: 'renew',
        documentType: 'income_certificate',
        everydayKind: null,
      },
    ],
    recentDocuments: [
      {
        id: 'demo-aadhaar',
        title: t('home.demo.aadhaar'),
        createdAt: ago(2 * HOUR_MS),
        thumbnail: require('../../assets/home/thumb-aadhaar.jpg'),
      },
      {
        id: 'demo-marksheet',
        title: t('home.demo.marksheet'),
        createdAt: ago(DAY_MS),
        thumbnail: require('../../assets/home/thumb-marksheet.jpg'),
      },
      {
        id: 'demo-photo',
        title: t('home.demo.photo'),
        createdAt: ago(3 * DAY_MS),
        thumbnail: require('../../assets/home/thumb-photo.jpg'),
      },
      {
        id: 'demo-signature',
        title: t('home.demo.signature'),
        createdAt: ago(5 * DAY_MS),
        thumbnail: require('../../assets/home/thumb-signature.jpg'),
      },
    ],
  };
}
