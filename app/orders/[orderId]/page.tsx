'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Factory, Order } from '@/types/types';
import { useAuthStore } from '@/store/useAuthStore';
import OrderDetail from '@/components/OrderDetail';
import { isAdminLike } from '@/lib/auth-helpers';
import FactoryWorkView, { type FactoryWorkItem } from '@/components/factory/FactoryWorkView';
import type { FactoryPriceResult } from '@/components/factory/FactoryPriceConfirmModal';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();

  const orderId = params.orderId as string;

  const addItemDesignId = useMemo(() => {
    const addItem = searchParams.get('addItem');
    const designId = searchParams.get('initialDesignId');
    if (addItem === 'true') {
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('addItem');
        url.searchParams.delete('initialDesignId');
        router.replace(url.pathname + url.search, { scroll: false });
      }
      return designId || '';
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [factoryItems, setFactoryItems] = useState<any[]>([]);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  const initialFetchDone = useRef(false);
  const isFactoryUser = user?.role === 'factory';

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('orderId', orderId);
      if (user?.role === 'factory' && user.manufacturer_id) {
        queryParams.set('factoryId', user.manufacturer_id);
      }
      const url = `/api/admin/orders?${queryParams}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to load order data.');
      }

      const payload = await response.json();
      const orders: Order[] = payload?.data || [];
      const foundOrder = orders[0];

      if (!foundOrder) {
        throw new Error('Order not found.');
      }

      setOrder(foundOrder);
    } catch (err) {
      console.error('Error fetching order:', err);
      setError(err instanceof Error ? err.message : 'Failed to load order data.');
    } finally {
      setLoading(false);
    }
  }, [orderId, user?.role, user?.manufacturer_id]);

  const fetchFactoryItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/orders/items?orderId=${orderId}`);
      if (!res.ok) return;
      const payload = await res.json();
      setFactoryItems(payload?.data || []);
    } catch {
      /* noop */
    }
  }, [orderId]);

  useEffect(() => {
    if (user?.role === 'factory' && order) fetchFactoryItems();
  }, [user?.role, order, fetchFactoryItems]);

  const applyFactoryStatus = useCallback(
    async (item: FactoryWorkItem, payload: { status: string; price?: FactoryPriceResult }) => {
      setUpdatingItemId(item.id);
      try {
        const body: Record<string, unknown> = { orderId, orderItemId: item.id, factoryStatus: payload.status };
        if (payload.price) {
          body.confirmFactoryPrice = true;
          body.factoryAmount = payload.price.amount;
          body.factoryUnitPrice = payload.price.unitPrice;
          body.factoryPriceMode = payload.price.mode;
        }
        const res = await fetch('/api/admin/orders', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const p = await res.json().catch(() => ({}));
          alert(p?.error || '상태 변경에 실패했습니다.');
          return false;
        }
        await fetchFactoryItems();
        return true;
      } catch {
        alert('상태 변경에 실패했습니다.');
        return false;
      } finally {
        setUpdatingItemId(null);
      }
    },
    [orderId, fetchFactoryItems]
  );

  const fetchFactories = useCallback(async () => {
    setLoadingFactories(true);
    try {
      const response = await fetch('/api/admin/factories');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load factories.');
      }
      const payload = await response.json();
      setFactories(payload?.data || []);
    } catch (err) {
      console.error('Error fetching factories:', err);
      setFactories([]);
    } finally {
      setLoadingFactories(false);
    }
  }, []);

  useEffect(() => {
    if (!user || initialFetchDone.current) return;
    initialFetchDone.current = true;

    const loadData = async () => {
      if (isAdminLike(user.role)) {
        await Promise.all([fetchOrder(), fetchFactories()]);
      } else if (user.role === 'factory') {
        await fetchOrder();
        if (user.manufacturer_id) {
          setFactories([
            {
              id: user.manufacturer_id,
              name: user.manufacturer_name || user.email || 'Factory',
              email: user.email || null,
              phone_number: user.phone || null,
              address: null,
              is_active: true,
              created_at: user.created_at || new Date().toISOString(),
              updated_at: user.created_at || new Date().toISOString(),
            },
          ]);
        }
      } else {
        await fetchOrder();
      }
    };

    loadData();
  }, [user, fetchOrder, fetchFactories]);

  const handleBack = useCallback(() => {
    router.push('/orders');
  }, [router]);

  const handleUpdate = useCallback(() => {
    fetchOrder();
  }, [fetchOrder]);

  const handleOrderUpdate = useCallback((updatedOrder: Order) => {
    setOrder(updatedOrder);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || 'Order not found.'}</p>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Back to Orders
        </button>
      </div>
    );
  }

  // 공장 회원: 관리자형 상세 대신 통합 작업 화면(링크와 동일)을 본다.
  if (isFactoryUser) {
    const myId = user?.manufacturer_id;
    const workItems: FactoryWorkItem[] = (factoryItems || [])
      .filter((it: any) => !myId || it.assigned_manufacturer_id === myId)
      .map((it: any) => ({
        id: it.id,
        product_title: it.product_title,
        design_title: it.design_title,
        quantity: it.quantity,
        thumbnail_url: it.thumbnail_url,
        product_code: it.products?.product_code ?? null,
        factory_status: it.factory_status,
        factory_amount: it.factory_amount,
        factory_unit_price: it.factory_unit_price,
        factory_price_confirmed_at: it.factory_price_confirmed_at,
        factory_price_locked: it.factory_price_locked,
      }));
    return (
      <div className="mx-auto max-w-2xl p-4">
        <div className="mb-4 flex items-center gap-2">
          <button onClick={handleBack} className="text-gray-500 hover:text-gray-800" aria-label="뒤로">←</button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">작업 상세</h1>
            <p className="font-mono text-xs text-gray-500">{order.id}</p>
          </div>
        </div>
        <FactoryWorkView
          items={workItems}
          subtitle="배정완료 → 작업중으로 바꾸면 작업비를 확인합니다"
          updatingItemId={updatingItemId}
          onApply={applyFactoryStatus}
          onOpenDesign={(it) => {
            const src = (factoryItems || []).find((x: any) => x.id === it.id);
            if (src?.product_id) {
              router.push(
                `/editor/${src.product_id}?mode=order&orderId=${order.id}&orderItemId=${it.id}&returnUrl=${encodeURIComponent('/orders/' + order.id)}`
              );
            }
          }}
        />
      </div>
    );
  }

  return (
    <OrderDetail
      order={order}
      onBack={handleBack}
      onUpdate={handleUpdate}
      onOrderUpdate={handleOrderUpdate}
      factories={factories}
      canAssign={isAdminLike(user?.role)}
      loadingFactories={loadingFactories}
      isFactoryUser={isFactoryUser}
      initialAddItemDesignId={addItemDesignId}
    />
  );
}
