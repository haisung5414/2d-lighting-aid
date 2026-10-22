-- 2d-lighting-aid: read-only share links (docs/cloud/CLOUD_SPEC.md §10)

-- null = not shared. The owner sets it with a normal update (RLS: own rows only).
alter table public.projects add column if not exists share_token uuid unique;

-- Anyone with the token (signed in or not) can read that one project.
-- Returns the owner's display name only, never the email.
create or replace function public.get_shared_project(token uuid)
returns table (name text, data jsonb, updated_at timestamptz, owner_name text)
language sql stable security definer set search_path = '' as $$
  select p.name, p.data, p.updated_at,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as owner_name
  from public.projects p
  join auth.users u on u.id = p.user_id
  where token is not null and p.share_token = token
  limit 1;
$$;

revoke all on function public.get_shared_project(uuid) from public;
grant execute on function public.get_shared_project(uuid) to anon, authenticated;

-- Turning sharing on/off (or renaming nothing) must not look like a new save:
-- touch updated_at only when the name or the contents change.
create or replace function public.projects_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.name is distinct from old.name or new.data is distinct from old.data then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
