'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { OrderItem } from '@/types/types';
import { useAuthStore } from '@/store/useAuthStore';

export default function OrderItemPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();

  const orderId = params.orderId as string;
  const itemId = params.itemId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialFetchDone = useRef(false);

  const fetchAndRedirect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/items?orderId=${orderId}`);

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || 'Failed to load order items.');
      }

      const payload = await response.json();
      const items: OrderItem[] = payload?.data || [];
      const foundItem = items.find((item) => item.id === itemId);

      if (!foundItem) {
        throw new Error('Order item not found.');
      }

      // Redirect to unified editor
      const returnUrl = encodeURIComponent(`/orders/${orderId}`);
      router.replace(
        `/editor/${foundItem.product_id}?mode=order&orderId=${orderId}&orderItemId=${itemId}&returnUrl=${returnUrl}`
      );
    } catch (err) {
      console.error('Error fetching order item:', err);
      setError(err instanceof Error ? err.message : 'Failed to load order item.');
      setLoading(false);
    }
  }, [orderId, itemId, router]);

  useEffect(() => {
    if (!user || initialFetchDone.current) return;
    initialFetchDone.current = true;
    fetchAndRedirect();
  }, [user, fetchAndRedirect]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => router.push(`/orders/${orderId}`)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Back to Order
        </button>
      </div>
    );
  }

  return null;
}
