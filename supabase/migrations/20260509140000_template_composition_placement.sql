-- Template Composition + Placement
--
-- design_composition is a reusable design definition stored on the GROUP:
--   { slots: [{ slot_id, kind: 'text'|'image', label, default_*, lock_style, ... }] }
--
-- placement_map is per-instance and stored on each design_templates row that
-- belongs to a group. It maps each composition slot_id to its placement on
-- THAT product's canvas (normalized 0-1 coordinates):
--   { [slot_id]: { side_id, x, y, width, height, angle?, origin_*?, overrides? } }
--
-- Legacy `image_slots` / `text_slots` on design_templates remain in use for
-- standalone (no-group) templates. Group-bound templates use placement_map.

alter table public.template_groups
  add column if not exists design_composition jsonb not null default '{"slots":[]}'::jsonb;

alter table public.design_templates
  add column if not exists placement_map jsonb not null default '{}'::jsonb;

comment on column public.template_groups.design_composition is
  'Reusable design composition shared across all instances: { slots: [...] }';

comment on column public.design_templates.placement_map is
  'Per-instance placement of group composition slots on this product canvas (normalized 0-1)';
