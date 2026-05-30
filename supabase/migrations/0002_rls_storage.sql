create or replace function current_app_user_id() returns uuid
language sql security definer stable
as $$ select id from app_users where supabase_user_id = auth.uid() limit 1; $$;

alter table public.app_users enable row level security;
alter table public.external_identities enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_answers enable row level security;
alter table public.profile_embeddings enable row level security;
alter table public.photos enable row level security;
alter table public.consents enable row level security;
alter table public.match_jobs enable row level security;
alter table public.match_simulations enable row level security;
alter table public.recommendations enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

create policy app_users_select_own on public.app_users
for select using (id = current_app_user_id());

create policy app_users_update_own on public.app_users
for update using (id = current_app_user_id())
with check (id = current_app_user_id());

create policy external_identities_select_own on public.external_identities
for select using (app_user_id = current_app_user_id());

create policy external_identities_insert_own on public.external_identities
for insert with check (app_user_id = current_app_user_id());

create policy external_identities_update_own on public.external_identities
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy external_identities_delete_own on public.external_identities
for delete using (app_user_id = current_app_user_id());

create policy profiles_select_own_or_discoverable on public.profiles
for select using (app_user_id = current_app_user_id() or visibility = 'discoverable');

create policy profiles_insert_own on public.profiles
for insert with check (app_user_id = current_app_user_id());

create policy profiles_update_own on public.profiles
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy profiles_delete_own on public.profiles
for delete using (app_user_id = current_app_user_id());

create policy profile_answers_select_own on public.profile_answers
for select using (app_user_id = current_app_user_id());

create policy profile_answers_insert_own on public.profile_answers
for insert with check (app_user_id = current_app_user_id());

create policy profile_answers_update_own on public.profile_answers
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy profile_answers_delete_own on public.profile_answers
for delete using (app_user_id = current_app_user_id());

create policy profile_embeddings_select_discoverable_or_own on public.profile_embeddings
for select using (
  profile_id in (
    select id from public.profiles
    where visibility = 'discoverable' or app_user_id = current_app_user_id()
  )
);

create policy photos_select_own on public.photos
for select using (app_user_id = current_app_user_id());

create policy photos_insert_own on public.photos
for insert with check (app_user_id = current_app_user_id());

create policy photos_update_own on public.photos
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy photos_delete_own on public.photos
for delete using (app_user_id = current_app_user_id());

create policy consents_select_own on public.consents
for select using (app_user_id = current_app_user_id());

create policy consents_insert_own on public.consents
for insert with check (app_user_id = current_app_user_id());

create policy consents_update_own on public.consents
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy consents_delete_own on public.consents
for delete using (app_user_id = current_app_user_id());

create policy match_jobs_select_own on public.match_jobs
for select using (app_user_id = current_app_user_id());

create policy match_jobs_insert_own on public.match_jobs
for insert with check (app_user_id = current_app_user_id());

create policy match_jobs_update_own on public.match_jobs
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy match_jobs_delete_own on public.match_jobs
for delete using (app_user_id = current_app_user_id());

create policy match_simulations_select_participant on public.match_simulations
for select using (user_a = current_app_user_id() or user_b = current_app_user_id());

create policy recommendations_select_own on public.recommendations
for select using (app_user_id = current_app_user_id());

create policy recommendations_insert_own on public.recommendations
for insert with check (app_user_id = current_app_user_id());

create policy recommendations_update_own on public.recommendations
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy recommendations_delete_own on public.recommendations
for delete using (app_user_id = current_app_user_id());

create policy reports_select_own on public.reports
for select using (reporter_id = current_app_user_id());

create policy reports_insert_own on public.reports
for insert with check (reporter_id = current_app_user_id());

create policy blocks_select_own on public.blocks
for select using (blocker_id = current_app_user_id());

create policy blocks_insert_own on public.blocks
for insert with check (blocker_id = current_app_user_id());

create policy blocks_update_own on public.blocks
for update using (blocker_id = current_app_user_id())
with check (blocker_id = current_app_user_id());

create policy blocks_delete_own on public.blocks
for delete using (blocker_id = current_app_user_id());

insert into storage.buckets (id, name, public) values ('profile-public', 'profile-public', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('profile-private', 'profile-private', false) on conflict do nothing;

create policy profile_private_select_own_folder on storage.objects
for select using (
  bucket_id = 'profile-private'
  and name like current_app_user_id()::text || '/%'
);

create policy profile_private_insert_own_folder on storage.objects
for insert with check (
  bucket_id = 'profile-private'
  and name like current_app_user_id()::text || '/%'
);

create policy profile_private_update_own_folder on storage.objects
for update using (
  bucket_id = 'profile-private'
  and name like current_app_user_id()::text || '/%'
)
with check (
  bucket_id = 'profile-private'
  and name like current_app_user_id()::text || '/%'
);

create policy profile_private_delete_own_folder on storage.objects
for delete using (
  bucket_id = 'profile-private'
  and name like current_app_user_id()::text || '/%'
);
