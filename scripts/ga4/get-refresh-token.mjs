// 사용법:
//   1) GCP Console → Credentials → CREATE OAuth client ID → Desktop app → 발급
//   2) 환경변수 또는 인자로 넘겨서 실행:
//        GA4_OAUTH_CLIENT_ID=xxx GA4_OAUTH_CLIENT_SECRET=yyy \
//        node scripts/ga4/get-refresh-token.mjs
//   3) 브라우저가 열리면 GA4 권한 있는 Google 계정으로 로그인+동의
//   4) 콘솔에 refresh_token 출력됨 → .env.local 및 Vercel에 저장
import http from 'node:http';
import { exec } from 'node:child_process';
import { URL } from 'node:url';

const CLIENT_ID = process.env.GA4_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GA4_OAUTH_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('GA4_OAUTH_CLIENT_ID / GA4_OAUTH_CLIENT_SECRET 환경변수가 필요합니다.');
  process.exit(1);
}

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/cb`;
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
}).toString();

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/cb')) { res.writeHead(404).end(); return; }
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) { res.writeHead(400).end('no code'); return; }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT, grant_type: 'authorization_code',
      }),
    });
    const data = await tokenRes.json();
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('OK. 콘솔(터미널)을 확인하세요. 창 닫아도 됩니다.');
    console.log('\n=== TOKENS ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n=== .env.local / Vercel 에 넣을 값 ===');
    console.log(`GA4_OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GA4_OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GA4_OAUTH_REFRESH_TOKEN=${data.refresh_token ?? '(없음 — prompt=consent 필요)'}`);
    server.close();
  } catch (e) {
    res.writeHead(500).end(String(e));
    server.close();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('브라우저를 여는 중... 안 열리면 아래 URL을 직접 열어주세요:\n', authUrl);
  const cmd = process.platform === 'win32' ? `start "" "${authUrl}"` :
              process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
  exec(cmd);
});
