-- =============================================================================
-- 0015  claim_document_job — claim one document's extraction job, by document
-- Master spec §17.5; docs/ARCHITECTURE.md §7; docs/AI_PIPELINE.md §10
--
-- `claim_jobs` (0009) is the scheduler's entry point: it takes whatever is due,
-- from any organization, in run order. That is right for a worker and wrong for
-- a request. `POST /api/documents/:id/process` wants to finish reading the
-- document the operator just uploaded, and only that one — draining the shared
-- queue inside a user's request would make one tenant's upload wait on another
-- tenant's work.
--
-- So this claims by document instead of by position. It takes the same lease as
-- `claim_jobs` and is completed through the same `complete_job`, so the retry and
-- backoff policy stays in one place.
--
-- It also handles the case that made documents hang in the first place: a job
-- queued when no worker existed is still `pending`, so pressing "Read again"
-- finds it and runs it, rather than being deduplicated into doing nothing.
--
-- service_role only. The route handler has already authorized the caller against
-- the document's organization before it gets here.
-- =============================================================================

-- `p_extraction_mode` exists for one specific case: a document that has been sitting at
-- `processing` because nothing ever ran its job. Pressing "Read again" on it is deduplicated by
-- `enqueue_job` — correctly, the work is already queued — so without this the operator's newly
-- chosen reading method would be ignored in favour of the one queued the first time. Rewriting
-- the payload as part of the claim keeps that atomic: there is no window in which the job could
-- be claimed by the scheduler between the rewrite and the run. Null leaves the payload alone.
create or replace function public.claim_document_job(
  p_document_id    uuid,
  p_worker_id      text,
  p_lease_seconds  int default 120,
  p_extraction_mode text default null
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_extraction_mode is not null
     and p_extraction_mode not in ('auto', 'non_ai', 'ai') then
    raise exception 'ASSISTIGO_INVALID_EXTRACTION_MODE' using errcode = 'invalid_parameter_value';
  end if;

  return query
  with claimable as (
    select j.id
      from public.jobs j
     where j.type = 'ocr.extract'
       and j.payload ->> 'documentId' = p_document_id::text
       and j.status in ('pending', 'retry')
       and j.run_after <= now()
       and (j.locked_until is null or j.locked_until < now())
     order by j.created_at
       for update skip locked
     limit 1
  )
  update public.jobs j
     set status       = 'running',
         attempts     = j.attempts + 1,
         locked_by    = p_worker_id,
         locked_until = now() + make_interval(secs => p_lease_seconds),
         payload      = case
                          when p_extraction_mode is null then j.payload
                          else jsonb_set(
                                 j.payload,
                                 '{extractionMode}',
                                 to_jsonb(p_extraction_mode),
                                 true
                               )
                        end,
         updated_at   = now()
    from claimable c
   where j.id = c.id
  returning j.*;
end;
$$;

revoke execute on function public.claim_document_job(uuid, text, int, text)
  from public, authenticated;
grant execute on function public.claim_document_job(uuid, text, int, text) to service_role;

-- The claim filters on a payload key, so give it an index rather than a sequential scan over
-- every job ever queued.
create index if not exists jobs_ocr_document_idx
  on public.jobs ((payload ->> 'documentId'))
  where type = 'ocr.extract';
