'use client';

import { Alert } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';

export type AppCopy = 'added' | 'not_added';

/** Whether a file uploaded for a BharatDoc app customer also reached their app (0047). */
export function AppCopyAlert({ appCopy }: { appCopy: AppCopy }) {
  const t = useTranslations();
  return (
    <Alert tone={appCopy === 'added' ? 'success' : 'warning'}>
      {t(appCopy === 'added' ? 'documents.appCopy.added' : 'documents.appCopy.notAdded')}
    </Alert>
  );
}
