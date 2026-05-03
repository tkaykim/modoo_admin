'use client';

import { useState, useEffect, useCallback } from 'react';
import { Coupon, CouponUsage } from '@/types/types';
import {
  Ticket,
  Plus,
  Calendar,
  AlertCircle,
  X,
  Percent,
  Banknote,
  Users,
  Edit2,
  Trash2,
  Eye,
} from 'lucide-react';
import { formatKstDateShort, formatKstDateTimeMedium } from '@/lib/kst';

type FilterStatus = 'all' | 'active' | 'expired' | 'inactive';

interface CouponWithUsages extends Coupon {
  usages?: CouponUsage[];
}

export default function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponWithUsages | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed_amount',
    discount_value: '',
    min_order_amount: '0',
    max_discount_amount: '',
    max_uses: '',
    is_active: true,
    expires_at: '',
    valid_days_after_registration: '',
  });

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/coupons');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '쿠폰 목록을 불러오는데 실패했습니다.');
      }
      const payload = await response.json();
      setCoupons(payload?.data || []);
    } catch (error) {
      console.error('Error fetching coupons:', error);
      setCoupons([]);
      setError(error instanceof Error ? error.message : '쿠폰 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const filteredCoupons = coupons.filter((coupon) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') {
      const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
      return coupon.is_active && !isExpired;
    }
    if (filterStatus === 'expired') {
      return coupon.expires_at && new Date(coupon.expires_at) < new Date();
    }
    if (filterStatus === 'inactive') {
      return !coupon.is_active;
    }
    return true;
  });

  const resetForm = () => {
    setFormData({
      code: '',
      display_name: '',
      description: '',
      discount_type: 'percentage',
      discount_value: '',
      min_order_amount: '0',
      max_discount_amount: '',
      max_uses: '',
      is_active: true,
      expires_at: '',
      valid_days_after_registration: '',
    });
  };

  const handleCreate = async () => {
    setActionLoading('create');
    setError(null);
    try {
      const response = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code,
          display_name: formData.display_name || null,
          description: formData.description || null,
          discount_type: formData.discount_type,
          discount_value: Number(formData.discount_value),
          min_order_amount: Number(formData.min_order_amount) || 0,
          max_discount_amount: formData.max_discount_amount ? Number(formData.max_discount_amount) : null,
          max_uses: formData.max_uses ? Number(formData.max_uses) : null,
          is_active: formData.is_active,
          expires_at: formData.expires_at || null,
          valid_days_after_registration: formData.valid_days_after_registration
            ? Number(formData.valid_days_after_registration)
            : null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '쿠폰 생성에 실패했습니다.');
      }

      const payload = await response.json();
      if (payload.data) {
        setCoupons((prev) => [payload.data, ...prev]);
      }
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error('Error creating coupon:', error);
      setError(error instanceof Error ? error.message : '쿠폰 생성에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdate = async () => {
    if (!selectedCoupon) return;
    setActionLoading('update');
    setError(null);
    try {
      const response = await fetch('/api/admin/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedCoupon.id,
          code: formData.code,
          display_name: formData.display_name || null,
          description: formData.description || null,
          discount_type: formData.discount_type,
          discount_value: Number(formData.discount_value),
          min_order_amount: Number(formData.min_order_amount) || 0,
          max_discount_amount: formData.max_discount_amount ? Number(formData.max_discount_amount) : null,
          max_uses: formData.max_uses ? Number(formData.max_uses) : null,
          is_active: formData.is_active,
          expires_at: formData.expires_at || null,
          valid_days_after_registration: formData.valid_days_after_registration
            ? Number(formData.valid_days_after_registration)
            : null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '쿠폰 수정에 실패했습니다.');
      }

      const payload = await response.json();
      if (payload.data) {
        setCoupons((prev) =>
          prev.map((c) => (c.id === selectedCoupon.id ? payload.data : c))
        );
      }
      setShowEditModal(false);
      setSelectedCoupon(null);
      resetForm();
    } catch (error) {
      console.error('Error updating coupon:', error);
      setError(error instanceof Error ? error.message : '쿠폰 수정에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (couponId: string) => {
    if (!confirm('정말로 이 쿠폰을 삭제하시겠습니까?')) return;
    setActionLoading(couponId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/coupons?id=${couponId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '쿠폰 삭제에 실패했습니다.');
      }

      const payload = await response.json();
      if (payload.data?.deactivated) {
        // Coupon was deactivated instead of deleted
        setCoupons((prev) =>
          prev.map((c) => (c.id === couponId ? { ...c, is_active: false } : c))
        );
      } else {
        // Coupon was deleted
        setCoupons((prev) => prev.filter((c) => c.id !== couponId));
      }
    } catch (error) {
      console.error('Error deleting coupon:', error);
      setError(error instanceof Error ? error.message : '쿠폰 삭제에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewUsages = async (coupon: Coupon) => {
    setActionLoading(coupon.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/coupons?id=${coupon.id}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '쿠폰 정보를 불러오는데 실패했습니다.');
      }
      const payload = await response.json();
      setSelectedCoupon(payload.data);
      setShowUsageModal(true);
    } catch (error) {
      console.error('Error fetching coupon details:', error);
      setError(error instanceof Error ? error.message : '쿠폰 정보를 불러오는데 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const openEditModal = (coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setFormData({
      code: coupon.code,
      display_name: coupon.display_name || '',
      description: coupon.description || '',
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order_amount: String(coupon.min_order_amount),
      max_discount_amount: coupon.max_discount_amount ? String(coupon.max_discount_amount) : '',
      max_uses: coupon.max_uses ? String(coupon.max_uses) : '',
      is_active: coupon.is_active,
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 16) : '',
      valid_days_after_registration: coupon.valid_days_after_registration
        ? String(coupon.valid_days_after_registration)
        : '',
    });
    setShowEditModal(true);
  };

  const formatDate = (dateString: string | null) =>
    dateString ? formatKstDateShort(dateString) : '-';

  const formatDateTime = (dateString: string | null) =>
    dateString ? formatKstDateTimeMedium(dateString) : '-';

  const getStatusBadge = (coupon: Coupon) => {
    const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
    if (!coupon.is_active) {
      return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">비활성</span>;
    }
    if (isExpired) {
      return <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">만료</span>;
    }
    return <span className="px-2 py-0.5 bg-green-100 text-green-600 text-xs rounded-full">활성</span>;
  };

  const getDiscountDisplay = (coupon: Coupon) => {
    if (coupon.discount_type === 'percentage') {
      return `${coupon.discount_value}%`;
    }
    return `${coupon.discount_value.toLocaleString()}원`;
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
          <h2 className="text-base sm:text-xl font-semibold text-gray-900">쿠폰 관리</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">총 {coupons.length}개의 쿠폰</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">쿠폰 추가</span>
          <span className="sm:hidden">추가</span>
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200/60 rounded-md p-2 sm:p-3 shadow-sm">
        <div className="flex gap-2 flex-wrap">
          {[
            { value: 'all', label: '전체' },
            { value: 'active', label: '활성' },
            { value: 'expired', label: '만료' },
            { value: 'inactive', label: '비활성' },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setFilterStatus(filter.value as FilterStatus)}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors ${
                filterStatus === filter.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Coupons Table */}
      <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  코드
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  이름
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  할인
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  사용
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  만료일
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCoupons.map((coupon) => (
                <tr key={coupon.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Ticket className="w-4 h-4 text-gray-400" />
                      <span className="font-mono font-medium text-gray-900">{coupon.code}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-sm text-gray-700">{coupon.display_name || '-'}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {coupon.discount_type === 'percentage' ? (
                        <Percent className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Banknote className="w-4 h-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {getDiscountDisplay(coupon)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">
                        {coupon.current_uses}
                        {coupon.max_uses ? ` / ${coupon.max_uses}` : ''}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{getStatusBadge(coupon)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {coupon.valid_days_after_registration
                        ? `등록 후 ${coupon.valid_days_after_registration}일`
                        : formatDate(coupon.expires_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewUsages(coupon)}
                        disabled={actionLoading === coupon.id}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                        title="사용 내역"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(coupon)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="수정"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(coupon.id)}
                        disabled={actionLoading === coupon.id}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card List */}
        <div className="md:hidden divide-y divide-gray-200">
          {filteredCoupons.map((coupon) => (
            <div key={coupon.id} className="p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Ticket className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="font-mono text-xs font-medium text-gray-900 truncate">{coupon.code}</span>
                </div>
                {getStatusBadge(coupon)}
              </div>
              {coupon.display_name && <div className="text-[11px] text-gray-600">{coupon.display_name}</div>}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                <span className="flex items-center gap-0.5">
                  {coupon.discount_type === 'percentage' ? <Percent className="w-3 h-3 text-blue-500" /> : <Banknote className="w-3 h-3 text-green-500" />}
                  <span className="font-medium text-gray-700">{getDiscountDisplay(coupon)}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <Users className="w-3 h-3 text-gray-400" />
                  {coupon.current_uses}{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}
                </span>
                <span className="flex items-center gap-0.5">
                  <Calendar className="w-3 h-3 text-gray-400" />
                  {coupon.valid_days_after_registration ? `등록 후 ${coupon.valid_days_after_registration}일` : formatDate(coupon.expires_at)}
                </span>
              </div>
              <div className="flex items-center gap-1 pt-0.5">
                <button onClick={() => handleViewUsages(coupon)} disabled={actionLoading === coupon.id} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50" title="사용 내역"><Eye className="w-3.5 h-3.5" /></button>
                <button onClick={() => openEditModal(coupon)} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(coupon.id)} disabled={actionLoading === coupon.id} className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 ml-auto" title="삭제"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>

        {filteredCoupons.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <Ticket className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-2">쿠폰이 없습니다</h3>
            <p className="text-xs sm:text-sm text-gray-500">새 쿠폰을 추가해 보세요.</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                {showCreateModal ? '쿠폰 추가' : '쿠폰 수정'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedCoupon(null);
                  resetForm();
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  쿠폰 코드 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="예: WELCOME2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">표시 이름</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="예: 신규회원 할인"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="쿠폰 설명 (관리자용)"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Discount Type and Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    할인 유형 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.discount_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discount_type: e.target.value as 'percentage' | 'fixed_amount',
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="percentage">퍼센트 (%)</option>
                    <option value="fixed_amount">정액 (원)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    할인 값 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                    placeholder={formData.discount_type === 'percentage' ? '예: 10' : '예: 5000'}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Min Order Amount and Max Discount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">최소 주문 금액</label>
                  <input
                    type="number"
                    value={formData.min_order_amount}
                    onChange={(e) => setFormData({ ...formData, min_order_amount: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    최대 할인 금액
                    {formData.discount_type === 'percentage' && (
                      <span className="text-gray-400 text-xs ml-1">(% 할인 시)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={formData.max_discount_amount}
                    onChange={(e) => setFormData({ ...formData, max_discount_amount: e.target.value })}
                    placeholder="무제한"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Max Uses */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">최대 사용 횟수</label>
                <input
                  type="number"
                  value={formData.max_uses}
                  onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                  placeholder="무제한"
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Expiry Options */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">만료 설정</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">만료일</label>
                    <input
                      type="datetime-local"
                      value={formData.expires_at}
                      onChange={(e) =>
                        setFormData({ ...formData, expires_at: e.target.value, valid_days_after_registration: '' })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">또는 등록 후 유효 일수</label>
                    <input
                      type="number"
                      value={formData.valid_days_after_registration}
                      onChange={(e) =>
                        setFormData({ ...formData, valid_days_after_registration: e.target.value, expires_at: '' })
                      }
                      placeholder="예: 30"
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400">만료일 또는 등록 후 유효 일수 중 하나만 설정하세요.</p>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="text-sm text-gray-700">
                  활성화
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                  setSelectedCoupon(null);
                  resetForm();
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              >
                취소
              </button>
              <button
                onClick={showCreateModal ? handleCreate : handleUpdate}
                disabled={actionLoading !== null}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? '처리중...' : showCreateModal ? '추가' : '수정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage History Modal */}
      {showUsageModal && selectedCoupon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="text-lg font-semibold">사용 내역</h3>
                <p className="text-sm text-gray-500">
                  {selectedCoupon.code} - {selectedCoupon.display_name || '이름 없음'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowUsageModal(false);
                  setSelectedCoupon(null);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {selectedCoupon.usages && selectedCoupon.usages.length > 0 ? (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        사용자
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        등록일
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        사용일
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        할인 금액
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedCoupon.usages.map((usage) => (
                      <tr key={usage.id}>
                        <td className="px-3 py-2 text-sm text-gray-900">
                          {usage.user?.email || usage.user_id.slice(0, 8) + '...'}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {formatDateTime(usage.registered_at)}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {usage.used_at ? (
                            <span className="text-green-600">{formatDateTime(usage.used_at)}</span>
                          ) : (
                            <span className="text-gray-400">미사용</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900">
                          {usage.discount_applied
                            ? `${usage.discount_applied.toLocaleString()}원`
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">아직 사용 내역이 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
