import { cn } from '@assistigo/ui';
import { initialsOf } from '@/lib/dashboard/metrics';

const AVATAR_TONES = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-brand-100 text-brand-700',
];

/**
 * A stable tint per customer, so the same person wears the same colour on the list and on their
 * profile. Keyed by id rather than name: two customers called "Sunita Devi" should not look alike.
 */
function avatarToneFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? 'bg-brand-100 text-brand-700';
}

/** Initials in a tinted circle. Decorative — the name is always printed beside it. */
export function CustomerAvatar({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        avatarToneFor(id),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
