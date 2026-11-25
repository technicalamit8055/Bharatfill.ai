'use client';

import { Badge } from '@assistigo/ui';
import { useTranslations } from '@/lib/i18n/client';
import { useExtensionInstalled } from '../../dashboard/use-extension-installed';

export function ExtensionStatus() {
  const t = useTranslations();
  const installed = useExtensionInstalled();
  return (
    <Badge tone={installed ? 'success' : 'neutral'} className="px-3 py-1">
      {t(installed ? 'settings.extension.detected' : 'settings.extension.notDetected')}
    </Badge>
  );
}
