-- Track which design template a saved design / order item originated from.
-- Useful for analytics (template-to-order funnel) and re-order recommendations.

alter table public.saved_designs
  add column if not exists source_template_id uuid references public.design_templates(id) on delete set null;

alter table public.order_items
  add column if not exists source_template_id uuid references public.design_templates(id) on delete set null;

create index if not exists saved_designs_source_template_idx
  on public.saved_designs(source_template_id)
  where source_template_id is not null;

create index if not exists order_items_source_template_idx
  on public.order_items(source_template_id)
  where source_template_id is not null;
