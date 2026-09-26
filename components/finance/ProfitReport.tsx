'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingUp, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';

type Row = {
  order_id: string;
  created_at: string | null;
  net_revenue: number | null;
  total_item_cost: number | null;
  total_cost_adjustments: number | null;
  total_print_cost: number | null;
  total_factory_amount: number | null;
  total_factory_overlap_excluded: number | null;
  customer_delivery_fee: number | null;
  internal_shipping_cost: number | null;
  gross_profit: number | null;
  work_cost_unrecorded_items?: number;
};
type OrderState = { id: string; payment_status: string; order_status: string };
const kstToday = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function ProfitReport() {
  const supabase = useMemo(() => createClient(), []);
  const [from, setFrom] = useState(() => {
    const d = new Date(`${kstToday()}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(kstToday);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rangeStart = new Date(`${from}T00:00:00+09:00`).toISOString();
      const rangeEnd = new Date(`${to}T23:59:59.999+09:00`).toISOString();
      const [profit, orders, items, prints, factories] = await Promise.all([
        supabase.from('order_profit_summary').select('*').gte('created_at', rangeStart).lte('created_at', rangeEnd).order('created_at', { ascending: false }).limit(10000),
        supabase.from('orders').select('id,payment_status,order_status').gte('created_at', rangeStart).lte('created_at', rangeEnd).limit(10000),
        supabase.from('order_items').select('id,order_id').gte('created_at', rangeStart).lte('created_at', rangeEnd).limit(10000),
        supabase.from('order_item_print_costs').select('order_item_id').limit(10000),
        supabase.from('order_item_factory_settlements').select('order_item_id,factory_amount').gt('factory_amount', 0).limit(10000),
      ]);
      if (profit.error) throw profit.error;
      if (orders.error) throw orders.error;
      if (items.error) throw items.error;
      if (prints.error) throw prints.error;
      if (factories.error) throw factories.error;
      const paid = new Set(((orders.data || []) as OrderState[]).filter(o => o.payment_status === 'completed' && o.order_status !== 'cancelled').map(o => o.id));
      const priced = new Set([...(prints.data || []).map((r: {order_item_id: string}) => r.order_item_id), ...(factories.data || []).map((r: {order_item_id: string}) => r.order_item_id)]);
      const unrecorded = new Map<string, number>();
      for (const item of (items.data || []) as {id: string; order_id: string}[]) {
        if (paid.has(item.order_id) && !priced.has(item.id)) unrecorded.set(item.order_id, (unrecorded.get(item.order_id) || 0) + 1);
      }
      setRows(((profit.data || []) as Row[]).filter(row => paid.has(row.order_id)).map(row => ({...row, work_cost_unrecorded_items: unrecorded.get(row.order_id) || 0})));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => ({
        revenue: a.revenue + Number(r.net_revenue || 0),
        item: a.item + Number(r.total_item_cost || 0),
        adjustments: a.adjustments + Number(r.total_cost_adjustments || 0),
        print: a.print + Number(r.total_print_cost || 0),
        factory: a.factory + Number(r.total_factory_amount || 0),
        factoryOverlap: a.factoryOverlap + Number(r.total_factory_overlap_excluded || 0),
        ship: a.ship + Number(r.internal_shipping_cost || 0),
        gp: a.gp + Number(r.gross_profit || 0),
        unrecorded: a.unrecorded + Number(r.work_cost_unrecorded_items || 0),
      }),
      { revenue: 0, item: 0, adjustments: 0, print: 0, factory: 0, factoryOverlap: 0, ship: 0, gp: 0, unrecorded: 0 }
    );
  }, [rows]);

  const monthly = useMemo(() => {
    const map = new Map<string, {orders: number; revenue: number; apparel: number; adjustments: number; print: number; factory: number; shipping: number; profit: number; unrecorded: number}>();
    for (const row of rows) {
      const month = row.created_at ? new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit'}).format(new Date(row.created_at)) : '';
      if (!month) continue;
      const value = map.get(month) || {orders: 0, revenue: 0, apparel: 0, adjustments: 0, print: 0, factory: 0, shipping: 0, profit: 0, unrecorded: 0};
      value.orders++;
      value.revenue += Number(row.net_revenue || 0);
      value.apparel += Number(row.total_item_cost || 0);
      value.adjustments += Number(row.total_cost_adjustments || 0);
      value.print += Number(row.total_print_cost || 0);
      value.factory += Number(row.total_factory_amount || 0);
      value.shipping += Number(row.internal_shipping_cost || 0);
      value.profit += Number(row.gross_profit || 0);
      value.unrecorded += Number(row.work_cost_unrecorded_items || 0);
      map.set(month, value);
    }
    return [...map].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const csv = () => {
    const head = ['order_id', 'created_at', 'net_revenue', 'item_cost', 'cost_adjustments', 'print_cost', 'additional_factory_amount', 'factory_overlap_excluded', 'internal_shipping', 'gross_profit', 'provisional_margin_percent', 'work_cost_unrecorded_items'].join(',');
    const body = rows.map((r) => [r.order_id, r.created_at, r.net_revenue, r.total_item_cost, r.total_cost_adjustments, r.total_print_cost, r.total_factory_amount, r.total_factory_overlap_excluded, r.internal_shipping_cost, r.gross_profit, Number(r.net_revenue || 0) > 0 ? (100 * Number(r.gross_profit || 0) / Number(r.net_revenue)).toFixed(1) : '', r.work_cost_unrecorded_items].join(',')).join('\n');
    const blob = new Blob([head + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-6 h-6 text-amber-700" />
        <h1 className="text-xl font-bold">손익 리포트</h1>
      </div>

      <div className="bg-white border rounded p-3 mb-3 flex items-center gap-2 flex-wrap">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1" />
        <span>~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1" />
        <button onClick={load} className="bg-amber-600 text-white rounded px-3 py-1 hover:bg-amber-700">조회</button>
        <button onClick={csv} className="bg-gray-700 text-white rounded px-3 py-1 hover:bg-gray-800 ml-auto"><Download className="w-3 h-3 inline" /> CSV</button>
      </div>

      <p className="mb-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded p-3">결제 완료·미취소 주문만 집계합니다. 의류는 누락분에 현재 공급가 추정이 포함되어 있고, 인쇄·공장 작업·배송비 누락 및 부가세 기준 차이로 아래 손익률은 잠정치입니다. 과거 수기 작업은 중복 방지를 위해 별도 표시합니다.</p>
      <div className="grid grid-cols-2 md:grid-cols-8 gap-2 mb-3 bg-amber-50 border border-amber-200 rounded p-3">
        <Stat label="순매출" v={totals.revenue} />
        <Stat label="제품원가" v={-totals.item} />
        <Stat label="원가 가감" v={-totals.adjustments} />
        <Stat label="인쇄비" v={-totals.print} />
        <Stat label="추가 공장비" v={-totals.factory} />
        <Stat label="내부배송" v={-totals.ship} />
        <Stat label="GP" v={totals.gp} highlight />
        <div><div className="text-[11px] text-gray-500">잠정 마진율</div><div className="font-semibold text-amber-700 text-lg">{totals.revenue > 0 ? (100 * totals.gp / totals.revenue).toFixed(1) : '-'}%</div></div>
      </div>
      {totals.factoryOverlap > 0 && <p className="mb-3 text-xs text-amber-800">인쇄비와 겹치는 공장 작업비 원본 {totals.factoryOverlap.toLocaleString('ko-KR')}원은 GP에서 중복 제외했습니다.</p>}
      <p className="mb-3 text-sm text-amber-900">선택 기간에 인쇄비·공장 작업비가 모두 미기록된 품목: {totals.unrecorded.toLocaleString('ko-KR')}개. 무인쇄 판매도 포함될 수 있어 누락 확정 건수는 아닙니다.</p>

      <div className="mb-4 overflow-x-auto rounded border bg-white"><h2 className="p-3 font-semibold">월별 매출·비용·잠정 손익</h2><table className="w-full text-sm"><thead className="bg-gray-50"><tr>{['월','주문','매출','의류','원가 가감','인쇄','추가 공장비','배송','비용 합계','잠정 GP','잠정 마진율','작업비 미기록 품목'].map(h => <th className="p-2 text-right whitespace-nowrap" key={h}>{h}</th>)}</tr></thead><tbody>{monthly.map(([month, value]) => <tr className="border-t" key={month}><td className="p-2 whitespace-nowrap">{month}</td><td className="p-2 text-right">{value.orders}</td>{[value.revenue,value.apparel,value.adjustments,value.print,value.factory,value.shipping,value.apparel+value.adjustments+value.print+value.factory+value.shipping,value.profit].map((n, i) => <td className="p-2 text-right whitespace-nowrap" key={i}>{n.toLocaleString('ko-KR')}</td>)}<td className="p-2 text-right">{value.revenue > 0 ? (100 * value.profit / value.revenue).toFixed(1) : '-'}%</td><td className="p-2 text-right">{value.unrecorded}</td></tr>)}</tbody></table></div>

      {error && <div className="text-red-600 mb-2">{error}</div>}
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
        <table className="w-full text-sm bg-white border">
          <thead className="text-xs bg-gray-50">
            <tr><th>주문</th><th>일시</th><th className="text-right">순매출</th><th className="text-right">제품원가</th><th className="text-right">원가 가감</th><th className="text-right">인쇄비</th><th className="text-right">추가 공장비</th><th className="text-right">중복 제외</th><th className="text-right">내부배송</th><th className="text-right">GP</th><th className="text-right">잠정 마진율</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.order_id} className="border-t">
                <td className="font-mono text-xs">{r.order_id}</td>
                <td className="text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR', {timeZone: 'Asia/Seoul'}) : '-'}</td>
                <td className="text-right">{Number(r.net_revenue || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.total_item_cost || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.total_cost_adjustments || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.total_print_cost || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.total_factory_amount || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right text-amber-700">{Number(r.total_factory_overlap_excluded || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.internal_shipping_cost || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right font-semibold">{Number(r.gross_profit || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.net_revenue || 0) > 0 ? (100 * Number(r.gross_profit || 0) / Number(r.net_revenue)).toFixed(1) : '-'}%</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="text-gray-500 py-2 text-center">없음</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, v, highlight }: { label: string; v: number; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`font-semibold ${highlight ? 'text-amber-700 text-lg' : 'text-gray-900'}`}>{v.toLocaleString('ko-KR')}원</div>
    </div>
  );
}
