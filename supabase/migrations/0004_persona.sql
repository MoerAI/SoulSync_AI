alter table public.profiles
  add column if not exists persona_version text,
  add column if not exists persona_updated_at timestamptz;

create index if not exists profiles_persona_updated_at_idx
  on public.profiles (persona_updated_at)
  where persona_updated_at is not null;
