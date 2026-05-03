'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { BarChart3, Factory, MessageSquare, Package, Users } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { formatKstDateTimeCompact } from '@/lib/kst';
import { isAdminLike } from '@/lib/auth-helpers';

const ORDER_STATUS_LABEL: Record<string, string> = {
  payment_completed: '결제완료',
  in_production: '제작중',
  shipping: '배송중',
  delivered: '배송완료',
  cancelled: '취소',
  partially_cancelled: '부분취소',
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  payment_completed: 'bg-blue-100 text-blue-800',
  in_production: 'bg-yellow-100 text-yellow-800',
  shipping: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  partially_cancelled: 'bg-red-100 text-red-800',
};

type DashboardCountsBase = {
  orders_total: number;
  orders_payment_completed: number;
  orders_in_production: number;
  orders_shipping: number;
  orders_delivered: number;
  orders_cancelled: number;
};

type DashboardCountsAdmin = DashboardCountsBase & {
  orders_unassigned: number;
  products_total: number;
  products_active: number;
  users_total: number;
  users_admin: number;
  users_factory: number;
  users_customer: number;
  factories_total: number;
  inquiries_pending: number;
};

type DashboardOrder = {
  id: string;
  created_at: string;
  customer_name: string;
  total_amount: number;
  order_status: string;
  payment_status: string;
};

type DashboardPayload =
  | {
      role: 'factory';
      counts: DashboardCountsBase;
      recentOrders: DashboardOrder[];
    }
  | {
      role: 'admin';
      counts: DashboardCountsAdmin;
      recentOrders: DashboardOrder[];
    };

const formatNumber = (value: number) => new Intl.NumberFormat('ko-KR').format(value);

const formatDateTime = (value: string) => formatKstDateTimeCompact(value);

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: payload = null, isLoading, error: swrError } = useSWR<DashboardPayload>('/api/admin/dashboard');
  const errorMessage = swrError?.message || null;

  const cards = useMemo(() => {
    if (!payload) return [];

    if (payload.role === 'factory') {
      return [
        {
          label: '배정 주문',
          value: payload.counts.orders_total,
          hint: `결제완료 ${payload.counts.orders_payment_completed} · 제작중 ${payload.counts.orders_in_production}`,
          href: '/orders',
          icon: BarChart3,
          accent: 'border-l-blue-500',
        },
        {
          label: '결제완료',
          value: payload.counts.orders_payment_completed,
          hint: '신규 주문 확인 필요',
          href: '/orders',
          icon: BarChart3,
          accent: 'border-l-blue-400',
        },
        {
          label: '제작중',
          value: payload.counts.orders_in_production,
          hint: '제작/출고 진행중',
          href: '/orders',
          icon: BarChart3,
          accent: 'border-l-yellow-500',
        },
        {
          label: '배송완료',
          value: payload.counts.orders_delivered,
          hint: '완료된 주문',
          href: '/orders',
          icon: BarChart3,
          accent: 'border-l-green-500',
        },
      ];
    }

    return [
      {
        label: '전체 주문',
        value: payload.counts.orders_total,
        hint: `결제완료 ${payload.counts.orders_payment_completed} · 제작중 ${payload.counts.orders_in_production}`,
        href: '/orders',
        icon: BarChart3,
        accent: 'border-l-blue-500',
      },
      {
        label: '미배정 주문',
        value: payload.counts.orders_unassigned,
        hint: '공장 배정이 필요합니다',
        href: '/orders',
        icon: Factory,
        accent: 'border-l-orange-500',
      },
      {
        label: '활성 제품',
        value: payload.counts.products_active,
        hint: `전체 ${payload.counts.products_total}`,
        href: '/products',
        icon: Package,
        accent: 'border-l-green-500',
      },
      {
        label: '대기 문의',
        value: payload.counts.inquiries_pending,
        hint: '답변이 필요한 문의',
        href: '/content/inquiries',
        icon: MessageSquare,
        accent: 'border-l-amber-500',
      },
      {
        label: '사용자',
        value: payload.counts.users_total,
        hint: `관리자 ${payload.counts.users_admin} · 공장 ${payload.counts.users_factory} · 고객 ${payload.counts.users_customer}`,
        href: '/users',
        icon: Users,
        accent: 'border-l-purple-500',
      },
      {
        label: '공장',
        value: payload.counts.factories_total,
        hint: '등록된 공장',
        href: '/factories',
        icon: Factory,
        accent: 'border-l-slate-500',
      },
    ];
  }, [payload]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">대시보드</h2>
          <p className="text-gray-500 mt-1">
            {user?.role === 'factory'
              ? '배정된 주문 현황을 빠르게 확인하세요.'
              : '관리 현황을 한눈에 확인하세요.'}
          </p>
        </div>
        <div className="text-right text-sm text-gray-500">
          <div className="font-medium text-gray-700">{user?.manufacturer_name ?? '관리자'}</div>
          <div className="mt-1">{user?.email}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : errorMessage ? (
        <div className="bg-white border border-red-200 rounded-md p-3 shadow-sm">
          <p className="text-sm text-red-700">{errorMessage}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className={`group bg-white border border-gray-200/60 border-l-[3px] ${card.accent} rounded-md px-4 py-3 shadow-sm hover:shadow-md transition-all`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500">{card.label}</p>
                    <p className="mt-0.5 text-2xl font-bold text-gray-900">
                      {formatNumber(card.value)}
                    </p>
                    {card.hint && <p className="mt-1 text-[11px] text-gray-400">{card.hint}</p>}
                  </div>
                  <card.icon className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" />
                </div>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden lg:col-span-2">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">최근 주문</h3>
                <Link href="/orders" className="text-sm text-blue-600 hover:text-blue-700">
                  전체 보기
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 font-medium">주문 ID</th>
                      <th className="px-4 py-2 font-medium">고객</th>
                      <th className="px-4 py-2 font-medium">상태</th>
                      <th className="px-4 py-2 font-medium">금액</th>
                      <th className="px-4 py-2 font-medium">일시</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(payload?.recentOrders || []).map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-2.5 text-xs font-mono text-gray-500">
                          {order.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-900">
                          {order.customer_name || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ORDER_STATUS_COLOR[order.order_status] || 'bg-gray-100 text-gray-800'}`}
                          >
                            {ORDER_STATUS_LABEL[order.order_status] || order.order_status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm tabular-nums text-gray-900">
                          {formatNumber(order.total_amount)}원
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">
                          {formatDateTime(order.created_at)}
                        </td>
                      </tr>
                    ))}
                    {(payload?.recentOrders || []).length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-sm text-gray-400 text-center" colSpan={5}>
                          최근 주문이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-gray-200/60 rounded-md shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-900">빠른 이동</h3>
              <div className="mt-3 grid gap-2">
                <Link
                  href="/orders"
                  className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  주문 관리
                  <span className="text-gray-400">→</span>
                </Link>
                {isAdminLike(user?.role) && (
                  <>
                    <Link
                      href="/products"
                      className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      제품 관리
                      <span className="text-gray-400">→</span>
                    </Link>
                    <Link
                      href="/content/inquiries"
                      className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      문의 관리
                      <span className="text-gray-400">→</span>
                    </Link>
                    <Link
                      href="/users"
                      className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      사용자 관리
                      <span className="text-gray-400">→</span>
                    </Link>
                    <Link
                      href="/factories"
                      className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      공장 관리
                      <span className="text-gray-400">→</span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
