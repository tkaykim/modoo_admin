'use client';

import { useAuthStore } from '@/store/useAuthStore';
import { useMemo, useState, useEffect } from 'react';
import useSWR from 'swr';
import { Factory, Profile, Coupon } from '@/types/types';
import { Users, Calendar, Shield, User as UserIcon, AlertCircle, Factory as FactoryIcon, Ticket, X, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatKstDateLong } from '@/lib/kst';
import { isAdminLike } from '@/lib/auth-helpers';

interface PaginatedResponse {
  data: Profile[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const paginatedFetcher = async (url: string): Promise<PaginatedResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || 'Failed to fetch');
  }
  return res.json();
};

export default function UsersTab() {
  const { user: currentUser } = useAuthStore();
  const [filterRole, setFilterRole] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 20;
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [updatingFactoryId, setUpdatingFactoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Coupon issuance states
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponTargetUserIds, setCouponTargetUserIds] = useState<string[]>([]);
  const [activeCoupons, setActiveCoupons] = useState<Coupon[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [issuingCoupon, setIssuingCoupon] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Build users SWR key
  const usersKey = useMemo(() => {
    if (!currentUser) return null;
    let url = `/api/admin/users?page=${currentPage}&limit=${limit}&role=${filterRole}`;
    if (debouncedSearch) {
      url += `&search=${encodeURIComponent(debouncedSearch)}`;
    }
    if (currentUser.role === 'factory' && currentUser.manufacturer_id) {
      url += `&factoryId=${currentUser.manufacturer_id}`;
    }
    return url;
  }, [currentUser, filterRole, debouncedSearch, currentPage]);

  const { data: response, isLoading: loading, mutate: mutateUsers } = useSWR<PaginatedResponse>(usersKey, paginatedFetcher);
  const users = response?.data || [];
  const totalPages = response?.totalPages || 0;
  const total = response?.total || 0;

  // Factories: only fetch for admin
  const { data: factories = [], isLoading: loadingFactories } = useSWR<Factory[]>(
    isAdminLike(currentUser?.role) ? '/api/admin/factories' : null
  );

  const updateUserRole = async (userId: string, newRole: 'customer' | 'admin' | 'factory') => {
    setUpdatingUserId(userId);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, role: newRole }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '사용자 권한 변경에 실패했습니다.');
      }

      const payload = await res.json();
      const updatedUser = payload?.data as Profile | undefined;
      const updatedRole = updatedUser?.role ?? newRole;
      const updatedManufacturerId = updatedUser?.manufacturer_id ?? null;

      if (filterRole !== 'all' && updatedRole !== filterRole) {
        if (response) {
          mutateUsers({ ...response, data: users.filter((user) => user.id !== userId), total: total - 1 }, { revalidate: false });
        }
      } else {
        if (response) {
          mutateUsers({ ...response, data: users.map((user) =>
            user.id === userId
              ? { ...user, role: updatedRole, manufacturer_id: updatedManufacturerId }
              : user
          ) }, { revalidate: false });
        }
      }
    } catch (error) {
      console.error('Error updating user role:', error);
      setError(error instanceof Error ? error.message : '사용자 권한 변경에 실패했습니다.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const updateUserFactory = async (userId: string, factoryId: string | null) => {
    setUpdatingFactoryId(userId);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, factoryId }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        throw new Error(errorPayload?.error || '공장 배정에 실패했습니다.');
      }

      const payload = await res.json();
      const updatedUser = payload?.data as Profile | undefined;
      const updatedManufacturerId = updatedUser?.manufacturer_id ?? factoryId;

      if (response) {
        mutateUsers(
          { ...response, data: users.map((user) =>
            user.id === userId ? { ...user, manufacturer_id: updatedManufacturerId } : user
          ) },
          { revalidate: false }
        );
      }
    } catch (error) {
      console.error('Error updating factory assignment:', error);
      setError(error instanceof Error ? error.message : '공장 배정에 실패했습니다.');
    } finally {
      setUpdatingFactoryId(null);
    }
  };

  const getRoleColor = (role: string) => {
    if (isAdminLike(role)) return 'bg-purple-100 text-purple-800';
    if (role === 'factory') return 'bg-orange-100 text-orange-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getRoleLabel = (role: string) => {
    if (isAdminLike(role)) return '관리자';
    if (role === 'factory') return '공장';
    return '일반 사용자';
  };

  const factoryMap = useMemo(() => {
    const map = new Map<string, Factory>();
    factories.forEach((factory) => map.set(factory.id, factory));
    return map;
  }, [factories]);

  const getFactoryName = (manufacturerId?: string | null) => {
    if (!manufacturerId) return '-';
    const factory = factoryMap.get(manufacturerId);
    if (factory?.name) return factory.name;
    if (currentUser?.role === 'factory' && currentUser.manufacturer_id === manufacturerId) {
      return currentUser.manufacturer_name || '-';
    }
    return '-';
  };

  // Selection helpers
  const isAllSelected = users.length > 0 && users.every((u) => selectedUserIds.has(u.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(users.map((u) => u.id)));
    }
  };

  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  // Coupon modal functions
  const fetchActiveCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const response = await fetch('/api/admin/coupons');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '쿠폰 목록을 불러오는데 실패했습니다.');
      }
      const payload = await response.json();
      const allCoupons: Coupon[] = payload?.data || [];
      const now = new Date();
      setActiveCoupons(
        allCoupons.filter((c) => c.is_active && (!c.expires_at || new Date(c.expires_at) > now))
      );
    } catch (err) {
      console.error('Error fetching coupons:', err);
      setActiveCoupons([]);
      setError(err instanceof Error ? err.message : '쿠폰 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoadingCoupons(false);
    }
  };

  const openCouponModal = (userIds: string[]) => {
    setCouponTargetUserIds(userIds);
    setSelectedCouponId(null);
    setShowCouponModal(true);
    fetchActiveCoupons();
  };

  const handleIssueCoupon = async () => {
    if (!selectedCouponId || couponTargetUserIds.length === 0) return;
    setIssuingCoupon(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch('/api/admin/coupons/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couponId: selectedCouponId,
          userIds: couponTargetUserIds,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '쿠폰 발급에 실패했습니다.');
      }

      const payload = await response.json();
      const { issued = 0, skipped = 0 } = payload.data ?? {};

      let msg = `${issued}명에게 쿠폰이 발급되었습니다.`;
      if (skipped > 0) {
        msg += ` (${skipped}명 중복 건너뜀)`;
      }
      setSuccessMessage(msg);
      setShowCouponModal(false);
      setSelectedUserIds(new Set());

      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error issuing coupon:', err);
      setError(err instanceof Error ? err.message : '쿠폰 발급에 실패했습니다.');
    } finally {
      setIssuingCoupon(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">사용자 관리</h2>
          <p className="text-xs text-gray-500 mt-1">총 {total}명의 사용자</p>
        </div>
        {isAdminLike(currentUser?.role) && selectedUserIds.size > 0 && (
          <button
            onClick={() => openCouponModal(Array.from(selectedUserIds))}
            className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Ticket className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-xs">쿠폰 발급하기 ({selectedUserIds.size}명)</span>
            <span className="sm:hidden text-xs">쿠폰 ({selectedUserIds.size})</span>
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-800">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-center gap-3">
          <Ticket className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Search & Filters */}
      <div className="bg-white border border-gray-200/60 rounded-md p-2 sm:p-3 shadow-sm space-y-2 sm:space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이메일, 이름, 전화번호로 검색..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {isAdminLike(currentUser?.role) && (
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'all', label: '전체' },
              { value: 'customer', label: '일반 사용자' },
              { value: 'factory', label: '공장' },
              { value: 'admin', label: '관리자' },
            ].map((filter) => (
              <button
                key={filter.value}
                onClick={() => { setFilterRole(filter.value); setCurrentPage(1); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterRole === filter.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {isAdminLike(currentUser?.role) && (
                  <th className="px-4 py-2 w-10">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </th>
                )}
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  사용자 ID
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  이메일
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  이름
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  전화번호
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  권한
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  공장
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  가입일
                </th>
                {isAdminLike(currentUser?.role) && (
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    작업
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {isAdminLike(currentUser?.role) && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(user.id)}
                        onChange={() => toggleSelectUser(user.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                      <div className="text-xs font-mono text-gray-600">{user.id.slice(0, 8)}...</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-xs font-medium text-gray-900">{user.email}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-xs text-gray-900">{user.name || '-'}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-xs text-gray-900">
                      {user.phone_number || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(
                        user.role
                      )}`}
                    >
                      {isAdminLike(user.role) && <Shield className="w-3 h-3" />}
                      {user.role === 'factory' && <FactoryIcon className="w-3 h-3" />}
                      {getRoleLabel(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {isAdminLike(currentUser?.role) && user.role === 'factory' ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={user.manufacturer_id || ''}
                          onChange={(event) =>
                            updateUserFactory(user.id, event.target.value || null)
                          }
                          disabled={loadingFactories || updatingFactoryId === user.id}
                          className="px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white text-gray-700 disabled:opacity-50"
                        >
                          <option value="">공장 선택</option>
                          {factories.map((factory) => (
                            <option key={factory.id} value={factory.id}>
                              {factory.name}
                            </option>
                          ))}
                        </select>
                        {updatingFactoryId === user.id && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                            처리중...
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">
                        {getFactoryName(user.manufacturer_id)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-xs text-gray-900">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {formatKstDateLong(user.created_at)}
                    </div>
                  </td>
                  {isAdminLike(currentUser?.role) && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <select
                          value={user.role}
                          onChange={(event) =>
                            updateUserRole(
                              user.id,
                              event.target.value as 'customer' | 'admin' | 'factory'
                            )
                          }
                          disabled={updatingUserId === user.id}
                          className="px-3 py-1.5 text-xs border border-gray-300 rounded-md bg-white text-gray-700 disabled:opacity-50"
                        >
                          <option value="customer">일반 사용자</option>
                          <option value="factory">공장</option>
                          <option value="admin">관리자</option>
                        </select>
                        {updatingUserId === user.id && (
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                            처리중...
                          </div>
                        )}
                        <button
                          onClick={() => openCouponModal([user.id])}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="쿠폰 발급"
                        >
                          <Ticket className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="md:hidden divide-y divide-gray-200">
          {isAdminLike(currentUser?.role) && users.length > 0 && (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              <span className="text-[11px] text-gray-600">전체 선택</span>
            </div>
          )}
          {users.map((user) => (
            <div key={user.id} className="p-3 space-y-2">
              <div className="flex items-start gap-2">
                {isAdminLike(currentUser?.role) && (
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(user.id)}
                    onChange={() => toggleSelectUser(user.id)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-900 truncate">{user.email}</div>
                      <div className="text-[11px] text-gray-500">{user.name || '-'}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${getRoleColor(user.role)}`}>
                      {isAdminLike(user.role) && <Shield className="w-3 h-3" />}
                      {user.role === 'factory' && <FactoryIcon className="w-3 h-3" />}
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-1">
                    <span className="flex items-center gap-1"><UserIcon className="w-3 h-3 text-gray-400" />{user.id.slice(0, 8)}...</span>
                    <span>{user.phone_number || '-'}</span>
                    <span>{getFactoryName(user.manufacturer_id)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-0.5">
                    <Calendar className="w-3 h-3" />
                    {formatKstDateLong(user.created_at)}
                  </div>
                  {isAdminLike(currentUser?.role) && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <select
                        value={user.role}
                        onChange={(e) => updateUserRole(user.id, e.target.value as 'customer' | 'admin' | 'factory')}
                        disabled={updatingUserId === user.id}
                        className="px-2 py-1 text-[11px] border border-gray-300 rounded bg-white text-gray-700 disabled:opacity-50"
                      >
                        <option value="customer">일반 사용자</option>
                        <option value="factory">공장</option>
                        <option value="admin">관리자</option>
                      </select>
                      {user.role === 'factory' && (
                        <select
                          value={user.manufacturer_id || ''}
                          onChange={(e) => updateUserFactory(user.id, e.target.value || null)}
                          disabled={loadingFactories || updatingFactoryId === user.id}
                          className="px-2 py-1 text-[11px] border border-gray-300 rounded bg-white text-gray-700 disabled:opacity-50"
                        >
                          <option value="">공장 선택</option>
                          {factories.map((factory) => (
                            <option key={factory.id} value={factory.id}>{factory.name}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => openCouponModal([user.id])}
                        className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors ml-auto"
                        title="쿠폰 발급"
                      >
                        <Ticket className="w-3.5 h-3.5" />
                      </button>
                      {(updatingUserId === user.id || updatingFactoryId === user.id) && (
                        <div className="flex items-center gap-1 text-[11px] text-gray-500">
                          <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                          처리중...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {users.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-900 mb-1">사용자가 없습니다</h3>
            <p className="text-xs text-gray-500">등록된 사용자가 없습니다.</p>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {total}명 중 {(currentPage - 1) * limit + 1}-{Math.min(currentPage * limit, total)}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                이전
              </button>
              <span className="text-xs text-gray-700">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                다음
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Coupon Selection Modal */}
      {showCouponModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-sm font-semibold">쿠폰 발급</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {couponTargetUserIds.length}명의 사용자에게 쿠폰을 발급합니다.
                </p>
              </div>
              <button
                onClick={() => setShowCouponModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {loadingCoupons ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : activeCoupons.length === 0 ? (
                <div className="text-center py-8">
                  <Ticket className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-xs text-gray-500">발급 가능한 활성 쿠폰이 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeCoupons.map((coupon) => (
                    <label
                      key={coupon.id}
                      className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors ${
                        selectedCouponId === coupon.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="coupon"
                        value={coupon.id}
                        checked={selectedCouponId === coupon.id}
                        onChange={() => setSelectedCouponId(coupon.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-medium text-gray-900">
                            {coupon.code}
                          </span>
                          <span className="text-xs text-blue-600 font-medium">
                            {coupon.discount_type === 'percentage'
                              ? `${coupon.discount_value}%`
                              : `${coupon.discount_value.toLocaleString()}원`}
                          </span>
                        </div>
                        {coupon.display_name && (
                          <p className="text-xs text-gray-500 truncate">{coupon.display_name}</p>
                        )}
                        {coupon.max_uses && (
                          <p className="text-xs text-gray-400">
                            사용 {coupon.current_uses} / {coupon.max_uses}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowCouponModal(false)}
                className="px-3 py-1.5 text-xs text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleIssueCoupon}
                disabled={!selectedCouponId || issuingCoupon}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {issuingCoupon ? '발급 중...' : '발급하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
