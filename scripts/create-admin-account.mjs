// 모두관리 운영자 계정 생성/갱신 (멱등). 로컬 .env.local 의 service role 키 사용.
// 사용: node scripts/create-admin-account.mjs --email a@b.c --password '...' --name '이름' --role marketing_analyst
// role: admin | factory | super_admin | marketing_manager | marketing_analyst
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
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const EMAIL = arg('email');
const PASSWORD = arg('password');
const NAME = arg('name', '운영자');
const ROLE = arg('role', 'marketing_analyst');
const ALLOWED = new Set(['admin', 'factory', 'super_admin', 'marketing_manager', 'marketing_analyst']);
if (!EMAIL || !PASSWORD) { console.error('--email 과 --password 가 필요합니다.'); process.exit(1); }
if (!ALLOWED.has(ROLE)) { console.error(`허용되지 않은 role: ${ROLE}`); process.exit(1); }

const env = loadEnv(new URL('../.env.local', import.meta.url));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE url/service key in .env.local'); process.exit(1); }

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let userId = null;
const created = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { name: NAME },
});
if (created.error) {
  if (/already|registered|exist/i.test(created.error.message)) {
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list.data?.users?.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());
    if (!found) { console.error('exists but not found:', created.error.message); process.exit(1); }
    userId = found.id;
    const upd = await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true, user_metadata: { name: NAME } });
    if (upd.error) { console.error('updateUser error:', upd.error.message); process.exit(1); }
  } else {
    console.error('createUser error:', created.error.message);
    process.exit(1);
  }
} else {
  userId = created.data.user.id;
}

const up = await admin.from('profiles').upsert(
  { id: userId, email: EMAIL, role: ROLE, name: NAME },
  { onConflict: 'id' },
);
if (up.error) { console.error('profiles upsert error:', up.error.message); process.exit(1); }

console.log(JSON.stringify({ ok: true, userId, email: EMAIL, role: ROLE }));
