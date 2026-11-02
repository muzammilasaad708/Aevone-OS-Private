-- AEVONE AI Brain additive schema. Does not modify legacy public tables.
create table if not exists public.aevone_ai_chats (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null default 'New conversation' check (char_length(title) <= 160),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists aevone_ai_chats_user_updated on public.aevone_ai_chats(user_id,updated_at desc);
create table if not exists public.aevone_ai_messages (
 id uuid primary key default gen_random_uuid(),
 chat_id uuid not null references public.aevone_ai_chats(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('user','assistant')),
 content text not null check(char_length(content) between 1 and 24000),
 provider text not null default '',
 model text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists aevone_ai_messages_chat_date on public.aevone_ai_messages(chat_id,created_at,id);
create table if not exists public.aevone_ai_requests (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(char_length(provider) <= 45),
 created_at timestamptz not null default now()
);
create index if not exists aevone_ai_requests_user_date on public.aevone_ai_requests(user_id,created_at desc);
alter table public.aevone_ai_chats enable row level security;
alter table public.aevone_ai_messages enable row level security;
alter table public.aevone_ai_requests enable row level security;
grant select,insert,update,delete on public.aevone_ai_chats to authenticated;
grant select,insert,delete on public.aevone_ai_messages to authenticated;
revoke all on public.aevone_ai_requests from anon,authenticated;
grant all on public.aevone_ai_requests to service_role;
create policy aevone_ai_chats_read on public.aevone_ai_chats for select to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
create policy aevone_ai_chats_create on public.aevone_ai_chats for insert to authenticated with check (
 user_id=(select auth.uid()) and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
create policy aevone_ai_chats_edit on public.aevone_ai_chats for update to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
) with check (user_id=(select auth.uid()));
create policy aevone_ai_chats_remove on public.aevone_ai_chats for delete to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
create policy aevone_ai_messages_read on public.aevone_ai_messages for select to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.aevone_ai_chats c where c.id=chat_id and c.user_id=(select auth.uid()))
 and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
create policy aevone_ai_messages_create on public.aevone_ai_messages for insert to authenticated with check (
 user_id=(select auth.uid()) and exists(select 1 from public.aevone_ai_chats c where c.id=chat_id and c.user_id=(select auth.uid()))
 and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
create policy aevone_ai_messages_delete on public.aevone_ai_messages for delete to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.aevone_ai_chats c where c.id=chat_id and c.user_id=(select auth.uid()))
 and exists(select 1 from public.aevone_workspace_members m where m.user_id=(select auth.uid()) and m.status='active')
);
-- Permit optional LLM providers in the existing encrypted credentials store.
-- Use a provider allowlist; do not permit arbitrary URLs/hosts.
alter table public.aevone_connector_credentials drop constraint if exists aevone_connector_credentials_connector_id_check;
alter table public.aevone_connector_credentials add constraint aevone_connector_credentials_connector_id_check
 check (connector_id in (
 'openai','gemini','deepseek','grok','kimi','qwen','together','huggingface',
 'apollo','apify','zoominfo','rapidapi','other','openrouter','groq','cerebras',
 'mistral','cohere','siliconflow'
 ));
