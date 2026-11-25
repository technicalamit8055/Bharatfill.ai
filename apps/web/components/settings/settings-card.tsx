import type { ReactNode } from 'react';
import { SectionHeader } from '@/app/(app)/billing/section-header';

/** A settings panel in the dashboard's card style. No hooks, so client forms can use it too. */
export function SettingsCard({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <SectionHeader icon={icon} title={title} subtitle={subtitle} action={action} />
      <div className="mt-5">{children}</div>
    </section>
  );
}
