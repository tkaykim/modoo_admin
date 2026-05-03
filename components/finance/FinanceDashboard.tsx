'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Wallet, Package, Printer, Truck, TrendingUp, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';

type Summary = {
  order_id: string;
  net_revenue: number | null;
  total_item_cost: number | null;
  total_print_cost: number | null;
  total_factory_amount: number | null;
  internal_shipping_cost: number | null;
  gross_profit: number | null;
  created_at: string | null;
};

export default function FinanceDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('order_profit_summary')
          .select('order_id, net_revenue, total_item_cost, total_print_cost, total_factory_amount, internal_shipping_cost, gross_profit, created_at')
          .order('created_at', { ascending: false })
          .limit(30);
        if (error) throw error;
        setRows((data || []) as Summary[]);
      } catch (e: any) {
        setError(e?.message || '로드 실패');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + Number(r.net_revenue || 0),
        item: acc.item + Number(r.total_item_cost || 0),
        print: acc.print + Number(r.total_print_cost || 0),
        factory: acc.factory + Number(r.total_factory_amount || 0),
        ship: acc.ship + Number(r.internal_shipping_cost || 0),
        gp: acc.gp + Number(r.gross_profit || 0),
      }),
      { revenue: 0, item: 0, print: 0, factory: 0, ship: 0, gp: 0 }
    );
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <Wallet className="w-6 h-6 text-amber-700" />
        <h1 className="text-xl font-bold">재무 대시보드</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <NavTile href="/finance/costs" icon={Package} label="제품 원가표" />
        <NavTile href="/finance/print-costs" icon={Printer} label="인쇄비 시세표" />
        <NavTile href="/finance/shipping" icon={Truck} label="내부 배송비" />
        <NavTile href="/finance/profit" icon={TrendingUp} label="손익 리포트" />
      </div>

      {loading && <div className="flex items-center gap-2 text-gray-600"><Loader2 className="w-4 h-4 animate-spin" /> 로딩...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && (
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm text-gray-500 mb-2">최근 30건 합계</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Stat label="순매출" v={totals.revenue} />
            <Stat label="제품원가" v={-totals.item} />
            <Stat label="인쇄비" v={-totals.print} />
            <Stat label="공장비" v={-totals.factory} />
            <Stat label="내부배송" v={-totals.ship} />
            <Stat label="GP" v={totals.gp} highlight />
          </div>
        </div>
      )}
    </div>
  );
}

function NavTile({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 p-3 bg-white border rounded-md hover:bg-amber-50">
      <Icon className="w-5 h-5 text-amber-700" />
      <span className="font-medium text-gray-800">{label}</span>
    </Link>
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
