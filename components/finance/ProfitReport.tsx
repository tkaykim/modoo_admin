'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, TrendingUp, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';

type Row = {
  order_id: string;
  created_at: string | null;
  net_revenue: number | null;
  total_item_cost: number | null;
  total_print_cost: number | null;
  total_factory_amount: number | null;
  customer_delivery_fee: number | null;
  internal_shipping_cost: number | null;
  gross_profit: number | null;
};

export default function ProfitReport() {
  const supabase = useMemo(() => createClient(), []);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('order_profit_summary')
        .select('*')
        .gte('created_at', new Date(from).toISOString())
        .lte('created_at', new Date(to + 'T23:59:59').toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data || []) as Row[]);
    } catch (e: any) {
      setError(e?.message || '로드 실패');
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
        print: a.print + Number(r.total_print_cost || 0),
        factory: a.factory + Number(r.total_factory_amount || 0),
        ship: a.ship + Number(r.internal_shipping_cost || 0),
        gp: a.gp + Number(r.gross_profit || 0),
      }),
      { revenue: 0, item: 0, print: 0, factory: 0, ship: 0, gp: 0 }
    );
  }, [rows]);

  const csv = () => {
    const head = ['order_id', 'created_at', 'net_revenue', 'item_cost', 'print_cost', 'factory_amount', 'internal_shipping', 'gross_profit'].join(',');
    const body = rows.map((r) => [r.order_id, r.created_at, r.net_revenue, r.total_item_cost, r.total_print_cost, r.total_factory_amount, r.internal_shipping_cost, r.gross_profit].join(',')).join('\n');
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

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3 bg-amber-50 border border-amber-200 rounded p-3">
        <Stat label="순매출" v={totals.revenue} />
        <Stat label="제품원가" v={-totals.item} />
        <Stat label="인쇄비" v={-totals.print} />
        <Stat label="공장비" v={-totals.factory} />
        <Stat label="내부배송" v={-totals.ship} />
        <Stat label="GP" v={totals.gp} highlight />
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
        <table className="w-full text-sm bg-white border">
          <thead className="text-xs bg-gray-50">
            <tr><th>주문</th><th>일시</th><th className="text-right">순매출</th><th className="text-right">제품원가</th><th className="text-right">인쇄비</th><th className="text-right">공장비</th><th className="text-right">내부배송</th><th className="text-right">GP</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.order_id} className="border-t">
                <td className="font-mono text-xs">{r.order_id}</td>
                <td className="text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-'}</td>
                <td className="text-right">{Number(r.net_revenue || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.total_item_cost || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.total_print_cost || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.total_factory_amount || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right">{Number(r.internal_shipping_cost || 0).toLocaleString('ko-KR')}</td>
                <td className="text-right font-semibold">{Number(r.gross_profit || 0).toLocaleString('ko-KR')}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="text-gray-500 py-2 text-center">없음</td></tr>}
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
