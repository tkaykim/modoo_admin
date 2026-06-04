// automation-ping.ts — orchestrator(AI-office) 자동화 통합 등록부에 실행 핑.
//
// 이 앱의 cron이 돌면 orchestrator 허브 automations 테이블에 self-ping을 보낸다.
// → ai-office "/automations.html" 에서 "도는 것 = 등록부에 있는 것"으로 라이브 표시됨.
// anon 키(공개 가능 publishable)로 RPC 호출. best-effort — 핑 실패가 본 작업을 막지 않는다.
const HUB_URL = 'https://fcwwdsyomtfcmjpgcezv.supabase.co';
const HUB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjd3dkc3lvbXRmY21qcGdjZXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNzI2NDksImV4cCI6MjA5Mzk0ODY0OX0.5aIGdEbV8Jzg6oHrmyVUguDOGS27zEV1SMi0_oy0Wf4';

export async function automationPing(p: {
  key: string;
  bu?: string;
  title?: string;
  triggerDesc?: string;
  source?: string;
  result?: 'ok' | 'error';
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(`${HUB_URL}/rest/v1/rpc/automation_ping`, {
      method: 'POST',
      headers: { apikey: HUB_ANON, Authorization: `Bearer ${HUB_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_key: p.key,
        p_bu: p.bu ?? 'modoo',
        p_title: p.title ?? p.key,
        p_kind: 'app-cron',
        p_runtime: 'vercel',
        p_trigger_desc: p.triggerDesc ?? null,
        p_source: p.source ?? null,
        p_result: p.result ?? 'ok',
        p_detail: p.detail ?? {},
      }),
    });
  } catch {
    /* best-effort: 핑 실패는 무시 (본 작업에 영향 없음) */
  }
}
