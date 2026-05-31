'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface LeadOrg {
  category: string | null;
  region: string | null;
  partner_mall_id: string | null;
}
interface LeadContact {
  source: string;
  status: string;
  consent_status: string;
  first_seen_at: string | null;
  organization: LeadOrg | null;
}

const SOURCE_LABELS: Record<string, string> = {
  self_inquiry: '자사문의', self_chatbot: '챗봇상담', manual: '수기입력',
  neis_school: '학교알리미', localdata: '인허가(LocalData)', csv: 'CSV', web: '웹수집', referral: '소개',
};
const STATUS_LABELS: Record<string, string> = {
  new: '신규', valid: '유효', contacted: '연락함', responded: '응답', converted: '전환',
  opted_out: '수신거부', bounced: '반송', invalid: '무효',
};
const CONSENT_LABELS: Record<string, string> = { none: '동의없음', opt_in: '수신동의', existing_customer: '기존관계' };
const FUNNEL = ['new', 'valid', 'contacted', 'responded', 'converted'] as const;

function tally<T>(arr: T[], key: (x: T) => string | null | undefined): [string, number][] {
  const m = new Map<string, number>();
  for (const x of arr) {
    const k = key(x) || '(미상)';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function LeadsAnalyticsSection() {
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/admin/leads');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '불러오기 실패');
      setContacts(json.contacts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = contacts.length;
    const orgs = new Set(contacts.map((c) => c.organization).filter(Boolean));
    const converted = contacts.filter((c) => c.organization?.partner_mall_id).length;
    const withEmail = contacts.filter((c) => (c as unknown as { email?: string }).email).length;
    const bySource = tally(contacts, (c) => SOURCE_LABELS[c.source] || c.source);
    const byCategory = tally(contacts, (c) => c.organization?.category ?? '미분류');
    const byConsent = tally(contacts, (c) => CONSENT_LABELS[c.consent_status] || c.consent_status);
    const byRegion = tally(contacts.filter((c) => c.organization?.region), (c) => c.organization!.region);
    const statusCounts = new Map<string, number>();
    for (const c of contacts) statusCounts.set(c.status, (statusCounts.get(c.status) || 0) + 1);
    // 최근 14일 수집 추이
    const dayMap = new Map<string, number>();
    for (const c of contacts) {
      if (!c.first_seen_at) continue;
      const d = c.first_seen_at.slice(0, 10);
      dayMap.set(d, (dayMap.get(d) || 0) + 1);
    }
    const trend = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
    return {
      total, orgCount: contacts.reduce((s, c) => s + (c.organization ? 1 : 0), 0),
      converted, convRate: total ? Math.round((converted / total) * 1000) / 10 : 0,
      bySource, byCategory, byConsent, byRegion, statusCounts, trend,
      uniqueOrgIds: orgs.size,
    };
  }, [contacts]);

  if (loading) return <div className="text-gray-500 py-8">불러오는 중...</div>;
  if (error) return (
    <div className="py-8"><p className="text-red-600 mb-2">⚠ {error}</p>
      <button onClick={load} className="px-3 py-1.5 text-sm bg-gray-100 rounded-md hover:bg-gray-200">다시 시도</button></div>
  );

  const funnelMax = Math.max(1, ...FUNNEL.map((s) => stats.statusCounts.get(s) || 0));

  return (
    <div className="space-y-6">
      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric label="전체 리드" value={stats.total} />
        <Metric label="단체(연결)" value={stats.uniqueOrgIds} />
        <Metric label="전환(파트너몰)" value={stats.converted} accent="text-green-700" />
        <Metric label="전환율" value={`${stats.convRate}%`} accent="text-blue-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 상태 퍼널 */}
        <Panel title="상태 퍼널">
          <div className="space-y-2">
            {FUNNEL.map((s) => {
              const n = stats.statusCounts.get(s) || 0;
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className="w-16 text-xs text-gray-500 shrink-0">{STATUS_LABELS[s]}</span>
                  <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded" style={{ width: `${(n / funnelMax) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-sm font-medium">{n}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-2">제외: 수신거부 {stats.statusCounts.get('opted_out') || 0} · 반송 {stats.statusCounts.get('bounced') || 0} · 무효 {stats.statusCounts.get('invalid') || 0}</p>
        </Panel>

        {/* 소스별 */}
        <Panel title="소스별 리드"><BarList rows={stats.bySource} color="bg-indigo-500" /></Panel>

        {/* 카테고리별 */}
        <Panel title="카테고리별"><BarList rows={stats.byCategory} color="bg-amber-500" /></Panel>

        {/* 동의 상태 */}
        <Panel title="동의 상태 (발송 가능성)"><BarList rows={stats.byConsent} color="bg-emerald-500" /></Panel>

        {/* 지역 */}
        <Panel title="지역 Top">
          {stats.byRegion.length ? <BarList rows={stats.byRegion.slice(0, 8)} color="bg-rose-500" />
            : <p className="text-sm text-gray-400">지역 데이터 없음</p>}
        </Panel>

        {/* 수집 추이 */}
        <Panel title="최근 수집 추이 (일자별)">
          {stats.trend.length ? (
            <div className="flex items-end gap-1 h-28">
              {stats.trend.map(([d, n]) => {
                const max = Math.max(...stats.trend.map((t) => t[1]));
                return (
                  <div key={d} className="flex-1 flex flex-col items-center justify-end" title={`${d}: ${n}`}>
                    <div className="w-full bg-blue-400 rounded-t" style={{ height: `${(n / max) * 100}%` }} />
                    <span className="text-[9px] text-gray-400 mt-0.5 rotate-0">{d.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-400">데이터 없음</p>}
        </Panel>
      </div>

      <p className="text-[11px] text-gray-400">
        ※ 발송→오픈→클릭→주문 전환 추적은 아웃리치(발송) 시작 후 lead_outreach.utm_campaign ↔ orders.utm_campaign 조인으로 집계됩니다.
      </p>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${accent || 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function BarList({ rows, color }: { rows: [string, number][]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="text-sm text-gray-400">데이터 없음</p>;
  return (
    <div className="space-y-1.5">
      {rows.map(([label, n]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-28 text-xs text-gray-600 truncate shrink-0" title={label}>{label}</span>
          <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
            <div className={`h-full ${color} rounded`} style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="w-10 text-right text-sm font-medium">{n}</span>
        </div>
      ))}
    </div>
  );
}
