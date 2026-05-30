create extension if not exists vector with schema extensions;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid unique,
  primary_email text,
  display_name text,
  is_synthetic boolean default false,
  birth_year int,
  age_verified boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.external_identities (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  email text,
  raw_claims jsonb,
  created_at timestamptz default now(),
  unique (provider, provider_subject)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade unique,
  gender text,
  interested_in text[],
  city text,
  district text,
  mbti text,
  mbti_scores jsonb,
  religion_type text,
  religion_intensity int check (religion_intensity between 1 and 5),
  values jsonb,
  salary_band text,
  visibility text default 'private',
  is_synthetic boolean default false,
  profile_text text,
  persona_spec jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.profile_answers (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade,
  question_id text not null,
  answer jsonb,
  privacy_class text,
  created_at timestamptz default now()
);

create table public.profile_embeddings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  embedding_model text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade,
  bucket text not null,
  path text not null,
  moderation_status text default 'pending',
  is_primary boolean default false,
  created_at timestamptz default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade,
  scope text not null,
  granted boolean not null,
  version text not null,
  locale text default 'ko',
  source text not null,
  created_at timestamptz default now()
);

create table public.match_jobs (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete cascade,
  status text default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  progress int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.match_simulations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references public.app_users(id),
  user_b uuid references public.app_users(id),
  profile_a_version text,
  profile_b_version text,
  sim_prompt_version text,
  judge_prompt_version text,
  model text,
  transcript jsonb,
  judge_score jsonb,
  overall numeric,
  tokens int,
  status text default 'pending',
  created_at timestamptz default now(),
  unique (user_a, user_b, profile_a_version, profile_b_version, sim_prompt_version, judge_prompt_version, model)
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.match_jobs(id) on delete cascade,
  app_user_id uuid references public.app_users(id),
  candidate_id uuid references public.app_users(id),
  rank int,
  overall numeric,
  subscores jsonb,
  summary_ko text,
  is_synthetic boolean default false,
  created_at timestamptz default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.app_users(id),
  reported_id uuid references public.app_users(id),
  reason text,
  created_at timestamptz default now()
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid references public.app_users(id),
  blocked_id uuid references public.app_users(id),
  created_at timestamptz default now(),
  unique (blocker_id, blocked_id)
);

create index on public.profile_embeddings using hnsw (embedding extensions.vector_cosine_ops);
create index on public.profile_embeddings (embedding_model);
create index on public.profiles (city, religion_type, gender, is_synthetic);
