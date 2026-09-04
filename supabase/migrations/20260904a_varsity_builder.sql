-- 과잠(바시티) 빌더 2단계 (2026-09-04) — 모두 추가 컬럼만, 기존 데이터 무변경.
-- 1) AI 디자이너 세션에 빌더 상태(부위 색·슬롯·명단) 저장
alter table public.ai_designer_requests
  add column if not exists builder_state jsonb;

-- 2) 개인화 명단(이름·학번·사이즈) — 저장 디자인이 정본, 장바구니는 사본, 주문 항목은 item_options.personalization 으로 복사
alter table public.saved_designs
  add column if not exists personalization jsonb;
alter table public.cart_items
  add column if not exists personalization jsonb;

comment on column public.ai_designer_requests.builder_state is 'AI 디자이너 과잠 빌더 상태 {partColors, slots, roster, quantities} — 서버 API 전용';
comment on column public.saved_designs.personalization is '과잠 개인화 명단 {mode, commonNumber, rows:[{name, number, size}]} — 주문 시 order_items.item_options.personalization 으로 복사';
comment on column public.cart_items.personalization is 'saved_designs.personalization 사본 (체크아웃에서 order_items.item_options 로 전달)';
