'use client';

import useSWR from 'swr';

interface MetricsResponse {
  commission_rate: number;
  monthly: Array<{ period: string; revenue: number; commission: number }>;
  teams: Array<{ id: string; name: string | null }>;
  partner_malls: Array<{ id: string; slug: string | null; status: string | null }>;
  active_team_count: number;
  active_partner_mall_count: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('failed');
  return res.json();
};

export default function SalesmanMetricsPanel({ salesmanId }: { salesmanId: string }) {
  const { data, isLoading } = useSWR<MetricsResponse>(
    `/api/admin/salesmen/${salesmanId}/metrics?months=12`,
    fetcher
  );

  if (isLoading || !data) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">실적</h3>
        <div className="text-xs text-gray-500">불러오는 중...</div>
      </section>
    );
  }

  const max = Math.max(1, ...data.monthly.map((m) => m.revenue));
  const totalRevenue = data.monthly.reduce((s, m) => s + m.revenue, 0);
  const totalCommission = data.monthly.reduce((s, m) => s + m.commission, 0);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">실적 (최근 12개월)</h3>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="누적 매출" value={`${totalRevenue.toLocaleString('ko-KR')}원`} />
        <Stat
          label="누적 수수료"
          value={`${totalCommission.toLocaleString('ko-KR')}원`}
          accent
        />
        <Stat label="활성 팀" value={`${data.active_team_count}`} />
        <Stat label="활성 파트너몰" value={`${data.active_partner_mall_count}`} />
      </div>

      <div className="bg-white border border-gray-200 rounded-md p-3">
        <div className="text-[11px] text-gray-500 mb-2">월별 매출 / 수수료</div>
        <div className="space-y-1">
          {data.monthly.map((m) => (
            <div key={m.period} className="flex items-center gap-2 text-[11px]">
              <span className="w-16 font-mono text-gray-500">{m.period}</span>
              <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden relative">
                <div
                  className="h-full bg-orange-300"
                  style={{ width: `${(m.revenue / max) * 100}%` }}
                />
              </div>
              <span className="w-24 text-right text-gray-700">
                {m.revenue.toLocaleString('ko-KR')}
              </span>
              <span className="w-20 text-right text-orange-700">
                {m.commission.toLocaleString('ko-KR')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {data.teams.length > 0 && (
        <details className="border border-gray-200 rounded-md">
          <summary className="px-3 py-2 text-xs font-medium cursor-pointer">
            소속 팀 ({data.teams.length})
          </summary>
          <ul className="px-3 pb-3 space-y-1 text-xs text-gray-700">
            {data.teams.map((t) => (
              <li key={t.id}>• {t.name ?? t.id}</li>
            ))}
          </ul>
        </details>
      )}
      {data.partner_malls.length > 0 && (
        <details className="border border-gray-200 rounded-md">
          <summary className="px-3 py-2 text-xs font-medium cursor-pointer">
            연결된 파트너몰 ({data.partner_malls.length})
          </summary>
          <ul className="px-3 pb-3 space-y-1 text-xs text-gray-700">
            {data.partner_malls.map((m) => (
              <li key={m.id}>
                • {m.slug ?? m.id}{' '}
                <span className="text-[11px] text-gray-500">({m.status ?? 'unknown'})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-sm font-semibold ${accent ? 'text-orange-700' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}
