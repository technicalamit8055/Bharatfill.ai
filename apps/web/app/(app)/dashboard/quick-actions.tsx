import Link from 'next/link';
import type { Translator } from '@/lib/i18n';
import { PlusIcon, UploadIcon, PlayIcon } from './icons';

type Action = {
  href: string;
  label: string;
  icon: React.ReactNode;
  permission?: string;
};

export function QuickActions({
  permissions,
  t,
}: {
  permissions: ReadonlySet<string>;
  t: Translator;
}) {
  const actions: Action[] = [
    {
      href: '/customers/new',
      label: t('customers.new'),
      icon: <PlusIcon />,
      permission: 'customer.create',
    },
    {
      href: '/documents/upload',
      label: t('documents.upload'),
      icon: <UploadIcon />,
      permission: 'document.upload',
    },
    {
      href: '/demo-forms',
      label: t('onboarding.checklist.tryDemoForm'),
      icon: <PlayIcon />,
    },
  ];

  const visible = actions.filter((action) => !action.permission || permissions.has(action.permission));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 hover:shadow-md"
        >
          <span className="text-slate-400 group-hover:text-brand-600">{action.icon}</span>
          {action.label}
        </Link>
      ))}
    </div>
  );
}
