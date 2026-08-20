// 비회원(게스트) 주문 디자인의 저장 소유자로 쓰는 시스템 계정을 만든다 (멱등).
// saved_designs.user_id 는 NOT NULL 이라 게스트 주문 디자인도 소유 계정이 필요하다.
// 이 계정은 사람이 로그인하지 않으며, 고객 앱에는 어떤 화면에도 노출되지 않는다.
// 사용: node scripts/ensure-guest-design-owner.mjs
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
if (!url || !key) { console.error('Missing SUPABASE url/service key in .env.local'); process.exit(1); }

const EMAIL = 'guest-designs@modoo.co.kr';
const NAME = '비회원 주문 디자인';

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let userId = null;
const created = await admin.auth.admin.createUser({
  email: EMAIL,
  password: randomBytes(24).toString('base64url'), // 사람이 쓰지 않는 계정 — 비밀번호는 보관하지 않는다
  email_confirm: true,
  user_metadata: { name: NAME, system_account: true },
});
if (created.error) {
  if (/already|registered|exist/i.test(created.error.message)) {
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list.data?.users?.find((u) => u.email === EMAIL);
    if (!found) { console.error('exists but not found:', created.error.message); process.exit(1); }
    userId = found.id;
  } else {
    console.error('createUser error:', created.error.message);
    process.exit(1);
  }
} else {
  userId = created.data.user.id;
}

const up = await admin.from('profiles').upsert(
  { id: userId, email: EMAIL, role: 'customer', name: NAME },
  { onConflict: 'id' },
);
if (up.error) { console.error('profiles upsert error:', up.error.message); process.exit(1); }

console.log(JSON.stringify({ ok: true, userId, email: EMAIL }));
