create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade,
  type text not null,
  job_id uuid references public.match_jobs(id) on delete cascade,
  payload jsonb default '{}'::jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
for select using (app_user_id = current_app_user_id());

create policy notifications_insert_own on public.notifications
for insert with check (app_user_id = current_app_user_id());

create policy notifications_update_own on public.notifications
for update using (app_user_id = current_app_user_id())
with check (app_user_id = current_app_user_id());

create policy notifications_delete_own on public.notifications
for delete using (app_user_id = current_app_user_id());

create index if not exists notifications_app_user_created_at_idx
  on public.notifications (app_user_id, created_at desc);

create index if not exists notifications_job_id_idx
  on public.notifications (job_id);
