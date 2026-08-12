-- Lock MODOO CS pricing to deterministic, auditable values.
-- The LLM may explain a quote, but it must not recalculate or override it.

update public.cs_manuals
set
  answer_guide = E'• 문의 감사 후 의류 종류·수량·선택 인쇄방식·인쇄 위치·디자인 수·필요 일정을 확인.\n• 챗봇 문의에 저장된 예상 결제 금액(제품+인쇄)은 결정적 계산기가 만든 가격 정본이며, AI가 다시 계산하거나 인쇄비만 완제품 장당가로 바꾸지 않는다.\n• 구조화 가격이 없는 문의는 실DB customer_print_method_pricing과 products.base_price로 코드가 먼저 계산한 가격 정본을 사용한다.\n• 장당 예상가는 제품 단가+최종 인쇄비와 같아야 하고, 총액은 장당 예상가×수량과 같아야 한다. 불일치하면 저장 전 코드가 교정한다.\n• 고객에게는 최종 장당 예상가와 총액을 먼저 간결하게 안내하고 판값 나누기 같은 상세 계산 과정은 노출하지 않는다.\n• 고객이 선택한 인쇄방식을 우선 견적하고 다른 방식은 대안으로만 제안.\n• 앞·뒤·소매 등 모든 인쇄 위치와 나염 색상 수를 합산.\n• 정확한 금액은 제품과 최종 인쇄 면적 확인 후 담당자가 확정한다고 안내.\n• 납기 판단은 leadtime 매뉴얼을 따른다.',
  policy = coalesce(policy, '{}'::jsonb) || jsonb_build_object(
    'pricing_policy_version', 2,
    '가격정본', '챗봇 구조화 견적 우선, 없으면 DB 결정적 계산',
    'LLM역할', '가격 설명만 허용, 재계산 금지',
    '정합성검사', '제품가+인쇄비=장당가, 장당가×수량=총액'
  ),
  source = 'admin_feedback_deterministic_pricing_v2',
  version = greatest(version, 3) + 1,
  updated_at = now()
where intent = 'quote';

-- The user explicitly identified the Lee Gyeong-ju quote defect as a durable lesson.
-- Preserve it as a concrete reusable rule instead of allowing generic LLM distillation.
update public.cs_feedback
set
  is_pinned = true,
  learning_rule = '챗봇 문의의 예상 결제 금액(제품+인쇄)을 가격 정본으로 사용하고, 나염 인쇄비만 완제품 장당가로 표기하지 않는다. 장당가는 제품가와 인쇄비의 합, 총액은 장당가와 수량의 곱으로 코드 검산한다.',
  learned_at = now(),
  learning_version = greatest(learning_version, 2)
where id = 'c0932bce-262e-4596-b0f6-048eca18a4ef';
