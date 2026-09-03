import { requirePlatformPagePermission } from '@/lib/admin/session';
import { loadAllChannelSettings } from '@/lib/admin/channels/service';
import { getTranslations } from '@/lib/i18n/server';
import { AdminPageHeader } from '../ui';
import { ChannelsPanel } from './channels-panel';

export const metadata = { title: 'Channels & Bots' };

/**
 * Super Admin "Channels & Bots" — configure WhatsApp Cloud API and Telegram Bot API credentials
 * from the browser instead of editing `.env` (§9.1).
 *
 * Gated on `platform.team.manage`: every centre shares one WhatsApp number and one Telegram bot,
 * so this is a platform-wide, owner-tier act, same as granting a teammate access.
 */
export default async function AdminChannelsPage() {
  const session = await requirePlatformPagePermission('platform.team.manage');
  const { t } = await getTranslations();

  const settings = await loadAllChannelSettings(session.supabase);

  return (
    <>
      <AdminPageHeader title={t('admin.channels.title')} description={t('admin.channels.subtitle')} />
      <ChannelsPanel initial={settings} />
    </>
  );
}
