'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Clock, CreditCard, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import type { Order, OrderItem } from '@/types/types';
import DesignChatPanel from '@/components/orders/DesignChatPanel';
import OrderAttachmentSection from '@/components/orders/OrderAttachmentSection';
import { extractVariants } from '@/lib/orderUtils';
import { formatKstDateShort } from '@/lib/kst';
import { orderCategoryLabel } from '@/lib/order-category';
import { isAdminLike } from '@/lib/auth-helpers';

interface FactoryOrderInfoPanelProps {
  orderId: string;
  currentOrderItemId: string;
}

export default function FactoryOrderInfoPanel({
  orderId,
  currentOrderItemId,
}: FactoryOrderInfoPanelProps) {
  const router = useRouter();
  const { user } = useAuthStore();

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [localAttachmentUrls, setLocalAttachmentUrls] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (user?.manufacturer_id) {
        params.set('factoryId', user.manufacturer_id);
      }
      const [ordersRes, itemsRes] = await Promise.all([
        fetch(`/api/admin/orders${params.toString() ? `?${params}` : ''}`),
        fetch(`/api/admin/orders/items?orderId=${orderId}`),
      ]);

      if (ordersRes.ok) {
        const ordersPayload = await ordersRes.json();
        const orders: Order[] = ordersPayload?.data || [];
        const found = orders.find((o) => o.id === orderId);
        if (found) {
          setOrder(found);
          setLocalAttachmentUrls(found.attachment_urls || []);
        }
      }

      if (itemsRes.ok) {
        const itemsPayload = await itemsRes.json();
        setOrderItems(itemsPayload?.data || []);
      }
    } catch (err) {
      console.error('Error fetching factory order info:', err);
    } finally {
      setLoading(false);
    }
  }, [orderId, user?.manufacturer_id]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  const currentItem = orderItems.find((i) => i.id === currentOrderItemId);

  const handleFactoryStatusChange = useCallback(async (newStatus: string) => {
    if (!order || !currentItem) return;
    setUpdatingStatus(true);
    try {
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, itemId: currentItem.id, factoryStatus: newStatus }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '상태 변경에 실패했습니다.');
      }
      const { data } = await response.json();
      setOrderItems((prev) =>
        prev.map((item) =>
          item.id === currentItem.id
            ? { ...item, factory_status: data.factory_status }
            : item
        )
      );
      if (data.order_status) {
        setOrder((prev) => prev ? { ...prev, order_status: data.order_status } : prev);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '상태 변경에 실패했습니다.');
    } finally {
      setUpdatingStatus(false);
    }
  }, [order, currentItem]);

  const handleItemClick = useCallback((item: OrderItem) => {
    const returnUrl = encodeURIComponent('/orders');
    router.push(
      `/editor/${item.product_id}?mode=order&orderId=${orderId}&orderItemId=${item.id}&returnUrl=${returnUrl}`
    );
  }, [router, orderId]);

  const formatDate = (dateString: string | null) =>
    dateString ? formatKstDateShort(dateString) : '-';

  const getStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const colors: Record<string, string> = {
      assigned: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      shipped: 'bg-indigo-100 text-indigo-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {/* Order Info */}
      {order && (
        <div className="p-3 border-b">
          <div className="flex items-center gap-1.5 mb-2">
            <CreditCard className="w-3.5 h-3.5 text-gray-500" />
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">주문 정보</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-1.5">
              <span className="text-[11px] text-gray-400 shrink-0 w-16">주문 구분</span>
              <span className="text-[11px] font-medium text-gray-800">
                {orderCategoryLabel(order.order_category)}
              </span>
            </div>

            {currentItem && (
              <>
                <div className="flex items-start gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0 w-16">배정 상태</span>
                  <select
                    value={currentItem.factory_status || 'assigned'}
                    onChange={(e) => handleFactoryStatusChange(e.target.value)}
                    disabled={updatingStatus || currentItem.factory_status === 'shipped'}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 ${getStatusColor(currentItem.factory_status ?? null)}`}
                  >
                    <option value="assigned">배정완료</option>
                    <option value="in_progress">작업중</option>
                    <option value="completed">작업완료</option>
                    <option value="shipped">출고완료</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0 w-16">마감일</span>
                  <span className="text-[11px] font-medium text-gray-800 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-400" />
                    {formatDate(currentItem.deadline ?? null)}
                  </span>
                </div>

                <div className="flex items-start gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0 w-16">금액</span>
                  <span className="text-[11px] font-semibold text-gray-800">
                    {currentItem.factory_amount ? `${currentItem.factory_amount.toLocaleString()}원` : '-'}
                  </span>
                </div>

                <div className="flex items-start gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0 w-16">결제 예정일</span>
                  <span className="text-[11px] font-medium text-gray-800">
                    {formatDate(currentItem.factory_payment_date ?? null)}
                  </span>
                </div>

                <div className="flex items-start gap-1.5">
                  <span className="text-[11px] text-gray-400 shrink-0 w-16">결제 상태</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                    currentItem.factory_payment_status === 'completed' ? 'bg-green-100 text-green-800' :
                    currentItem.factory_payment_status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {currentItem.factory_payment_status === 'pending' ? '대기' :
                     currentItem.factory_payment_status === 'completed' ? '완료' :
                     currentItem.factory_payment_status === 'cancelled' ? '취소' : '-'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Customer Note & Attachments */}
      {order && (
        <div className="p-3 border-b">
          {order.customer_note && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">고객 요청사항</h3>
              </div>
              <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{order.customer_note}</p>
            </div>
          )}
          <OrderAttachmentSection
            orderId={orderId}
            attachmentUrls={localAttachmentUrls}
            onUrlsUpdated={setLocalAttachmentUrls}
            compact
            isAdmin={isAdminLike(user?.role)}
          />
        </div>
      )}

      {/* Design Chat */}
      <div className="p-3 border-b">
        <DesignChatPanel
          orderItemId={currentOrderItemId}
          productTitle={orderItems.find((i) => i.id === currentOrderItemId)?.product_title}
          designTitle={orderItems.find((i) => i.id === currentOrderItemId)?.design_title || undefined}
          compact
        />
      </div>

      {/* Order Items Navigation */}
      {orderItems.length > 0 && (
        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Package className="w-3.5 h-3.5 text-gray-500" />
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              주문 상품 ({orderItems.length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {orderItems.map((item) => {
              const isActive = item.id === currentOrderItemId;
              return (
                <button
                  key={item.id}
                  onClick={() => !isActive && handleItemClick(item)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-md text-left transition-colors ${
                    isActive
                      ? 'bg-blue-50 border border-blue-200'
                      : 'border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                  }`}
                >
                  <div className="w-10 h-10 bg-gray-100 rounded shrink-0 overflow-hidden">
                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt={item.product_title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className={`text-[11px] font-medium truncate ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                        {item.product_title}
                      </span>
                      {item.retouch_requested && (
                        <span className="px-1 py-0.5 text-[8px] font-semibold bg-orange-100 text-orange-700 rounded shrink-0">
                          리터치
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {(() => {
                        const variants = extractVariants(item);
                        if (variants.length > 1) {
                          return (
                            <span>
                              {variants.filter(v => (v.quantity ?? 0) > 0).map((v, vi) => (
                                <span key={vi}>
                                  {vi > 0 && ', '}
                                  {v.size_name || v.color_name}{' '}x{v.quantity}
                                </span>
                              ))}
                              {' '}(총 {item.quantity})
                            </span>
                          );
                        }
                        const v = variants[0];
                        return <span>수량: {v?.size_name ? `${v.size_name} ` : ''}{item.quantity}</span>;
                      })()}
                      {item.products?.product_code && ` · ${item.products.product_code}`}
                    </div>
                  </div>
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
