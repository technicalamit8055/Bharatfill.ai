/**
 * Presentation helpers for the billing page. Pure, so the page's arithmetic is testable without
 * a database — the numbers themselves come from `buildUsageSummary`.
 */

/** A usage ratio (0–1, or null for unlimited) as a whole percentage for the bar and its label. */
export function usagePercent(ratio: number | null): number {
  if (ratio === null || !Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * The window usage is counted over: the current calendar month in UTC, exactly as
 * `loadEntitlementContext` reads it. Both ends are inclusive `YYYY-MM-DD` dates.
 */
export function currentUsagePeriod(now: Date): { start: string; end: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  // Day 0 of the next month is the last day of this one.
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export type PlanAction = 'current' | 'upgrade' | 'downgrade';

/**
 * What the button on a plan card does, relative to the organization's active plan.
 *
 * "Up" and "down" follow the catalogue's order (admins set it; cheapest first by convention),
 * passed in as `orderedCodes`, since plans are no longer a fixed list.
 */
export function planAction(
  planCode: string,
  activePlanCode: string,
  orderedCodes: readonly string[],
): PlanAction {
  if (planCode === activePlanCode) return 'current';
  const activeIndex = orderedCodes.indexOf(activePlanCode);
  // An active plan missing from the catalogue (a retired one, say) is treated as below every
  // listed plan, so every card offers a move up rather than a downgrade nobody asked for.
  return orderedCodes.indexOf(planCode) > activeIndex ? 'upgrade' : 'downgrade';
}
