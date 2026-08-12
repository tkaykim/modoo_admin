-- Explicit reviewer notes were initially pinned verbatim.
-- Replace case-specific wording and dates with reusable durable rules.

update public.cs_feedback
set learning_rule = case id
  when 'f2237742-fe52-4863-a5cb-e1ed5d9ce7d7'::uuid then '앞·뒤·소매 등 인쇄 위치가 여러 곳이면 모든 위치의 인쇄비를 합산하고 한 위치만 견적하지 않는다.'
  when '1fb67558-0578-497d-a67f-8bc3f6968cdc'::uuid then '견적 안내 후 모두의 유니폼 홈페이지에서 디자인과 자동 견적을 진행할 수 있는 링크를 함께 안내한다.'
  when '50732805-b371-4595-9299-2011e7f28747'::uuid then '티셔츠 제작기간은 디자인 확정 후 영업일 기준 5~7일로 안내한다.'
  when 'c9d78b39-8a03-42e6-aa00-c2e1b3fe8f06'::uuid then '희망일까지 7일 미만이면 일정 가능을 약속하지 않고, 제작이 어려울 수 있어 가능한 가장 빠른 일정을 확인한다고 안내한다.'
  when 'f9446567-a366-4e24-8990-8b570e202d2d'::uuid then '티셔츠는 디자인 확정 후 영업일 기준 5~7일이 필요하므로 그보다 촉박한 희망일은 가능하다고 답하지 않는다.'
  when 'e417c3a5-a136-4c66-973b-c8fd93d92266'::uuid then 'AI 목업 이미지만으로는 제작할 수 없으므로 의류가 제거된 인쇄용 디자인 원본 또는 디자인만 있는 이미지를 요청한다.'
  when '7353d2c6-614b-4fc8-8c05-155e5b4dc4e9'::uuid then '현재일부터 희망일까지 남은 기간이 제작 소요일보다 짧으면 일정 가능이나 일정 충분이라고 표현하지 않는다.'
  else learning_rule
end,
learning_version = 1,
learned_at = coalesce(learned_at, now())
where id in (
  'f2237742-fe52-4863-a5cb-e1ed5d9ce7d7',
  '1fb67558-0578-497d-a67f-8bc3f6968cdc',
  '50732805-b371-4595-9299-2011e7f28747',
  'c9d78b39-8a03-42e6-aa00-c2e1b3fe8f06',
  'f9446567-a366-4e24-8990-8b570e202d2d',
  'e417c3a5-a136-4c66-973b-c8fd93d92266',
  '7353d2c6-614b-4fc8-8c05-155e5b4dc4e9'
);

update public.cs_manuals
set
  answer_guide = replace(
    answer_guide,
    '실DB customer_print_method_pricing과 products.base_price가 주입된 경우에만 제품 단가 + 위치별 인쇄비의 예상 장당가·총액을 안내.',
    '실DB customer_print_method_pricing과 products.base_price로 내부 계산한 최종 장당 예상가와 총액을 먼저 간결하게 안내하고, 판값 나누기 같은 상세 계산 과정은 노출하지 않는다.'
  ),
  source = 'admin_feedback_consolidation',
  version = version + 1,
  updated_at = now()
where intent = 'quote' and status = 'approved';
