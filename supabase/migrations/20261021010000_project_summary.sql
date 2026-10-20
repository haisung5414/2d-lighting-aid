-- 2d-lighting-aid: summary columns for the home screen (docs/cloud/CLOUD_SPEC.md §3, §9)
-- Generated from `data`, so the home list can show venue, scene count and a thumbnail without downloading whole projects.

alter table public.projects
  add column if not exists venue_key text
    generated always as (data->'stage_config'->>'venue_key') stored,
  add column if not exists scene_count int
    generated always as (case when jsonb_typeof(data->'cues') = 'array' then jsonb_array_length(data->'cues') else 0 end) stored,
  add column if not exists thumbnail text
    generated always as (
      coalesce(
        case when jsonb_typeof(data->'active_cue_index') = 'number'
          then data->'cues'->((data->>'active_cue_index')::int)->>'thumbnail' end,
        data->'cues'->0->>'thumbnail'
      )
    ) stored;
