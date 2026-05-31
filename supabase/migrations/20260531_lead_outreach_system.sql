-- ============================================================================
-- Lead Outreach System  (단체복 콜드 아웃리치 / CRM 프로스펙팅 레이어)
-- ============================================================================
-- 설계 원칙
--  - 리드(잠재 단체)는 partner_malls(활성 고객 단체)와 "같은 단체의 다른 생애주기".
--  - 두 레이어를 분리: lead_* = 영업 전 CRM / partner_malls = 전환 후 관계.
--  - 연결은 lead_organizations.partner_mall_id 단방향 FK 하나(전환 시 1회 세팅).
--  - 어휘는 modoo_salesman/lib/teams.ts 와 정렬:
--      category  ↔ TeamCategory ('학교'|'기업'|'동호회'|'매장'|'댄스')
--      role_title↔ CONTACT_ROLE_OPTIONS ('결정권자'|'담당자'|'코치'|...)
--      address(jsonb) ↔ TeamAddress {postal, road, detail, raw}
--  - RLS: error_logs 패턴과 동일하게 service-role only (정책 없음 = anon/authenticated 차단).
--  - 발송은 기존 cs_email_queue 재활용 (lead_outreach.email_queue_id).
--  - 전환 추적은 orders.utm_campaign ↔ lead_outreach.utm_campaign 값 매칭(FK 아님).
-- ============================================================================

-- updated_at 자동 갱신용 (lead_ 전용, 이름 충돌 회피)
CREATE OR REPLACE FUNCTION public.lead_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1) lead_organizations : 단체(학교/기업/동호회/매장/댄스/기타)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_organizations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  category             text,                         -- TeamCategory 정렬
  region               text,                         -- 시/도 등 광역 지역
  address              jsonb,                         -- TeamAddress {postal, road, detail, raw}
  size                 integer,                       -- 추정 인원/규모
  homepage             text,
  domain               text,                          -- 정규화 도메인(dedup 보조)
  source               text NOT NULL DEFAULT 'manual',-- self_inquiry/schoolinfo/web/referral/manual
  source_ref           text,                          -- 출처 원본 식별자(학교 표준코드 등)
  tags                 text[] NOT NULL DEFAULT '{}',
  note                 text,
  status               text NOT NULL DEFAULT 'new',   -- new/researching/contacted/responded/converted/disqualified
  partner_mall_id      uuid REFERENCES public.partner_malls(id) ON DELETE SET NULL,   -- 전환 연결(단방향)
  assigned_salesman_id uuid REFERENCES public.salesman_profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_organizations_category_chk
    CHECK (category IS NULL OR category IN ('학교','기업','동호회','매장','댄스','기타')),
  CONSTRAINT lead_organizations_status_chk
    CHECK (status IN ('new','researching','contacted','responded','converted','disqualified'))
);

-- 한 리드 ↔ 하나의 활성 몰 (전환은 1:1)
CREATE UNIQUE INDEX IF NOT EXISTS lead_organizations_partner_mall_uq
  ON public.lead_organizations (partner_mall_id) WHERE partner_mall_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_organizations_status_idx   ON public.lead_organizations (status);
CREATE INDEX IF NOT EXISTS lead_organizations_category_idx ON public.lead_organizations (category);
CREATE INDEX IF NOT EXISTS lead_organizations_source_idx   ON public.lead_organizations (source);
CREATE INDEX IF NOT EXISTS lead_organizations_salesman_idx ON public.lead_organizations (assigned_salesman_id);

CREATE TRIGGER lead_organizations_touch
  BEFORE UPDATE ON public.lead_organizations
  FOR EACH ROW EXECUTE FUNCTION public.lead_touch_updated_at();

COMMENT ON TABLE public.lead_organizations IS
  '잠재 단체(영업 전 CRM 레이어). 전환 시 partner_mall_id로 partner_malls와 연결. service-role only.';

-- ----------------------------------------------------------------------------
-- 2) lead_contacts : 담당자/연락처 (관계형 — 대량수집 + dedup + 발송 최적화)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid REFERENCES public.lead_organizations(id) ON DELETE CASCADE,
  name                     text,
  role_title               text,                          -- CONTACT_ROLE_OPTIONS 정렬
  is_primary               boolean NOT NULL DEFAULT false,
  email                    text,
  email_norm               text GENERATED ALWAYS AS (nullif(lower(btrim(email)), '')) STORED,
  phone                    text,
  phone_norm               text GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), '')) STORED,
  kakao_id                 text,
  source                   text NOT NULL DEFAULT 'manual',
  source_detail            text,
  status                   text NOT NULL DEFAULT 'new',    -- new/valid/contacted/responded/converted/opted_out/bounced/invalid
  consent_status           text NOT NULL DEFAULT 'none',   -- none/opt_in/existing_customer
  consent_source           text,
  consent_at               timestamptz,
  linked_profile_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  linked_inquiry_id        uuid REFERENCES public.inquiries(id) ON DELETE SET NULL,
  linked_chatbot_inquiry_id uuid REFERENCES public.chatbot_inquiries(id) ON DELETE SET NULL,
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_contacted_at        timestamptz,
  note                     text,
  meta                     jsonb NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_contacts_status_chk
    CHECK (status IN ('new','valid','contacted','responded','converted','opted_out','bounced','invalid')),
  CONSTRAINT lead_contacts_consent_chk
    CHECK (consent_status IN ('none','opt_in','existing_customer'))
);

-- 이메일은 사람의 고유 식별자 → 전역 유니크(dedup 핵심). 전화는 단체 공용 가능성 있어 비유니크.
CREATE UNIQUE INDEX IF NOT EXISTS lead_contacts_email_uq
  ON public.lead_contacts (email_norm) WHERE email_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_contacts_phone_idx   ON public.lead_contacts (phone_norm) WHERE phone_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_contacts_org_idx     ON public.lead_contacts (organization_id);
CREATE INDEX IF NOT EXISTS lead_contacts_status_idx  ON public.lead_contacts (status);
CREATE INDEX IF NOT EXISTS lead_contacts_consent_idx ON public.lead_contacts (consent_status);
CREATE INDEX IF NOT EXISTS lead_contacts_inquiry_idx ON public.lead_contacts (linked_inquiry_id);

CREATE TRIGGER lead_contacts_touch
  BEFORE UPDATE ON public.lead_contacts
  FOR EACH ROW EXECUTE FUNCTION public.lead_touch_updated_at();

COMMENT ON TABLE public.lead_contacts IS
  '리드 담당자/연락처. email_norm 전역 유니크로 중복제거. linked_inquiry_id로 자사 문의이력 백필. service-role only.';

-- ----------------------------------------------------------------------------
-- 3) lead_suppression : 발송 영구 제외(opt-out/bounce/신고) — 발송 직전 최우선 조회
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_suppression (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text,
  email_norm  text GENERATED ALWAYS AS (nullif(lower(btrim(email)), '')) STORED,
  phone       text,
  phone_norm  text GENERATED ALWAYS AS (nullif(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), '')) STORED,
  reason      text NOT NULL,                  -- unsubscribe/hard_bounce/complaint/manual/invalid
  source      text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_suppression_reason_chk
    CHECK (reason IN ('unsubscribe','hard_bounce','complaint','manual','invalid')),
  CONSTRAINT lead_suppression_target_chk
    CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_suppression_email_uq
  ON public.lead_suppression (email_norm) WHERE email_norm IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lead_suppression_phone_uq
  ON public.lead_suppression (phone_norm) WHERE phone_norm IS NOT NULL;

COMMENT ON TABLE public.lead_suppression IS
  '발송 영구 제외 목록(수신거부/하드바운스/신고). 모든 발송 직전 email_norm/phone_norm 대조 필수. service-role only.';

-- ----------------------------------------------------------------------------
-- 4) lead_campaigns : 아웃리치 시나리오(할인/무료샘플/상담/재주문) + 템플릿
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_campaigns (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  scenario         text NOT NULL DEFAULT 'consultation',  -- discount/free_sample/consultation/reorder/custom
  channel          text NOT NULL DEFAULT 'email',         -- email/kakao/phone/sms
  subject_template text,
  body_template    text,                                  -- 개인화 변수: {{name}} {{org}} {{role}} ...
  utm_campaign     text,                                  -- orders.utm_campaign 매칭 키
  status           text NOT NULL DEFAULT 'draft',         -- draft/active/paused/done
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_campaigns_channel_chk  CHECK (channel IN ('email','kakao','phone','sms')),
  CONSTRAINT lead_campaigns_status_chk   CHECK (status IN ('draft','active','paused','done'))
);

CREATE INDEX IF NOT EXISTS lead_campaigns_status_idx ON public.lead_campaigns (status);

CREATE TRIGGER lead_campaigns_touch
  BEFORE UPDATE ON public.lead_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.lead_touch_updated_at();

COMMENT ON TABLE public.lead_campaigns IS
  '아웃리치 캠페인/시나리오 + 개인화 템플릿. utm_campaign으로 전환 추적. service-role only.';

-- ----------------------------------------------------------------------------
-- 5) lead_outreach : 개별 발송 로그(누구에게/언제/어떤 캠페인/응답)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_outreach (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id     uuid NOT NULL REFERENCES public.lead_contacts(id) ON DELETE CASCADE,
  campaign_id    uuid REFERENCES public.lead_campaigns(id) ON DELETE SET NULL,
  channel        text NOT NULL DEFAULT 'email',
  status         text NOT NULL DEFAULT 'queued',  -- queued/sent/opened/clicked/replied/bounced/failed/skipped/unsubscribed
  email_queue_id uuid REFERENCES public.cs_email_queue(id) ON DELETE SET NULL,  -- 기존 발송 인프라 재활용
  subject        text,
  body_preview   text,
  utm_campaign   text,                            -- 캠페인 값 복사(전환 추적 안정화)
  scheduled_for  timestamptz,
  sent_at        timestamptz,
  opened_at      timestamptz,
  clicked_at     timestamptz,
  replied_at     timestamptz,
  error          text,
  meta           jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_outreach_status_chk
    CHECK (status IN ('queued','sent','opened','clicked','replied','bounced','failed','skipped','unsubscribed'))
);

CREATE INDEX IF NOT EXISTS lead_outreach_contact_idx   ON public.lead_outreach (contact_id);
CREATE INDEX IF NOT EXISTS lead_outreach_campaign_idx  ON public.lead_outreach (campaign_id);
CREATE INDEX IF NOT EXISTS lead_outreach_status_idx    ON public.lead_outreach (status);
CREATE INDEX IF NOT EXISTS lead_outreach_utm_idx       ON public.lead_outreach (utm_campaign);
CREATE INDEX IF NOT EXISTS lead_outreach_scheduled_idx ON public.lead_outreach (scheduled_for);

CREATE TRIGGER lead_outreach_touch
  BEFORE UPDATE ON public.lead_outreach
  FOR EACH ROW EXECUTE FUNCTION public.lead_touch_updated_at();

COMMENT ON TABLE public.lead_outreach IS
  '개별 발송 로그. cs_email_queue로 발송, utm_campaign ↔ orders.utm_campaign로 전환 분석. service-role only.';

-- ----------------------------------------------------------------------------
-- RLS : 전 테이블 service-role only (error_logs 패턴). 정책 미생성 = anon/authenticated 차단.
--        admin UI 접근은 service-role API 라우트를 통해서만.
-- ----------------------------------------------------------------------------
ALTER TABLE public.lead_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_suppression   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_campaigns     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_outreach      ENABLE ROW LEVEL SECURITY;
