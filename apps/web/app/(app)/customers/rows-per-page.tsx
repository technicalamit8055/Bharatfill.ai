'use client';

import { useRouter } from 'next/navigation';

/**
 * Page-size picker. The server hands over the finished URL for each size, so the rules for what
 * a list URL carries stay in one place (`listHref`) instead of being rebuilt in the browser.
 */
export function RowsPerPage({
  label,
  value,
  options,
}: {
  label: string;
  value: number;
  options: { value: number; href: string }[];
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-3 text-sm text-slate-500">
      <span className="hidden sm:inline">{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => {
          const picked = options.find((option) => String(option.value) === event.target.value);
          if (picked) router.push(picked.href);
        }}
        className="h-10 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.value}
          </option>
        ))}
      </select>
    </label>
  );
}
