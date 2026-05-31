'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// ── 헤더 별칭 → 필드 매핑 ────────────────────────────────────────────────────
const FIELD_ALIASES: Record<string, string[]> = {
  org_name: ['단체', '단체명', '학교', '학교명', '회사', '회사명', '매장', '조직', 'organization', 'org', 'team'],
  contact_name: ['이름', '담당자', '성명', '담당', 'name', 'contact'],
  role_title: ['직책', '역할', '직급', 'role', 'title'],
  email: ['이메일', '메일', 'email', 'e-mail', 'mail'],
  phone: ['전화', '전화번호', '연락처', '휴대폰', '핸드폰', 'phone', 'tel', 'mobile'],
  kakao_id: ['카카오', '카톡', '카카오id', 'kakao'],
  category: ['카테고리', '분류', '구분', 'category', 'type'],
  region: ['지역', '시도', 'region', 'area'],
  homepage: ['홈페이지', '웹사이트', '사이트', 'url', 'homepage', 'website'],
};
const FIELD_LABELS: Record<string, string> = {
  org_name: '단체', contact_name: '이름', role_title: '직책', email: '이메일',
  phone: '전화', kakao_id: '카카오', category: '카테고리', region: '지역', homepage: '홈페이지',
};
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
function headerToField(header: string): string | null {
  const h = norm(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((a) => norm(a) === h)) return field;
  }
  return null;
}

interface ParsedRow { [key: string]: string }

function parseTable(text: string): { mapping: (string | null)[]; headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { mapping: [], headers: [], rows: [] };
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = (l: string) => l.split(delim).map((c) => c.trim());
  const headers = split(lines[0]);
  const mapping = headers.map(headerToField);
  const rows: ParsedRow[] = lines.slice(1).map((l) => {
    const cells = split(l);
    const obj: ParsedRow = {};
    mapping.forEach((field, i) => {
      if (field && cells[i]) obj[field] = cells[i];
    });
    return obj;
  });
  return { mapping, headers, rows };
}

// ── NEIS 시도교육청 코드 ─────────────────────────────────────────────────────
const NEIS_OFFICES: { code: string; name: string }[] = [
  { code: 'B10', name: '서울' }, { code: 'C10', name: '부산' }, { code: 'D10', name: '대구' },
  { code: 'E10', name: '인천' }, { code: 'F10', name: '광주' }, { code: 'G10', name: '대전' },
  { code: 'H10', name: '울산' }, { code: 'I10', name: '세종' }, { code: 'J10', name: '경기' },
  { code: 'K10', name: '강원' }, { code: 'M10', name: '충북' }, { code: 'N10', name: '충남' },
  { code: 'P10', name: '전북' }, { code: 'Q10', name: '전남' }, { code: 'R10', name: '경북' },
  { code: 'S10', name: '경남' }, { code: 'T10', name: '제주' },
];
const SCHOOL_KINDS = ['초등학교', '중학교', '고등학교'];

const STATUS_LABELS: Record<string, string> = {
  new: '신규', duplicate: '중복', promoted: '승격됨', rejected: '제외', needs_review: '검토필요',
};
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700', duplicate: 'bg-amber-100 text-amber-800',
  promoted: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-700',
  needs_review: 'bg-gray-100 text-gray-600',
};

interface StagingRow {
  id: string; source: string; org_name: string | null; contact_name: string | null;
  email: string | null; phone: string | null; region: string | null;
  dedup_status: string; dedup_reason: string | null; batch_id: string | null;
}

export default function LeadsImportSection({ onPromoted }: { onPromoted?: () => void }) {
  const [raw, setRaw] = useState('');
  const [importing, setImporting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<string | null>(null);

  const [staging, setStaging] = useState<StagingRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState('');
  const [loadingStaging, setLoadingStaging] = useState(false);

  // NEIS
  const [neisOffice, setNeisOffice] = useState('B10');
  const [neisKind, setNeisKind] = useState('고등학교');
  const [neisSize, setNeisSize] = useState(100);
  const [neisLoading, setNeisLoading] = useState(false);

  const parsed = useMemo(() => parseTable(raw), [raw]);
  const mappedFields = useMemo(() => parsed.mapping.filter(Boolean) as string[], [parsed.mapping]);

  const loadStaging = useCallback(async () => {
    setLoadingStaging(true);
    try {
      const url = statusFilter ? `/api/admin/leads/staging?status=${statusFilter}` : '/api/admin/leads/staging';
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok) {
        setStaging(json.rows || []);
        setSummary(json.summary || {});
      }
    } finally {
      setLoadingStaging(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadStaging();
  }, [loadStaging]);

  const doImport = async () => {
    if (parsed.rows.length === 0) {
      setMsg('붙여넣은 데이터가 없거나 헤더 행을 인식하지 못했습니다.');
      return;
    }
    if (mappedFields.length === 0) {
      setMsg('컬럼 매핑에 실패했습니다. 첫 행에 단체/이름/전화/이메일 같은 헤더가 필요합니다.');
      return;
    }
    setImporting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/leads/staging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'csv', rows: parsed.rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '가져오기 실패');
      const s = json.summary || {};
      setLastBatch(json.batch_id);
      setMsg(`✅ ${json.inserted}행 적재 — 신규 ${s.remaining_new ?? 0} · 중복 ${s.marked_duplicate ?? 0} · 제외 ${s.marked_rejected ?? 0}. 아래에서 "승격"하면 리드로 등록됩니다.`);
      setRaw('');
      loadStaging();
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : '가져오기 실패'}`);
    } finally {
      setImporting(false);
    }
  };

  const doPromote = async (batch?: string | null) => {
    setPromoting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/leads/staging/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch ? { batch_id: batch } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '승격 실패');
      const r = json.result || {};
      setMsg(`✅ 승격 완료 — 신규 리드 ${r.promoted ?? 0}명 · 건너뜀(중복/제외) ${r.skipped ?? 0}`);
      loadStaging();
      onPromoted?.();
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : '승격 실패'}`);
    } finally {
      setPromoting(false);
    }
  };

  const discardBatch = async (batch: string) => {
    if (!confirm('이 배치의 미승격 행을 폐기할까요?')) return;
    await fetch(`/api/admin/leads/staging?batch_id=${encodeURIComponent(batch)}`, { method: 'DELETE' });
    loadStaging();
  };

  const doNeis = async () => {
    setNeisLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/leads/import/neis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officeCode: neisOffice, schoolKind: neisKind, pSize: neisSize }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(json.needsKey ? `🔑 ${json.error} ${json.hint || ''}` : `⚠ ${json.error || 'NEIS 실패'}`);
        return;
      }
      setLastBatch(json.batch_id);
      setMsg(`✅ NEIS ${json.fetched}건 조회 — 신규 ${json.inserted} 적재 · 기존 ${json.skipped_existing} 스킵. 아래에서 "승격"하세요.`);
      loadStaging();
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : 'NEIS 실패'}`);
    } finally {
      setNeisLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 상태 메시지 */}
      {msg && <div className="text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-700">{msg}</div>}

      {/* CSV/엑셀 붙여넣기 */}
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-gray-900">① CSV / 엑셀 붙여넣기</h3>
        <p className="text-xs text-gray-500">
          엑셀에서 헤더 포함 범위를 복사해 붙여넣으세요. 첫 행은 헤더(단체·이름·전화·이메일·카테고리·지역·직책·홈페이지 등).
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder={'단체\t이름\t전화\t이메일\t카테고리\n○○고등학교\t김담당\t010-1234-5678\thong@example.com\t학교'}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {parsed.headers.length > 0 && (
          <div className="text-xs text-gray-600">
            <div className="mb-1">
              인식된 컬럼:{' '}
              {parsed.mapping.map((f, i) => (
                <span key={i} className={`inline-block mr-1 px-1.5 py-0.5 rounded ${f ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400 line-through'}`}>
                  {parsed.headers[i]}{f ? ` → ${FIELD_LABELS[f]}` : ' (무시)'}
                </span>
              ))}
            </div>
            <div className="text-gray-500">{parsed.rows.length}행 인식됨</div>
          </div>
        )}
        <button
          onClick={doImport}
          disabled={importing}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {importing ? '적재 중...' : '스테이징에 추가 + 중복판정'}
        </button>
      </section>

      {/* NEIS */}
      <section className="space-y-2 border-t border-gray-100 pt-5">
        <h3 className="text-sm font-bold text-gray-900">② NEIS 학교 공개 API</h3>
        <p className="text-xs text-gray-500">전국 학교 기본정보(명칭·주소·대표전화)를 공식 API로 가져옵니다. NEIS API 키 필요.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={neisOffice} onChange={(e) => setNeisOffice(e.target.value)} className={selectCls}>
            {NEIS_OFFICES.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
          </select>
          <select value={neisKind} onChange={(e) => setNeisKind(e.target.value)} className={selectCls}>
            {SCHOOL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={neisSize} onChange={(e) => setNeisSize(Number(e.target.value))} className={selectCls}>
            {[50, 100, 300, 500, 1000].map((n) => <option key={n} value={n}>{n}건</option>)}
          </select>
          <button
            onClick={doNeis}
            disabled={neisLoading}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {neisLoading ? '가져오는 중...' : 'NEIS 가져오기'}
          </button>
        </div>
      </section>

      {/* 스테이징 목록 + 승격 */}
      <section className="space-y-2 border-t border-gray-100 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold text-gray-900">③ 스테이징 (승격 대기)</h3>
          <div className="flex items-center gap-2">
            {lastBatch && (
              <button
                onClick={() => doPromote(lastBatch)}
                disabled={promoting}
                className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {promoting ? '승격 중...' : '방금 가져온 배치 승격'}
              </button>
            )}
            <button
              onClick={() => doPromote(null)}
              disabled={promoting}
              className="px-3 py-1.5 text-sm font-medium bg-green-700 text-white rounded-md hover:bg-green-800 disabled:opacity-50"
            >
              전체 신규 승격
            </button>
          </div>
        </div>

        {/* 요약 */}
        <div className="flex flex-wrap gap-2 text-xs">
          {(['new', 'duplicate', 'promoted', 'rejected'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={`px-2 py-1 rounded-md border ${statusFilter === s ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200'} ${STATUS_COLORS[s]}`}
            >
              {STATUS_LABELS[s]} {summary[s] ?? 0}
            </button>
          ))}
          <span className="px-2 py-1 text-gray-400">총 {summary.total ?? 0}</span>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left font-medium px-3 py-2">단체 / 이름</th>
                <th className="text-left font-medium px-3 py-2">연락처</th>
                <th className="text-left font-medium px-3 py-2">지역</th>
                <th className="text-left font-medium px-3 py-2">소스</th>
                <th className="text-left font-medium px-3 py-2">판정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingStaging ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">불러오는 중...</td></tr>
              ) : staging.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">스테이징이 비어 있습니다.</td></tr>
              ) : (
                staging.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{r.org_name || r.contact_name || '(미상)'}</div>
                      {r.org_name && r.contact_name && <div className="text-xs text-gray-500">{r.contact_name}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      <div>{r.phone || '—'}</div>
                      {r.email && <div className="text-xs text-gray-400">{r.email}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.region || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.source}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[r.dedup_status] || 'bg-gray-100'}`}>
                        {STATUS_LABELS[r.dedup_status] || r.dedup_status}
                      </span>
                      {r.dedup_reason && <div className="text-[11px] text-gray-400 mt-0.5">{r.dedup_reason}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {lastBatch && (
          <button onClick={() => discardBatch(lastBatch)} className="text-xs text-gray-400 hover:text-red-500">
            방금 가져온 배치 폐기
          </button>
        )}
      </section>
    </div>
  );
}

const selectCls = 'px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500';
