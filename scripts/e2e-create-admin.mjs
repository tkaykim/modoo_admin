// E2E 전용 관리자 계정 생성 (멱등). 로컬 .env.local 의 service role 키 사용.
// 사용: node scripts/e2e-create-admin.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv(new URL('../.env.local', import.meta.url));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE url/service key in .env.local');
  process.exit(1);
}

const EMAIL = 'e2e-admin@modoogoods.com';
const PASSWORD = 'E2eAdmin!modoo2026';

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// 1) auth 유저 (이미 있으면 찾아서 비번 리셋)
let userId = null;
const created = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { name: 'E2E 테스트관리자' },
});
if (created.error) {
  if (/already|registered|exist/i.test(created.error.message)) {
    // 기존 유저 조회 후 비번 동기화
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list.data?.users?.find((u) => u.email === EMAIL);
    if (!found) { console.error('exists but not found:', created.error.message); process.exit(1); }
    userId = found.id;
    await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
  } else {
    console.error('createUser error:', created.error.message);
    process.exit(1);
  }
} else {
  userId = created.data.user.id;
}

// 2) profiles 행 (role=admin)
const up = await admin.from('profiles').upsert(
  { id: userId, email: EMAIL, role: 'admin', name: 'E2E 테스트관리자' },
  { onConflict: 'id' },
);
if (up.error) { console.error('profiles upsert error:', up.error.message); process.exit(1); }

console.log(JSON.stringify({ ok: true, userId, email: EMAIL }));
