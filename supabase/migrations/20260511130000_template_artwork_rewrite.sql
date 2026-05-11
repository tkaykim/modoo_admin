-- Template system rewrite: groups now hold actual Fabric artwork; instances
-- (design_templates) hold a single transform that places the whole group on
-- a product side.
--
-- Old columns (design_composition, placement_map) remain as deprecated to
-- avoid breaking any in-flight reads, but the app stops writing to them.

alter table public.template_groups
  add column if not exists artwork_state jsonb not null default '{}'::jsonb,
  add column if not exists artwork_canvas_size jsonb not null
    default '{"width":800,"height":800}'::jsonb,
  add column if not exists slot_manifest jsonb not null default '[]'::jsonb;

alter table public.design_templates
  add column if not exists side_id text,
  add column if not exists transform jsonb;

comment on column public.template_groups.artwork_state is
  'Fabric.js canvas JSON for the group artwork (the actual visual design).';
comment on column public.template_groups.artwork_canvas_size is
  'Group artwork canvas dimensions: { width, height }';
comment on column public.template_groups.slot_manifest is
  'Replaceable objects in the artwork: [{ object_id, kind, label, accepts?, lock_style?, ... }]';
comment on column public.design_templates.side_id is
  'Which product side this instance places the group on';
comment on column public.design_templates.transform is
  'Group transform on the product canvas: { x, y, width, height, angle?, origin_x?, origin_y? } — normalized 0-1 within printArea.';
