/**
 * True when Postgres or PostgREST refused a query because a column does not exist yet — the
 * database has not run the migration that adds it. `42703` is Postgres's undefined_column (a
 * select); `PGRST204` is PostgREST's "column not in the schema cache" (an insert or update).
 *
 * Callers use it to keep working, minus the new column, on a database that is one migration
 * behind the code — the same tolerance `markStored` has for 0034.
 */
export function isMissingColumnError(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}
