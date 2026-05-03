'use client';

import { useState, useEffect, useCallback } from 'react';
import { Truck, Package, CheckCircle, RefreshCw, Printer, Search, ChevronDown } from 'lucide-react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { formatKstDateOnly, getKstYYYYMMDD } from '@/lib/kst';
import type { Order } from '@/types/types';

type Tab = 'pending' | 'registered' | 'shipping' | 'delivered';

const TAB_CONFIG: Record<Tab, { label: string; icon: typeof Package; color: string }> = {
  pending: { label: '접수 대기', icon: Package, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  registered: { label: '접수 완료', icon: Printer, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  shipping: { label: '배송 중', icon: Truck, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  delivered: { label: '배송 완료', icon: CheckCircle, color: 'text-green-600 bg-green-50 border-green-200' },
};

export default function ShippingPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [trackingResults, setTrackingResults] = useState<Record<string, any>>({});

  const { data: allOrders, mutate } = useSWR<Order[]>('/api/admin/orders?status=all', fetcher, {
    revalidateOnFocus: false,
  });

  const filteredOrders = (allOrders || []).filter((o) => {
    if (o.shipping_method !== 'domestic') return false;
    switch (tab) {
      case 'pending':
        return !o.logen_registered_at && ['payment_completed', 'in_production'].includes(o.order_status);
      case 'registered':
        return o.logen_registered_at && !o.tracking_number;
      case 'shipping':
        return o.order_status === 'shipping' && o.tracking_number;
      case 'delivered':
        return o.order_status === 'delivered';
      default:
        return false;
    }
  });

  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const handleBulkRegister = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}건을 로젠택배에 접수하시겠습니까?`)) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/shipping/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (res.ok) {
        alert(`${json.data?.registered || 0}건 접수 완료`);
        mutate();
        setSelectedIds(new Set());
      } else {
        alert(json.error || '접수 실패');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedIds, mutate]);

  const handlePrintPopup = useCallback(async () => {
    const takeDt = getKstYYYYMMDD();
    const res = await fetch(`/api/admin/shipping/print?takeDt=${takeDt}`);
    const json = await res.json();
    if (res.ok && json.data?.url) {
      window.open(json.data.url, 'logen_print', 'width=900,height=700');
    } else {
      alert(json.error || '출력 URL 생성 실패');
    }
  }, []);

  const handleBulkFetchSlipNo = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/shipping/slip-no', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (res.ok) {
        alert(`${json.data?.updated?.length || 0}건 송장번호 동기화 완료`);
        mutate();
        setSelectedIds(new Set());
      } else {
        alert(json.error || '송장번호 조회 실패');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedIds, mutate]);

  const handleBulkTracking = useCallback(async () => {
    const slipNos = filteredOrders
      .filter((o) => selectedIds.size === 0 || selectedIds.has(o.id))
      .map((o) => o.tracking_number)
      .filter(Boolean) as string[];

    if (slipNos.length === 0) {
      alert('추적할 운송장번호가 없습니다.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/shipping/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slipNos }),
      });
      const json = await res.json();
      if (res.ok && json.data?.tracking) {
        const results: Record<string, any> = {};
        for (const item of json.data.tracking) {
          if (item.data1 && Array.isArray(item.data1)) {
            const last = item.data1[item.data1.length - 1];
            results[item.slipNo] = last;
          }
        }
        setTrackingResults(results);
        if (json.data.deliveredCount > 0) {
          mutate();
        }
      } else {
        alert(json.error || '추적 조회 실패');
      }
    } finally {
      setLoading(false);
    }
  }, [filteredOrders, selectedIds, mutate]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">택배 관리</h1>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          새로고침
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, cfg]) => {
          const count = (allOrders || []).filter((o) => {
            if (o.shipping_method !== 'domestic') return false;
            switch (key) {
              case 'pending': return !o.logen_registered_at && ['payment_completed', 'in_production'].includes(o.order_status);
              case 'registered': return o.logen_registered_at && !o.tracking_number;
              case 'shipping': return o.order_status === 'shipping' && o.tracking_number;
              case 'delivered': return o.order_status === 'delivered';
              default: return false;
            }
          }).length;

          const Icon = cfg.icon;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap ${
                tab === key ? cfg.color : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {cfg.label}
              <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                tab === key ? 'bg-white/60' : 'bg-gray-100'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {tab === 'pending' && (
          <button
            onClick={handleBulkRegister}
            disabled={selectedIds.size === 0 || loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '처리 중...' : `선택 접수 (${selectedIds.size}건)`}
          </button>
        )}
        {tab === 'registered' && (
          <>
            <button
              onClick={handlePrintPopup}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
            >
              <span className="flex items-center gap-1.5">
                <Printer className="w-4 h-4" />
                송장 출력 (로젠 팝업)
              </span>
            </button>
            <button
              onClick={handleBulkFetchSlipNo}
              disabled={selectedIds.size === 0 || loading}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '처리 중...' : `송장번호 가져오기 (${selectedIds.size}건)`}
            </button>
          </>
        )}
        {tab === 'shipping' && (
          <button
            onClick={handleBulkTracking}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '조회 중...' : `배송 추적 조회${selectedIds.size > 0 ? ` (${selectedIds.size}건)` : ' (전체)'}`}
          </button>
        )}
      </div>

      {/* Order Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {tab !== 'delivered' && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={filteredOrders.length > 0 && selectedIds.size === filteredOrders.length}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                )}
                <th className="px-3 py-3 text-left font-medium text-gray-600">주문 ID</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">고객명</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">주소</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">주문일</th>
                {(tab === 'shipping' || tab === 'delivered') && (
                  <th className="px-3 py-3 text-left font-medium text-gray-600">운송장번호</th>
                )}
                {tab === 'shipping' && (
                  <th className="px-3 py-3 text-left font-medium text-gray-600">최종 상태</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-gray-400">
                    해당하는 주문이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50/50">
                    {tab !== 'delivered' && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          className="rounded"
                        />
                      </td>
                    )}
                    <td className="px-3 py-3 font-mono text-xs text-gray-600">
                      {order.id.slice(0, 8)}...
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900">{order.customer_name}</td>
                    <td className="px-3 py-3 text-gray-600 max-w-xs truncate">
                      {order.postal_code && `[${order.postal_code}] `}
                      {order.address_line_1}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                      {formatKstDateOnly(order.created_at)}
                    </td>
                    {(tab === 'shipping' || tab === 'delivered') && (
                      <td className="px-3 py-3 font-mono text-xs text-gray-700">
                        {order.tracking_number || '-'}
                      </td>
                    )}
                    {tab === 'shipping' && (
                      <td className="px-3 py-3 text-xs">
                        {order.tracking_number && trackingResults[order.tracking_number] ? (
                          <span className="text-blue-600">
                            {trackingResults[order.tracking_number].statNm}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
