-- 전사찍는사람들에 실제 주문 원가 계산에서 사용해 온 DTF 크기별 기준표를 등록한다.
--
-- 2026-06-13 과거 출력원가 백필은 전사찍는사람들 배정 주문에 대해
-- 제일커스텀 명의의 9단계 DTF 표를 사용했다.
-- 2026-09-26 대표 확인에 따라 같은 기준을 실제 공장 명의로 복제한다.
-- 기존 대상 행에 값이 있으면 덮어쓰지 않고 빈 값만 보완한다.

insert into public.factory_print_method_pricing as target (
  factory_id,
  print_method_id,
  size,
  pricing_model,
  unit_price,
  base_price,
  base_quantity,
  additional_price_per_piece,
  is_active,
  note,
  max_width_cm,
  max_height_cm,
  updated_at
)
select
  target_factory.id,
  source_pricing.print_method_id,
  source_pricing.size,
  source_pricing.pricing_model,
  source_pricing.unit_price,
  source_pricing.base_price,
  source_pricing.base_quantity,
  source_pricing.additional_price_per_piece,
  source_pricing.is_active,
  '전사찍는사람들 DTF 기준표. 2026-06-13 과거 원가 백필에 사용한 9단계 표를 2026-09-26 대표 확인으로 실제 공장에 귀속.',
  source_pricing.max_width_cm,
  source_pricing.max_height_cm,
  now()
from public.factory_print_method_pricing source_pricing
join public.manufacturers source_factory
  on source_factory.id = source_pricing.factory_id
join public.print_methods print_method
  on print_method.id = source_pricing.print_method_id
cross join public.manufacturers target_factory
where source_factory.name = '제일커스텀'
  and target_factory.name = '전사찍는사람들'
  and print_method.key = 'dtf'
  and source_pricing.is_active = true
on conflict (factory_id, print_method_id, size) do update
set
  unit_price = coalesce(target.unit_price, excluded.unit_price),
  base_price = coalesce(target.base_price, excluded.base_price),
  base_quantity = coalesce(target.base_quantity, excluded.base_quantity),
  additional_price_per_piece = coalesce(
    target.additional_price_per_piece,
    excluded.additional_price_per_piece
  ),
  max_width_cm = coalesce(target.max_width_cm, excluded.max_width_cm),
  max_height_cm = coalesce(target.max_height_cm, excluded.max_height_cm),
  note = coalesce(target.note, excluded.note),
  updated_at = now();
