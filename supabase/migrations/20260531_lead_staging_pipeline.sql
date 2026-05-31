-- ============================================================================
-- Lead 수집 백본: lead_staging + classify/promote 함수
-- ============================================================================
-- 모든 소스 커넥터(CSV/NEIS/web)는 lead_staging 로 적재 → classify(중복판정)
-- → promote(승격: lead_organizations/lead_contacts 생성 + dedup). cron 재사용 대비.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_staging (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source             text NOT NULL,                 -- csv / neis_school / web / manual / referral
  source_ref         text,                          -- 외부 고유키(NEIS 학교코드 등)
  batch_id           text,                          -- 가져오기 배치 식별자
  raw                jsonb NOT NULL DEFAULT '{}',
  org_name           text,
  category           text,
  region             text,
  address            jsonb,
  homepage           text,
  contact_name       text,
  role_title         text,
  email              text,
  email_norm         text GENERATED ALWAYS AS (nullif(lower(btrim(email)), '')) STORED,
  phone              text,
  phone_norm         text GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), '')) STORED,
  kakao_id           text,
  dedup_status       text NOT NULL DEFAULT 'new',    -- new/duplicate/promoted/rejected/needs_review
  dedup_reason       text,
  promoted_org_id    uuid REFERENCES public.lead_organizations(id) ON DELETE SET NULL,
  promoted_contact_id uuid REFERENCES public.lead_contacts(id) ON DELETE SET NULL,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz,
  CONSTRAINT lead_staging_dedup_chk
    CHECK (dedup_status IN ('new','duplicate','promoted','rejected','needs_review'))
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_staging_source_ref_uq
  ON public.lead_staging (source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_staging_status_idx ON public.lead_staging (dedup_status);
CREATE INDEX IF NOT EXISTS lead_staging_batch_idx  ON public.lead_staging (batch_id);
CREATE INDEX IF NOT EXISTS lead_staging_email_idx  ON public.lead_staging (email_norm) WHERE email_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_staging_phone_idx  ON public.lead_staging (phone_norm) WHERE phone_norm IS NOT NULL;

ALTER TABLE public.lead_staging ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.lead_staging IS
  '수집 소스 원본 적재 → classify(중복판정) → promote(승격). service-role only.';

-- ── classify: 중복/발송제외 판정 (승격 전 미리보기용) ────────────────────────
CREATE OR REPLACE FUNCTION public.lead_classify_staging(p_batch text DEFAULT NULL)
RETURNS TABLE(total int, marked_duplicate int, marked_rejected int, remaining_new int)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 발송 영구제외(suppression) 매칭 → rejected
  UPDATE public.lead_staging s
  SET dedup_status='rejected', dedup_reason='suppression 등록 대상', processed_at=now()
  WHERE s.dedup_status='new' AND (p_batch IS NULL OR s.batch_id=p_batch)
    AND EXISTS (SELECT 1 FROM public.lead_suppression sup
                WHERE (s.email_norm IS NOT NULL AND sup.email_norm=s.email_norm)
                   OR (s.phone_norm IS NOT NULL AND sup.phone_norm=s.phone_norm));

  -- 기존 lead_contacts 매칭 → duplicate
  UPDATE public.lead_staging s
  SET dedup_status='duplicate', dedup_reason='이미 리드에 존재', processed_at=now()
  WHERE s.dedup_status='new' AND (p_batch IS NULL OR s.batch_id=p_batch)
    AND EXISTS (SELECT 1 FROM public.lead_contacts c
                WHERE (s.email_norm IS NOT NULL AND c.email_norm=s.email_norm)
                   OR (s.phone_norm IS NOT NULL AND c.phone_norm=s.phone_norm));

  -- 배치 내 중복(같은 email/phone) → 최초 1행만 남기고 duplicate
  WITH d AS (
    SELECT id, row_number() OVER (
             PARTITION BY coalesce(email_norm, phone_norm, id::text)
             ORDER BY created_at, id) AS rn
    FROM public.lead_staging
    WHERE dedup_status='new' AND (p_batch IS NULL OR batch_id=p_batch)
      AND (email_norm IS NOT NULL OR phone_norm IS NOT NULL)
  )
  UPDATE public.lead_staging s
  SET dedup_status='duplicate', dedup_reason='가져오기 내 중복', processed_at=now()
  FROM d WHERE d.id=s.id AND d.rn>1;

  RETURN QUERY SELECT
    (SELECT count(*)::int FROM public.lead_staging WHERE (p_batch IS NULL OR batch_id=p_batch)),
    (SELECT count(*)::int FROM public.lead_staging WHERE dedup_status='duplicate' AND (p_batch IS NULL OR batch_id=p_batch)),
    (SELECT count(*)::int FROM public.lead_staging WHERE dedup_status='rejected' AND (p_batch IS NULL OR batch_id=p_batch)),
    (SELECT count(*)::int FROM public.lead_staging WHERE dedup_status='new' AND (p_batch IS NULL OR batch_id=p_batch));
END $$;

-- ── promote: 'new' 행을 lead_organizations/lead_contacts 로 승격 ──────────────
CREATE OR REPLACE FUNCTION public.lead_promote_staging(p_batch text DEFAULT NULL)
RETURNS TABLE(promoted int, skipped int)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_org_id uuid;
  v_contact_id uuid;
  v_promoted int := 0;
  v_skipped int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.lead_staging
    WHERE dedup_status='new' AND (p_batch IS NULL OR batch_id=p_batch)
    ORDER BY created_at, id
  LOOP
    -- 발송 제외 재확인
    IF EXISTS (SELECT 1 FROM public.lead_suppression sup
               WHERE (r.email_norm IS NOT NULL AND sup.email_norm=r.email_norm)
                  OR (r.phone_norm IS NOT NULL AND sup.phone_norm=r.phone_norm)) THEN
      UPDATE public.lead_staging SET dedup_status='rejected', dedup_reason='suppression', processed_at=now() WHERE id=r.id;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    -- 기존 contact 매칭
    v_contact_id := NULL;
    SELECT c.id INTO v_contact_id FROM public.lead_contacts c
      WHERE (r.email_norm IS NOT NULL AND c.email_norm=r.email_norm)
         OR (r.phone_norm IS NOT NULL AND c.phone_norm=r.phone_norm)
      LIMIT 1;
    IF v_contact_id IS NOT NULL THEN
      UPDATE public.lead_staging SET dedup_status='duplicate', dedup_reason='이미 리드에 존재',
        promoted_contact_id=v_contact_id, processed_at=now() WHERE id=r.id;
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    -- org find/create (name+region 정규화 매칭)
    v_org_id := NULL;
    IF nullif(btrim(r.org_name),'') IS NOT NULL THEN
      SELECT o.id INTO v_org_id FROM public.lead_organizations o
        WHERE lower(o.name)=lower(btrim(r.org_name))
          AND coalesce(o.region,'')=coalesce(nullif(btrim(r.region),''),'')
        LIMIT 1;
      IF v_org_id IS NULL THEN
        INSERT INTO public.lead_organizations(name, category, region, homepage, address, source, source_ref)
        VALUES (btrim(r.org_name),
                CASE WHEN r.category IN ('학교','기업','동호회','매장','댄스','기타') THEN r.category ELSE NULL END,
                nullif(btrim(r.region),''), nullif(btrim(r.homepage),''), r.address, r.source, r.source_ref)
        RETURNING id INTO v_org_id;
      END IF;
    END IF;

    -- contact create (수집 리드는 cold → consent 'none')
    BEGIN
      INSERT INTO public.lead_contacts
        (organization_id, name, role_title, email, phone, kakao_id, source, status, consent_status)
      VALUES (v_org_id, nullif(btrim(r.contact_name),''), nullif(btrim(r.role_title),''),
              nullif(btrim(r.email),''), nullif(btrim(r.phone),''), nullif(btrim(r.kakao_id),''),
              r.source, 'new', 'none')
      RETURNING id INTO v_contact_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT c.id INTO v_contact_id FROM public.lead_contacts c WHERE c.email_norm=r.email_norm LIMIT 1;
      UPDATE public.lead_staging SET dedup_status='duplicate', dedup_reason='이메일 중복',
        promoted_contact_id=v_contact_id, processed_at=now() WHERE id=r.id;
      v_skipped := v_skipped + 1; CONTINUE;
    END;

    UPDATE public.lead_staging SET dedup_status='promoted',
      promoted_org_id=v_org_id, promoted_contact_id=v_contact_id, processed_at=now() WHERE id=r.id;
    v_promoted := v_promoted + 1;
  END LOOP;

  RETURN QUERY SELECT v_promoted, v_skipped;
END $$;
