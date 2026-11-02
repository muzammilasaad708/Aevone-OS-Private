-- AEVONE v3 research jobs. Apply once after backing up your database.
create table if not exists public.aevone_research_jobs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 query text not null check(length(query) between 2 and 1000),
 status text not null default 'queued' check(status in ('queued','running','complete','failed')),
 results jsonb not null default '[]'::jsonb check(jsonb_typeof(results)='array'),
 result_count integer not null default 0 check(result_count between 0 and 100),
 error text,
 created_at timestamptz not null default now(), started_at timestamptz,finished_at timestamptz
);
create index if not exists aevone_research_jobs_user_created on public.aevone_research_jobs(user_id,created_at desc);
alter table public.aevone_research_jobs enable row level security;
revoke all on public.aevone_research_jobs from anon,authenticated;
grant select,insert on public.aevone_research_jobs to authenticated;
grant all on public.aevone_research_jobs to service_role;
create policy aevone_jobs_read on public.aevone_research_jobs for select to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));
create policy aevone_jobs_create on public.aevone_research_jobs for insert to authenticated
 with check (user_id=(select auth.uid()) and status='queued' and results='[]'::jsonb and result_count=0 and error is null and started_at is null and finished_at is null
 and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));
