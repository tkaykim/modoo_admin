-- ============================================================================
-- Lead 백필: inquiries + chatbot_inquiries → lead_organizations / lead_contacts
-- ============================================================================
-- 정책
--  - is_admin=true(가짜문의) 제외.
--  - 인바운드(우리에게 먼저 연락) → status='valid', consent_status='existing_customer'.
--  - 단체명(group_name) 있으면 org 생성(정규화 중복 병합), 담당자는 contact로 연결.
--  - category는 자동분류하지 않음(오분류 방지 — admin 수동).
--  - 멱등: linked_inquiry_id / linked_chatbot_inquiry_id + email/phone 중복 가드.
--  - 재실행 안전. 되돌리기: DELETE FROM lead_contacts WHERE source IN ('self_inquiry','self_chatbot');
--                          DELETE FROM lead_organizations WHERE source='self_inquiry';
-- ============================================================================

-- 1) 단체(organizations) — group_name 있는 진짜 문의에서, 정규화 중복 병합
INSERT INTO public.lead_organizations (name, source, source_ref, created_at)
SELECT DISTINCT ON (lower(btrim(i.group_name)))
       btrim(i.group_name), 'self_inquiry', i.id::text, i.created_at
FROM public.inquiries i
WHERE coalesce(i.is_admin, false) = false
  AND nullif(btrim(i.group_name), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_organizations o
    WHERE o.source = 'self_inquiry' AND lower(o.name) = lower(btrim(i.group_name))
  )
ORDER BY lower(btrim(i.group_name)), i.created_at ASC;

-- 2) 담당자(contacts) — 게시판 문의에서
INSERT INTO public.lead_contacts
  (organization_id, name, role_title, email, phone, kakao_id,
   source, source_detail, status, consent_status, consent_source, consent_at,
   linked_inquiry_id, first_seen_at, meta)
SELECT
  o.id,
  nullif(btrim(i.manager_name), ''),
  '담당자',
  nullif(btrim(i.email), ''),
  nullif(btrim(i.phone), ''),
  nullif(btrim(i.kakao_id), ''),
  'self_inquiry',
  nullif(btrim(i.title), ''),
  'valid', 'existing_customer', 'inbound_inquiry', i.created_at,
  i.id, i.created_at,
  jsonb_strip_nulls(jsonb_build_object('expected_qty', i.expected_qty, 'desired_date', i.desired_date))
FROM public.inquiries i
LEFT JOIN public.lead_organizations o
  ON o.source = 'self_inquiry' AND lower(o.name) = lower(btrim(i.group_name))
WHERE coalesce(i.is_admin, false) = false
  AND NOT EXISTS (SELECT 1 FROM public.lead_contacts c WHERE c.linked_inquiry_id = i.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_contacts c
    WHERE (nullif(lower(btrim(i.email)), '') IS NOT NULL
           AND c.email_norm = nullif(lower(btrim(i.email)), ''))
       OR (nullif(regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
           AND c.phone_norm = nullif(regexp_replace(coalesce(i.phone, ''), '[^0-9]', '', 'g'), ''))
  );

-- 3) 담당자(contacts) — 챗봇 상담에서 (게시판과 중복 인물 제외)
INSERT INTO public.lead_contacts
  (organization_id, name, role_title, email, phone, kakao_id,
   source, source_detail, status, consent_status, consent_source, consent_at,
   linked_chatbot_inquiry_id, first_seen_at, meta)
SELECT DISTINCT ON (nullif(lower(btrim(cb.contact_email)), ''))
  NULL::uuid,
  nullif(btrim(cb.contact_name), ''),
  '담당자',
  nullif(btrim(cb.contact_email), ''),
  nullif(btrim(cb.contact_phone), ''),
  NULL,
  'self_chatbot',
  nullif(btrim(cb.clothing_type), ''),
  'valid', 'existing_customer', 'inbound_chatbot', cb.created_at,
  cb.id, cb.created_at,
  jsonb_strip_nulls(jsonb_build_object('clothing_type', cb.clothing_type, 'quantity', cb.quantity))
FROM public.chatbot_inquiries cb
WHERE NOT EXISTS (SELECT 1 FROM public.lead_contacts c WHERE c.linked_chatbot_inquiry_id = cb.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_contacts c
    WHERE (nullif(lower(btrim(cb.contact_email)), '') IS NOT NULL
           AND c.email_norm = nullif(lower(btrim(cb.contact_email)), ''))
       OR (nullif(regexp_replace(coalesce(cb.contact_phone, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
           AND c.phone_norm = nullif(regexp_replace(coalesce(cb.contact_phone, ''), '[^0-9]', '', 'g'), ''))
  )
ORDER BY nullif(lower(btrim(cb.contact_email)), ''), cb.created_at ASC;

-- ============================================================================
-- 4) DEDUP — 같은 사람이 여러 번 문의해 생긴 중복 정리 (멱등)
-- ============================================================================
-- A) 연락처: phone_norm 기준 1인 1행. 보존 우선순위 = org연결 > 이메일 > 최초.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY phone_norm
      ORDER BY (organization_id IS NOT NULL) DESC, (email IS NOT NULL) DESC, first_seen_at ASC, id
    ) AS rn
  FROM public.lead_contacts
  WHERE phone_norm IS NOT NULL
)
DELETE FROM public.lead_contacts c USING ranked r
WHERE c.id = r.id AND r.rn > 1;

-- B) 단체: 위 정리 후 연락처 0개가 된 고아(철자변형 중복) 삭제.
DELETE FROM public.lead_organizations o
WHERE o.source = 'self_inquiry'
  AND NOT EXISTS (SELECT 1 FROM public.lead_contacts c WHERE c.organization_id = o.id);
