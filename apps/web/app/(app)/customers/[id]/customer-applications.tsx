import Link from 'next/link';
import { Badge, Button, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from '@assistigo/ui';
import { APPLICATION_STATUS_LABELS, APPLICATION_STATUS_TONE, formatIndianDate } from '@assistigo/core';
import { getTranslations } from '@/lib/i18n/server';
import { localised } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ApplicationRow } from '@/lib/supabase/database.types';

/** The applications opened for one customer (§21.4). */
export async function CustomerApplications({
  customerId,
  organizationId,
  canCreate,
}: {
  customerId: string;
  organizationId: string;
  canCreate: boolean;
}) {
  const { t, locale } = await getTranslations();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('applications')
    .select('id, title, category, status, deadline_at, created_at')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  const applications = (data ?? []) as Pick<
    ApplicationRow,
    'id' | 'title' | 'category' | 'status' | 'deadline_at' | 'created_at'
  >[];

  return (
    <Card
      title={t('applications.title')}
      actions={
        canCreate ? (
          <Link href={`/applications/new?customerId=${customerId}`}>
            <Button size="sm" variant="secondary">
              {t('applications.new')}
            </Button>
          </Link>
        ) : undefined
      }
    >
      {applications.length === 0 ? (
        <EmptyState title={t('applications.emptyFirst')} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t('applications.table.title')}</TH>
              <TH>{t('settings.status')}</TH>
              <TH>{t('applications.table.deadline')}</TH>
            </TR>
          </THead>
          <TBody>
            {applications.map((application) => (
              <TR key={application.id}>
                <TD>
                  <Link
                    href={`/applications/${application.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {application.title}
                  </Link>
                </TD>
                <TD>
                  <Badge tone={APPLICATION_STATUS_TONE[application.status]}>
                    {localised(APPLICATION_STATUS_LABELS[application.status], locale)}
                  </Badge>
                </TD>
                <TD className="text-slate-500">
                  {application.deadline_at
                    ? formatIndianDate(application.deadline_at.slice(0, 10))
                    : t('applications.deadlineNone')}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
