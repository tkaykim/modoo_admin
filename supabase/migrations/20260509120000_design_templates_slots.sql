-- Design templates: add category, tags, featured flag, and replaceable slot manifests.
--
-- image_slots[]: { slot_id, side_id, label, default_image_url, aspect_ratio,
--                  print_method_id, accepts: 'photo'|'logo', bg_removal_default? }
-- text_slots[]:  { slot_id, side_id, label, placeholder?, max_length?, lock_style }

alter table public.design_templates
  add column if not exists category text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists is_featured boolean not null default false,
  add column if not exists image_slots jsonb not null default '[]'::jsonb,
  add column if not exists text_slots jsonb not null default '[]'::jsonb;

create index if not exists design_templates_category_active_idx
  on public.design_templates(category, is_active)
  where is_active = true;

create index if not exists design_templates_featured_idx
  on public.design_templates(is_featured)
  where is_featured = true and is_active = true;
