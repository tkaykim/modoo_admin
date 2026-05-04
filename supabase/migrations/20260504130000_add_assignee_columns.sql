-- 주문/단체별 영업담당자 단일화 정책.
-- 각 주문 = orders.salesman_id (기존 컬럼)
-- 각 단체 = partner_malls.salesman_id (기존 컬럼)
-- 별도 admin/super_admin 담당자 컬럼은 사용하지 않음.
-- (이전 시안에서 추가했던 assignee_profile_id 컬럼들은 본 파일과 무관하게 DROP되었음.)

-- no-op
SELECT 1;
