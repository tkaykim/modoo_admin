'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Truck } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';

type Leg = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  leg_type: string;
  amount: number;
  carrier: string | null;
  paid_by: string | null;
  note: string | null;
  created_at: string;
};

const LABEL: Record<string, string> = {
  raw_material_in: '원자재 입고',
  to_factory: '공장 배송',
  to_print_shop: '인쇄소 배송',
  inter_factory: '공장간 이동',
  return: '반송',
  other: '기타',
};

export default function ShippingLegsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('order_shipping_legs').select('*').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        setRows((data || []) as Leg[]);
      } catch (e: any) {
        setError(e?.message || '로드 실패');
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-2 mb-4">
        <Truck className="w-6 h-6 text-amber-700" />
        <h1 className="text-xl font-bold">내부 배송비 (전체)</h1>
      </div>
      <div className="text-xs text-gray-500 mb-2">주문 상세 페이지에서 추가/삭제하세요. 여기는 전체 조회만.</div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
        <table className="w-full text-sm bg-white border">
          <thead className="text-xs bg-gray-50">
            <tr><th>주문 ID</th><th>유형</th><th className="text-right">금액</th><th>택배사</th><th>지불자</th><th>메모</th><th>생성</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="font-mono text-xs">{r.order_id}</td>
                <td>{LABEL[r.leg_type] || r.leg_type}</td>
                <td className="text-right">{Number(r.amount).toLocaleString('ko-KR')}</td>
                <td>{r.carrier || '-'}</td>
                <td>{r.paid_by || '-'}</td>
                <td className="text-gray-500 truncate max-w-[20ch]">{r.note}</td>
                <td className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString('ko-KR')}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="text-gray-500 py-2 text-center">없음</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
