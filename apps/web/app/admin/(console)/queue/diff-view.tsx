import type { SchemeFieldDiff } from '@assistigo/core';
import { AdminBadge } from '../ui';

/**
 * The side-by-side diff a reviewer approves.
 *
 * Rendered from the `proposed_changes` computed when the item was staged, not recomputed now, so
 * what the reviewer approves is exactly what the pipeline saw. If the live scheme has moved since
 * staging, the stale diff is the honest thing to show — the alternative is a reviewer approving a
 * change they were never shown.
 *
 * Schedule rows lead because they are both the commonest change and the one a reviewer can verify
 * against the notification in seconds.
 */

const GROUP_ORDER: Record<string, number> = {
  schedule: 0,
  identity: 1,
  eligibility: 2,
  commercial: 3,
  content: 4,
};

const GROUP_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  schedule: 'warning',
  identity: 'danger',
  eligibility: 'danger',
  commercial: 'info',
  content: 'neutral',
};

/** Renders a diff value compactly — dates and strings bare, structures as JSON. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '—' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

function isMultiline(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

export function DiffView({
  changes,
  labelFor,
}: {
  changes: SchemeFieldDiff[];
  labelFor: (path: string) => string;
}) {
  if (changes.length === 0) return null;

  const sorted = [...changes].sort(
    (a, b) => (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9),
  );

  return (
    <div className="divide-y divide-slate-800 rounded-md border border-slate-800">
      {sorted.map((change) => {
        const structured = isMultiline(change.before) || isMultiline(change.after);
        return (
          <div key={change.path} className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-medium text-slate-300">{labelFor(change.path)}</span>
              <AdminBadge tone={GROUP_TONE[change.group] ?? 'neutral'}>{change.group}</AdminBadge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded border border-rose-900/60 bg-rose-950/20 px-2 py-1.5">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-rose-400/80">
                  before
                </div>
                <div
                  className={
                    structured
                      ? 'max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-rose-200'
                      : 'break-words text-sm text-rose-200'
                  }
                >
                  {renderValue(change.before)}
                </div>
              </div>

              <div className="rounded border border-emerald-900/60 bg-emerald-950/20 px-2 py-1.5">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-emerald-400/80">
                  after
                </div>
                <div
                  className={
                    structured
                      ? 'max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-emerald-200'
                      : 'break-words text-sm text-emerald-200'
                  }
                >
                  {renderValue(change.after)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
