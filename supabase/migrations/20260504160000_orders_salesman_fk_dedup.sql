-- 중복 FK 정리 + PostgREST 스키마 캐시 리로드.
-- orders.salesman_id 컬럼에는 이미 `orders_attributed_salesman_id_fkey` FK가 존재했음.
-- 임시로 중복 FK(`orders_salesman_id_fkey`)를 추가했다가 PostgREST embed 시
-- ambiguity(PGRST201)가 발생하여 다시 제거한다.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_salesman_id_fkey;
NOTIFY pgrst, 'reload schema';
