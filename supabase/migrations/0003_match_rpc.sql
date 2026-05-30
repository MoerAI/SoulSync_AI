create or replace function public.match_candidate_profiles(
  query_user_id uuid,
  query_embedding extensions.vector(384),
  match_count int default 20,
  min_similarity float default 0,
  filter_gender text default null,
  filter_interested_in text[] default null,
  filter_city text default null,
  filter_religion text[] default null
)
returns table (
  profile_id uuid,
  app_user_id uuid,
  gender text,
  interested_in text[],
  city text,
  religion_type text,
  persona_spec jsonb,
  is_synthetic boolean,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with scored as (
    select
      p.id as profile_id,
      p.app_user_id,
      p.gender,
      p.interested_in,
      p.city,
      p.religion_type,
      p.persona_spec,
      p.is_synthetic,
      (1 - (pe.embedding <=> query_embedding))::float as similarity
    from public.profile_embeddings pe
    join public.profiles p on p.id = pe.profile_id
    where p.visibility = 'discoverable'
      and p.app_user_id <> query_user_id
      and (
        filter_interested_in is null
        or cardinality(filter_interested_in) = 0
        or p.gender = any(filter_interested_in)
        or 'any' = any(filter_interested_in)
        or 'all' = any(filter_interested_in)
      )
      and (
        filter_gender is null
        or filter_gender = any(coalesce(p.interested_in, '{}'::text[]))
        or 'any' = any(coalesce(p.interested_in, '{}'::text[]))
        or 'all' = any(coalesce(p.interested_in, '{}'::text[]))
      )
      and (filter_city is null or p.city = filter_city)
      and (
        filter_religion is null
        or cardinality(filter_religion) = 0
        or p.religion_type = any(filter_religion)
      )
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = query_user_id and b.blocked_id = p.app_user_id)
          or (b.blocker_id = p.app_user_id and b.blocked_id = query_user_id)
      )
  )
  select
    scored.profile_id,
    scored.app_user_id,
    scored.gender,
    scored.interested_in,
    scored.city,
    scored.religion_type,
    scored.persona_spec,
    scored.is_synthetic,
    scored.similarity
  from scored
  where scored.similarity >= min_similarity
  order by scored.similarity desc, scored.profile_id asc
  limit greatest(match_count, 0);
$$;

grant execute on function public.match_candidate_profiles(uuid, extensions.vector(384), int, float, text, text[], text, text[]) to authenticated, service_role;
