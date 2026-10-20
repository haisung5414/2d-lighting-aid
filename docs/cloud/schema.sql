-- 2d-lighting-aid: online projects (docs/cloud/CLOUD_SPEC.md §3)
-- Run once in Supabase → SQL Editor.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  data        jsonb not null check (octet_length(data::text) < 5000000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.projects enable row level security;

create policy "own projects: select" on public.projects
  for select to authenticated using (auth.uid() = user_id);
create policy "own projects: insert" on public.projects
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own projects: update" on public.projects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own projects: delete" on public.projects
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.projects_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.projects_touch_updated_at();
