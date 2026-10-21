-- 2d-lighting-aid: at most 20 online projects per user (docs/cloud/CLOUD_SPEC.md §3)
-- Only inserts are limited; updating or overwriting an existing project is always allowed.
-- Runs with the caller's rights: RLS already limits the count to the caller's own rows.

create or replace function public.projects_enforce_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.projects where user_id = new.user_id) >= 20 then
    raise exception 'project limit reached'
      using errcode = 'P0001', hint = 'lighting-aid: max 20 projects per user';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_enforce_limit on public.projects;
create trigger projects_enforce_limit
  before insert on public.projects
  for each row execute function public.projects_enforce_limit();
