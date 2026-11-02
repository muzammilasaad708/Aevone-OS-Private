-- AEVONE OS Foundation v1 | additive migration, existing tables left untouched.
-- Run once in Supabase SQL Editor. Use the separate bootstrap script after creating your Auth user.

create table if not exists public.aevone_workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')) default 'member',
  status text not null check (status in ('active','suspended')) default 'active',
  joined_at timestamptz not null default now()
);
create table if not exists public.aevone_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  job_title text not null default '',
  updated_at timestamptz not null default now(),
  constraint full_name_limit check (char_length(full_name) <= 120),
  constraint phone_limit check (char_length(phone) <= 35),
  constraint job_title_limit check (char_length(job_title) <= 120)
);
create table if not exists public.aevone_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 250),
  city text not null default '',
  country text not null default '',
  website text not null default '',
  status text not null check (status in ('unverified','reviewed','verified')) default 'unverified',
  stage text not null check (stage in ('Discovered','Qualified','Contacted','Replied','Proposal','Won','Lost')) default 'Discovered',
  source_name text not null default '',
  source_url text not null default '',
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_limit check (char_length(website) <= 2048),
  constraint source_url_limit check (char_length(source_url) <= 2048),
  constraint notes_limit check (char_length(notes) <= 8000)
);
create index if not exists aevone_leads_created_at_desc on public.aevone_leads(created_at desc);
create index if not exists aevone_leads_status on public.aevone_leads(status);

create table if not exists public.aevone_lead_evidence (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.aevone_leads(id) on delete cascade,
  field_name text not null check (field_name in ('company','website','phone','email','person','role','other')),
  source_url text not null check (left(source_url,8)='https://' and char_length(source_url) <= 2048),
  note text not null default '' check (char_length(note)<=1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists aevone_evidence_lead_idx on public.aevone_lead_evidence(lead_id);
create table if not exists public.aevone_lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.aevone_leads(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 160),
  job_title text not null default '',
  email text not null default '',
  phone text not null default '',
  linkedin_url text not null default '',
  source_url text not null default '',
  confidence text not null check (confidence in ('Unverified','Low','Medium','High')) default 'Unverified',
  created_at timestamptz not null default now()
);
create index if not exists aevone_contacts_lead_idx on public.aevone_lead_contacts(lead_id);
create table if not exists public.aevone_research_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null check (char_length(query) between 1 and 2000),
  result_count integer not null default 0 check (result_count>=0),
  created_at timestamptz not null default now()
);
-- Only Edge Functions using the service-role credential may read or mutate this table.
-- AES-256-GCM ciphertext; master key is an Edge Function secret and never stored here.
create table if not exists public.aevone_connector_credentials (
  connector_id text primary key check (connector_id in ('openai','gemini','deepseek','grok','kimi','qwen','together','huggingface','apollo','apify','zoominfo','rapidapi','other')),
  ciphertext text not null,
  nonce text not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Enforce RLS on every public table, including the secret table.
alter table public.aevone_workspace_members enable row level security;
alter table public.aevone_profiles enable row level security;
alter table public.aevone_leads enable row level security;
alter table public.aevone_lead_evidence enable row level security;
alter table public.aevone_lead_contacts enable row level security;
alter table public.aevone_research_history enable row level security;
alter table public.aevone_connector_credentials enable row level security;

-- Keep secrets entirely inaccessible to normal authenticated users (including owners)
-- via the PostgREST Data API. Access is via owner-gated Edge Function only.
revoke all on public.aevone_connector_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.aevone_connector_credentials to service_role;

-- 2026 Supabase Data API exposure defaults can require explicit GRANT.
grant select on public.aevone_workspace_members to authenticated;
grant select, insert, update on public.aevone_profiles to authenticated;
grant select, insert, update, delete on public.aevone_leads to authenticated;
grant select, insert on public.aevone_lead_evidence to authenticated;
grant select, insert, update, delete on public.aevone_lead_contacts to authenticated;
grant select, insert on public.aevone_research_history to authenticated;
grant usage, select on sequence public.aevone_research_history_id_seq to authenticated;

-- Membership is assigned by owner-gated Edge Function / trusted SQL only.
drop policy if exists aevone_members_self_read on public.aevone_workspace_members;
create policy aevone_members_self_read on public.aevone_workspace_members for select to authenticated
using (user_id = (select auth.uid()));

-- Members can edit only their OWN profile. Roles are in workspace_members, never here.
drop policy if exists aevone_profiles_self_read on public.aevone_profiles;
create policy aevone_profiles_self_read on public.aevone_profiles for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists aevone_profiles_self_insert on public.aevone_profiles;
create policy aevone_profiles_self_insert on public.aevone_profiles for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'
));
drop policy if exists aevone_profiles_self_update on public.aevone_profiles;
create policy aevone_profiles_self_update on public.aevone_profiles for update to authenticated
using (user_id = (select auth.uid()) and exists (
  select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'
)) with check (user_id = (select auth.uid()));

-- A single Aevone workspace: ALL active staff may view and work on shared leads.
-- No member can access any CRM data after being suspended.
drop policy if exists aevone_leads_read on public.aevone_leads;
create policy aevone_leads_read on public.aevone_leads for select to authenticated using (
 exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
drop policy if exists aevone_leads_insert on public.aevone_leads;
create policy aevone_leads_insert on public.aevone_leads for insert to authenticated with check (
 created_by=(select auth.uid()) and status='unverified' and
 exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
drop policy if exists aevone_leads_update on public.aevone_leads;
create policy aevone_leads_update on public.aevone_leads for update to authenticated
using (exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'))
with check (exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists aevone_leads_delete on public.aevone_leads;
create policy aevone_leads_delete on public.aevone_leads for delete to authenticated using (
 exists (select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
 and (created_by=(select auth.uid()) or exists (
  select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active' and m.role in ('owner','admin')
 ))
);

-- Prevent forged creator edits and evidence-free verification, even over direct REST requests.
create or replace function public.aevone_guard_lead_update() returns trigger language plpgsql
set search_path = '' as $$
begin
 if old.created_by is distinct from new.created_by then
  raise exception 'created_by cannot be changed';
 end if;
 if new.status='verified' and (old.status is distinct from 'verified') then
  if not exists(select 1 from public.aevone_lead_evidence e where e.lead_id=new.id) then
   raise exception 'Add at least one evidence URL before marking reviewed/verified';
  end if;
  new.verified_at := now();
  new.verified_by := auth.uid();
 elsif new.status <> 'verified' then
  new.verified_at := null;
  new.verified_by := null;
 else
  new.verified_at := old.verified_at;
  new.verified_by := old.verified_by;
 end if;
 new.updated_at := now();
 return new;
end;
$$;
revoke all on function public.aevone_guard_lead_update() from public, anon, authenticated;
drop trigger if exists aevone_guard_lead_changes on public.aevone_leads;
create trigger aevone_guard_lead_changes before update on public.aevone_leads
for each row execute function public.aevone_guard_lead_update();

-- Evidence and contacts have to belong to a lead accessible to the workspace.
drop policy if exists aevone_evidence_read on public.aevone_lead_evidence;
create policy aevone_evidence_read on public.aevone_lead_evidence for select to authenticated
using (exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists aevone_evidence_insert on public.aevone_lead_evidence;
create policy aevone_evidence_insert on public.aevone_lead_evidence for insert to authenticated with check (
 created_by=(select auth.uid()) and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
drop policy if exists aevone_contacts_read on public.aevone_lead_contacts;
create policy aevone_contacts_read on public.aevone_lead_contacts for select to authenticated
using (exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists aevone_contacts_insert on public.aevone_lead_contacts;
create policy aevone_contacts_insert on public.aevone_lead_contacts for insert to authenticated
with check (exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists aevone_contacts_update on public.aevone_lead_contacts;
create policy aevone_contacts_update on public.aevone_lead_contacts for update to authenticated
using (exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'))
with check (exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));
drop policy if exists aevone_contacts_delete on public.aevone_lead_contacts;
create policy aevone_contacts_delete on public.aevone_lead_contacts for delete to authenticated
using (exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));

drop policy if exists aevone_history_read on public.aevone_research_history;
create policy aevone_history_read on public.aevone_research_history for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists aevone_history_insert on public.aevone_research_history;
create policy aevone_history_insert on public.aevone_research_history for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active'));

-- Explicitly do NOT create any policies for connector_credentials.
