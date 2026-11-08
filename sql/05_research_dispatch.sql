-- Additive job-dispatch deduplication; service-only writes, no secrets in tables.
alter table public.aevone_research_jobs add column if not exists dispatch_requested_at timestamptz;
create index if not exists aevone_jobs_pending_dispatch on public.aevone_research_jobs(created_at)
 where status='queued' and dispatch_requested_at is null;
