// modoo_app GTM 이벤트 카탈로그 (modoo_app/lib/gtm-events.ts에서 추출).
// 새 이벤트가 modoo_app에 추가되면 여기에도 동기화한다.

export const MODOO_APP_EVENTS = [
  'spa_page_view',
  'set_user_properties',
  'view_item',
  'view_item_list',
  'select_item',
  'add_to_wishlist',
  'design_start',
  'editor_open',
  'design_action',
  'design_resume',
  'design_discard',
  'design_complete',
  'option_quantity_change',
  'checkout_intent',
  'add_to_cart',
  'view_cart',
  'begin_checkout',
  'purchase',
  'generate_lead',
  'generate_lead_fail',
  'cobuy_step_view',
  'cobuy_step_complete',
  'cobuy_design_choice',
  'search',
  'content_view',
  'click_to_call',
  'kakao_chat_click',
  'chatbot_open',
] as const;

export type ModooAppEvent = (typeof MODOO_APP_EVENTS)[number];

export const FUNNEL_STEPS: { name: string; event: ModooAppEvent }[] = [
  { name: '상품조회', event: 'view_item' },
  { name: '에디터진입', event: 'editor_open' },
  { name: '디자인완료', event: 'design_complete' },
  { name: '장바구니', event: 'add_to_cart' },
  { name: '결제시작', event: 'begin_checkout' },
  { name: '구매완료', event: 'purchase' },
];
