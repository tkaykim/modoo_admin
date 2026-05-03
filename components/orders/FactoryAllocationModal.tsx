'use client';

import { useState, useEffect } from 'react';
import { Factory, Order, OrderItem } from '@/types/types';
import { X, Factory as FactoryIcon, Package, Copy } from 'lucide-react';
import { extractVariants } from '@/lib/orderUtils';

interface ItemAllocationState {
  orderItemId: string;
  assigned_manufacturer_id: string;
  factory_amount: number | string;
  deadline: string;
  factory_payment_date: string;
  factory_payment_status: string;
}

interface FactoryAllocationModalProps {
  order: Order;
  factories: Factory[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function FactoryAllocationModal({
  order,
  factories,
  onClose,
  onSuccess,
}: FactoryAllocationModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemAllocations, setItemAllocations] = useState<ItemAllocationState[]>([]);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch(`/api/admin/orders/items?orderId=${order.id}`);
        if (res.ok) {
          const payload = await res.json();
          const items: OrderItem[] = payload?.data || [];
          setOrderItems(items);
          setItemAllocations(
            items.map((item) => ({
              orderItemId: item.id,
              assigned_manufacturer_id: item.assigned_manufacturer_id || '',
              factory_amount: item.factory_amount ?? '',
              deadline: item.deadline ? item.deadline.split('T')[0] : '',
              factory_payment_date: item.factory_payment_date ? item.factory_payment_date.split('T')[0] : '',
              factory_payment_status: item.factory_payment_status || 'pending',
            }))
          );
        }
      } catch {
        // Non-critical
      } finally {
        setLoadingItems(false);
      }
    };
    fetchItems();
  }, [order.id]);

  const updateItemAllocation = (index: number, field: keyof ItemAllocationState, value: string | number) => {
    setItemAllocations((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    );
  };

  const applyToAll = (sourceIndex: number) => {
    const source = itemAllocations[sourceIndex];
    setItemAllocations((prev) =>
      prev.map((a) => ({
        ...a,
        assigned_manufacturer_id: source.assigned_manufacturer_id,
        factory_amount: source.factory_amount,
        deadline: source.deadline,
        factory_payment_date: source.factory_payment_date,
        factory_payment_status: source.factory_payment_status,
      }))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const validItems = itemAllocations.filter((a) => a.assigned_manufacturer_id);
    if (validItems.length === 0) {
      setError('최소 한 개 품목에 공장을 선택해주세요.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/orders/factory-allocation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          items: validItems.map((a) => ({
            orderItemId: a.orderItemId,
            assigned_manufacturer_id: a.assigned_manufacturer_id,
            factory_amount: a.factory_amount ? Number(a.factory_amount) : null,
            deadline: a.deadline || null,
            factory_payment_date: a.factory_payment_date || null,
            factory_payment_status: a.factory_payment_status || 'pending',
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '공장 배정에 실패했습니다.');
      }

      onSuccess();
    } catch (err) {
      console.error('Factory allocation error:', err);
      setError(err instanceof Error ? err.message : '공장 배정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <FactoryIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">품목별 공장 배정</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Order Info */}
          <div className="mb-4 p-3 bg-gray-50 rounded-md flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">주문 ID</div>
              <div className="font-mono text-sm text-blue-600">{order.id}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">고객명</div>
              <div className="text-sm font-medium">{order.customer_name}</div>
            </div>
          </div>

          {/* Items */}
          {loadingItems ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orderItems.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">상품 정보가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {orderItems.map((item, index) => {
                const alloc = itemAllocations[index];
                if (!alloc) return null;

                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    {/* Item Header */}
                    <div className="flex items-center gap-3 p-3 bg-gray-50 border-b border-gray-100">
                      <div className="w-10 h-10 bg-white rounded shrink-0 overflow-hidden border border-gray-200">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt={item.product_title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-4 h-4 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">{item.product_title}</div>
                        {item.design_title && (
                          <div className="text-xs text-gray-500 truncate">{item.design_title}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-wrap items-center gap-1">
                          {(() => {
                            const variants = extractVariants(item);
                            if (variants.length > 1) {
                              return (
                                <>
                                  {variants.filter(v => (v.quantity ?? 0) > 0).map((v, vi) => (
                                    <span key={vi} className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-white rounded text-[10px] text-gray-600 border border-gray-200">
                                      {v.size_name && <span>{v.size_name}</span>}
                                      <span className="font-medium">x{v.quantity}</span>
                                    </span>
                                  ))}
                                  <span className="text-[10px] font-semibold text-blue-600">({item.quantity})</span>
                                </>
                              );
                            }
                            return <span className="text-xs text-gray-500">x{item.quantity}</span>;
                          })()}
                        </div>
                        {orderItems.length > 1 && index === 0 && (
                          <button
                            type="button"
                            onClick={() => applyToAll(0)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                            title="이 설정을 모든 품목에 적용"
                          >
                            <Copy className="w-3 h-3" />
                            전체 적용
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Item Allocation Fields */}
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          공장 선택 <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={alloc.assigned_manufacturer_id}
                          onChange={(e) => updateItemAllocation(index, 'assigned_manufacturer_id', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">공장을 선택하세요</option>
                          {factories.map((factory) => (
                            <option key={factory.id} value={factory.id}>
                              {factory.name || factory.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">금액</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={alloc.factory_amount}
                            onChange={(e) => updateItemAllocation(index, 'factory_amount', e.target.value)}
                            min="0"
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="0"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">마감일</label>
                        <input
                          type="date"
                          value={alloc.deadline}
                          onChange={(e) => updateItemAllocation(index, 'deadline', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">결제 예정일</label>
                        <input
                          type="date"
                          value={alloc.factory_payment_date}
                          onChange={(e) => updateItemAllocation(index, 'factory_payment_date', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">결제 상태</label>
                        <select
                          value={alloc.factory_payment_status}
                          onChange={(e) => updateItemAllocation(index, 'factory_payment_status', e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="pending">대기</option>
                          <option value="completed">완료</option>
                          <option value="cancelled">취소</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 text-sm"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading || loadingItems}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
            >
              {loading ? '처리중...' : '배정하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
