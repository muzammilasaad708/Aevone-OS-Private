-- ONE-TIME OWNER APPROVAL. AFTER creating your OWN user in Authentication > Users,
-- REPLACE THE PLACEHOLDER UUID with that user ID (not an email or password).
-- Never run this with a stranger's UUID.
insert into public.aevone_workspace_members (user_id,role,status)
values ('REPLACE_WITH_YOUR_AUTH_USER_UUID'::uuid,'owner','active')
on conflict (user_id) do update set role='owner',status='active';
