// hub-supabase.ts — orchestrator 허브 DB(마케팅 초안·액션 큐·경쟁사 인텔) 서버 전용 클라이언트
//
// modoo 자체 DB(supabase-admin)와 별개인 orchestrator 허브(Supabase cloud)에 접근한다.
// 마케팅 결정 콘솔(오늘의 결정)이 hub의 modoo_ad_creative_drafts / marketing_actions /
// meta_ad_snapshots 를 읽고 쓴다. 서버 라우트에서만 import할 것 (service role).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function createHubClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.HUB_SUPABASE_URL;
  const key = process.env.HUB_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('HUB_SUPABASE_URL / HUB_SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다');
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
