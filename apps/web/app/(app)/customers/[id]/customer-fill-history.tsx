import Link from 'next/link';
import { Badge, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { formatIndianDate } from '@assistigo/core';
import { getTranslations } from '@/lib/i18n/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { FillSessionRow } from '@/lib/supabase/database.types';

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  detected: 'neutral',
  reviewed: 'info',
  filled: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

/** The extension's fill sessions for one customer (§18.2). */
export async function CustomerFillHistory({
  customerId,
  organizationId,
}: {
  customerId: string;
  organizationId: string;
}) {
  const { t } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('fill_sessions')
    .select('id, page_origin, page_title, status, filled_fields_count, created_at')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(10);

  const sessions = (data ?? []) as Pick<
    FillSessionRow,
    'id' | 'page_origin' | 'page_title' | 'status' | 'filled_fields_count' | 'created_at'
  >[];

  return (
    <Card title={t('fillSessions.title')}>
      {sessions.length === 0 ? (
        <EmptyState title={t('fillSessions.emptyFirst')} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t('fillSessions.table.portal')}</TH>
              <TH>{t('settings.status')}</TH>
              <TH>{t('customers.created')}</TH>
            </TR>
          </THead>
          <TBody>
            {sessions.map((fillSession) => (
              <TR key={fillSession.id}>
                <TD>
                  <Link
                    href={`/fill-sessions/${fillSession.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {fillSession.page_title ?? fillSession.page_origin}
                  </Link>
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[fillSession.status] ?? 'neutral'}>
                    {t(`fillSessions.status.${fillSession.status}`)}
                  </Badge>
                </TD>
                <TD className="text-slate-500">
                  {formatIndianDate(fillSession.created_at.slice(0, 10)) ?? '—'}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
