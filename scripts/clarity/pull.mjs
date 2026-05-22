#!/usr/bin/env node
/**
 * Microsoft Clarity Data Export API — 일일 인사이트 수집
 *
 * 엔드포인트: https://www.clarity.ms/export-data/api/v1/project-live-insights
 * 한도: 프로젝트당 매일 10건 호출 (절약 호출 필수)
 * 토큰: .env.local의 CLARITY_API_TOKEN
 *
 * 사용:
 *   node scripts/clarity/pull.mjs              # 최근 1일
 *   node scripts/clarity/pull.mjs --days=3     # 최근 3일 (max 3)
 *   node scripts/clarity/pull.mjs --dim=URL    # URL 차원 분해
 *
 * 출력: JSON (stdout)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// .env.local 로드
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const TOKEN = process.env.CLARITY_API_TOKEN;
const PROJECT_ID = process.env.CLARITY_PROJECT_ID;
if (!TOKEN) {
  console.error('CLARITY_API_TOKEN not configured in .env.local');
  process.exit(1);
}

// CLI 옵션 파싱
const args = process.argv.slice(2);
const opt = (name, def) => {
  const m = args.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split('=')[1] : def;
};
const numOfDays = Math.min(3, Math.max(1, parseInt(opt('days', '1'), 10)));
const dim1 = opt('dim', null);   // optional dimension filter (URL, Country, Device, OS, Browser, Source, Medium, Campaign, Channel, Page Title)
const dim2 = opt('dim2', null);
const dim3 = opt('dim3', null);

const url = new URL('https://www.clarity.ms/export-data/api/v1/project-live-insights');
url.searchParams.set('numOfDays', String(numOfDays));
if (dim1) url.searchParams.set('dimension1', dim1);
if (dim2) url.searchParams.set('dimension2', dim2);
if (dim3) url.searchParams.set('dimension3', dim3);

async function main() {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Clarity API ${res.status}: ${text}`);
    process.exit(2);
  }

  const data = await res.json();
  console.log(JSON.stringify({
    project_id: PROJECT_ID,
    fetched_at: new Date().toISOString(),
    params: { numOfDays, dim1, dim2, dim3 },
    metrics: data,
  }, null, 2));
}

main().catch((err) => {
  console.error('[clarity/pull] failed:', err);
  process.exit(3);
});
