-- Design Template Groups
-- A group bundles N product-specific design_templates that share the same
-- design concept (e.g. "왼쪽 가슴 로고", "가족사진 정중앙") so customers can
-- pick a concept first and then choose which product to apply it to.
--
-- A design_template with template_group_id = NULL is a stand-alone template
-- (legacy or admin-chosen single product). The two coexist in the gallery.

create table if not exists public.template_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  tags text[] not null default '{}',
  preview_url text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.design_templates
  add column if not exists template_group_id uuid
    references public.template_groups(id) on delete set null;

create index if not exists template_groups_active_idx
  on public.template_groups(is_active)
  where is_active = true;

create index if not exists template_groups_category_active_idx
  on public.template_groups(category, is_active)
  where is_active = true;

create index if not exists template_groups_featured_idx
  on public.template_groups(is_featured)
  where is_featured = true and is_active = true;

create index if not exists design_templates_group_idx
  on public.design_templates(template_group_id)
  where template_group_id is not null;

-- RLS — public read for active groups, admin full access.
alter table public.template_groups enable row level security;

drop policy if exists "Public read active template groups" on public.template_groups;
create policy "Public read active template groups" on public.template_groups
  for select
  using (is_active = true);

drop policy if exists "Admins manage template groups" on public.template_groups;
create policy "Admins manage template groups" on public.template_groups
  for all
  using (public.app_is_admin_or_super_admin())
  with check (public.app_is_admin_or_super_admin());
