-- 챗봇 스마트 상담: chatbot_inquiries에 디자인/인쇄/추천 스냅샷 컬럼 추가
-- 고객이 챗봇에서 입력한 디자인 종류·색상·인쇄 위치·인쇄방식과,
-- 시스템이 보여준 추천 방식·예상 단가 범위를 함께 저장해 영업 후속 처리에 활용.

ALTER TABLE public.chatbot_inquiries
  ADD COLUMN IF NOT EXISTS design_type text,
  ADD COLUMN IF NOT EXISTS color_count text,
  ADD COLUMN IF NOT EXISTS print_locations jsonb,
  ADD COLUMN IF NOT EXISTS print_method text,
  ADD COLUMN IF NOT EXISTS recommended_print_method text,
  ADD COLUMN IF NOT EXISTS estimated_price_min integer,
  ADD COLUMN IF NOT EXISTS estimated_price_max integer,
  ADD COLUMN IF NOT EXISTS recommended_product_ids jsonb;

COMMENT ON COLUMN public.chatbot_inquiries.design_type IS '디자인 종류 (사진·실사 / 일러스트·풀그래픽 / 로고·텍스트 / 디자인 없음)';
COMMENT ON COLUMN public.chatbot_inquiries.color_count IS '로고·텍스트 색상 수 (1색~4색 이상 / 그라데이션). 풀컬러 디자인은 null';
COMMENT ON COLUMN public.chatbot_inquiries.print_locations IS '인쇄 위치 배열 (앞/가슴, 등판, 소매 등)';
COMMENT ON COLUMN public.chatbot_inquiries.print_method IS '고객이 선택한 인쇄방식';
COMMENT ON COLUMN public.chatbot_inquiries.recommended_print_method IS '시스템이 추천한 인쇄방식 (고객 선택과 다를 수 있음)';
COMMENT ON COLUMN public.chatbot_inquiries.estimated_price_min IS '고객에게 보여준 1벌당 예상 인쇄비 최소값 (원). null=담당자 안내';
COMMENT ON COLUMN public.chatbot_inquiries.estimated_price_max IS '고객에게 보여준 1벌당 예상 인쇄비 최대값 (원)';
COMMENT ON COLUMN public.chatbot_inquiries.recommended_product_ids IS '추천 카드에 노출된 제품 id 배열';
