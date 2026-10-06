-- =============================================================================
-- 0031  Active sessions roster
-- Master spec §19.4 ("Session revocation", "Device/session list"); AUTH-05
--
-- Lets a signed-in person see where their account is signed in and sign one of those places
-- out, from /settings/sessions. Both functions act on the CALLER's sessions only — there is no
-- argument that names a user, and no way to reach another member's sessions from here.
--
-- `auth.sessions` is GoTrue's own table and is not exposed through PostgREST, so these are
-- security definer. The user agent and IP shown are the ones GoTrue already records on every
-- session at sign-in and refresh; nothing new is stored by this migration.
--
-- A connected Chrome extension holds the session of the browser it was paired from
-- (docs/EXTENSION.md §3), so it is never a row of its own: revoking that browser's session also
-- disconnects its extension.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- list_my_auth_sessions(): the caller's live sessions, this one first, then most recently used.
-- -----------------------------------------------------------------------------
create function public.list_my_auth_sessions()
returns table (
  session_id     uuid,
  created_at     timestamptz,
  last_active_at timestamptz,
  user_agent     text,
  ip_address     text,
  is_current     boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.created_at,
    -- `refreshed_at` is a timestamp WITHOUT time zone that GoTrue writes in UTC. greatest()
    -- ignores nulls, so a session that has never refreshed falls back to its sign-in time.
    greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC'),
    s.user_agent,
    host(s.ip),
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
  order by
    s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid desc,
    greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') desc;
$$;

revoke all on function public.list_my_auth_sessions() from public, anon;
grant execute on function public.list_my_auth_sessions() to authenticated;

-- -----------------------------------------------------------------------------
-- revoke_my_auth_session(id): signs one of the caller's OTHER sessions out.
--
-- Deleting the session cascades to its refresh tokens (auth.refresh_tokens.session_id), so the
-- target can no longer refresh, and GoTrue's /user check — which `getUser()` calls on every
-- dashboard request and every extension API call — rejects an access token whose session is
-- gone. The current session is refused: signing yourself out is the header's "Sign out".
--
-- Returns false for an unknown id, someone else's id and the current session alike, so the
-- result cannot be used to probe for session ids.
-- -----------------------------------------------------------------------------
create function public.revoke_my_auth_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_deleted integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;

  delete from auth.sessions
   where id = p_session_id
     and user_id = v_user_id
     and id is distinct from v_current;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.revoke_my_auth_session(uuid) from public, anon;
grant execute on function public.revoke_my_auth_session(uuid) to authenticated;
