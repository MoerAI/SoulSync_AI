create table public.profile_cards (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade,
  html text,
  css text,
  placeholders jsonb not null default '[]'::jsonb,
  style text,
  generator_version text,
  photo_fingerprint text,
  profile_version text,
  status text not null default 'ready',
  is_synthetic boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (app_user_id, profile_version, photo_fingerprint, style, generator_version)
);

create table public.profile_card_jobs (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade,
  status text default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  progress int default 0,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profile_cards enable row level security;
alter table public.profile_card_jobs enable row level security;

create policy profile_cards_select_own on public.profile_cards
for select using (app_user_id = current_app_user_id());

create policy profile_cards_insert_own on public.profile_cards
for insert with check (app_user_id = current_app_user_id());

create policy profile_cards_update_own on public.profile_cards
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy profile_card_jobs_select_own on public.profile_card_jobs
for select using (app_user_id = current_app_user_id());

create policy profile_card_jobs_insert_own on public.profile_card_jobs
for insert with check (app_user_id = current_app_user_id());

create policy profile_card_jobs_update_own on public.profile_card_jobs
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());
