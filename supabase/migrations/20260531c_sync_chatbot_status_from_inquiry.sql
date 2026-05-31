-- 게시판 문의(inquiries) 상태가 바뀌면 연결된 챗봇 문의(chatbot_inquiries) 상태로 자동 전파.
-- 배경: 챗봇 상담요청은 inquiries(게시판)에 정식 문의를 만들고 chatbot_inquiries.linked_inquiry_id로 연결한다.
--       그동안 게시판에서 응대(ongoing)/완료(completed)해도 챗봇 레코드는 pending 그대로라 챗봇 화면에 "대기중"으로 남았다.
-- 매핑: inquiries.ongoing → chatbot.contacted(연락완료), inquiries.completed → chatbot.completed(완료).
--       chatbot이 이미 cancelled/completed면 보존(다운그레이드 금지). pending 복귀는 전파하지 않음.

CREATE OR REPLACE FUNCTION public.sync_chatbot_status_from_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  target := CASE NEW.status
              WHEN 'completed' THEN 'completed'
              WHEN 'ongoing'   THEN 'contacted'
              ELSE NULL
            END;

  IF target IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE chatbot_inquiries c
     SET status = target,
         updated_at = now()
   WHERE c.linked_inquiry_id = NEW.id
     AND c.status NOT IN ('cancelled', 'completed')  -- 취소/완료는 보존(다운그레이드 방지)
     AND c.status IS DISTINCT FROM target;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_chatbot_status ON public.inquiries;
CREATE TRIGGER trg_sync_chatbot_status
AFTER UPDATE OF status ON public.inquiries
FOR EACH ROW
EXECUTE FUNCTION public.sync_chatbot_status_from_inquiry();

-- 기존에 어긋난 레코드 백필: 이미 응대/완료된 게시판에 연결된 pending 챗봇을 정정.
UPDATE chatbot_inquiries c
   SET status = CASE i.status WHEN 'completed' THEN 'completed' WHEN 'ongoing' THEN 'contacted' ELSE c.status END,
       updated_at = now()
  FROM inquiries i
 WHERE c.linked_inquiry_id = i.id
   AND i.status IN ('ongoing', 'completed')
   AND c.status NOT IN ('cancelled', 'completed');
