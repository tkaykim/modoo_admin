-- Consolidate the durable manual with the administrator's repeated lead-time
-- corrections and the current pricing pipeline.

update public.cs_manuals
set
  answer_guide = E'• 티셔츠류: 디자인 확정 후 영업일 기준 5~7일.\n• 접수부터 수령까지 디자인 확정 기간을 포함해 최소 약 7~10일을 잡는다.\n• 희망일까지 7일 미만이면 일정 가능을 약속하지 않고, 가능한 가장 빠른 일정으로 담당자 확인 안내.\n• 희망일까지 7~9일이면 빠듯하므로 당일 디자인·수량 확정이 필요하다고 안내.\n• 희망일까지 10일 이상일 때만 일정 가능 안내.\n• 야구잠바·롱패딩 등은 디자인 확정 후 약 3주 소요.',
  action_sop = E'1) 제품군과 필요 일정 확인.\n2) 오늘부터 희망일까지 남은 일수를 계산.\n3) 7일 미만은 가능 약속 금지 + needs_human=true.\n4) 7~9일은 빠듯 안내, 10일 이상만 가능 안내.\n5) 기간은 디자인 확정일 기준임을 명시.',
  policy = jsonb_build_object(
    '기준', '디자인 확정 후',
    '티셔츠_영업일', '5~7',
    '접수부터_수령_최소일', '7~10',
    '가능_안내_최소잔여일', 10,
    '7일미만', '가능 약속 금지, 가능한 가장 빠른 일정으로 담당자 확인',
    '7~9일', '빠듯, 당일 디자인·수량 확정 필요',
    '야구잠바_롱패딩', '약 3주'
  ),
  source = 'admin_feedback_consolidation',
  version = version + 1,
  updated_at = now()
where intent = 'leadtime' and status = 'approved';

update public.cs_manuals
set
  answer_guide = E'• 문의 감사 후 의류 종류·수량·선택 인쇄방식·인쇄 위치·디자인 수·필요 일정을 확인.\n• 실DB customer_print_method_pricing과 products.base_price가 주입된 경우에만 제품 단가 + 위치별 인쇄비의 예상 장당가·총액을 안내.\n• 고객이 선택한 인쇄방식을 우선 견적하고 다른 방식은 대안으로만 제안.\n• 앞·뒤·소매 등 모든 인쇄 위치와 나염 색상 수를 합산.\n• 정확한 금액은 제품과 최종 인쇄 면적 확인 후 담당자가 확정한다고 안내.\n• 납기 판단은 leadtime 매뉴얼을 따른다.',
  action_sop = E'1) 연락수단과 견적 변수를 확인.\n2) 실DB 단가로 선택 인쇄방식 기준 예상 견적 계산.\n3) 인쇄 위치와 나염 색상 수 누락 여부 검증.\n4) leadtime 정책으로 희망 일정 검증.\n5) 게시판 답변과 이메일 발송은 관리자 승인 후에만 실행.',
  policy = policy || jsonb_build_object(
    '단가표시', '실DB 값으로 예상 안내, 최종 금액은 담당자 확정',
    '인쇄위치', '모든 위치를 각각 합산',
    '나염색상', '도수별 판값 합산',
    '납기정책', 'leadtime 매뉴얼 우선'
  ),
  source = 'admin_feedback_consolidation',
  version = version + 1,
  updated_at = now()
where intent = 'quote' and status = 'approved';

update public.faqs
set
  answer = replace(answer, '영업일 기준 4~7일', '영업일 기준 5~7일'),
  updated_at = now()
where id = '8247288d-590b-428d-ae0e-1412edb27726';
