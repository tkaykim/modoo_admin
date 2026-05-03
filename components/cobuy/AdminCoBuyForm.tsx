'use client';

import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Search,
  User,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { Product, CoBuyCustomField, CoBuyPricingTier, CoBuySession } from '@/types/types';
import CustomFieldBuilder from './CustomFieldBuilder';
import { formatDatetimeLocalKst } from '@/lib/kst';

interface AdminCoBuyFormProps {
  product: Product | null;
  savedDesignId: string | null;
  cobuyImageUrls?: string[];
  onSuccess: (session: CoBuySession) => void;
  onBack: () => void;
}

interface UserSearchResult {
  id: string;
  email: string;
  phone_number: string | null;
}

export default function AdminCoBuyForm({
  product,
  savedDesignId,
  cobuyImageUrls,
  onSuccess,
  onBack,
}: AdminCoBuyFormProps) {
  const isImageMode = !!cobuyImageUrls?.length && !savedDesignId;

  // Basic info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [receiveByDate, setReceiveByDate] = useState('');

  // Quantity settings
  const [minQuantity, setMinQuantity] = useState<string>('');
  const [maxQuantity, setMaxQuantity] = useState<string>('');

  // Design price
  const [designPrice, setDesignPrice] = useState<number | null>(null);

  // Manual price (image mode)
  const [manualPrice, setManualPrice] = useState<string>('');

  // Manual size options (image mode without product)
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  const [sizeInput, setSizeInput] = useState<string>('');

  // Pricing tiers
  const [pricingTiers, setPricingTiers] = useState<CoBuyPricingTier[]>([]);

  // Payment mode
  const [paymentMode, setPaymentMode] = useState<'individual' | 'survey'>('individual');
  const [sizePrices, setSizePrices] = useState<Record<string, string>>({});

  // Custom fields
  const [customFields, setCustomFields] = useState<CoBuyCustomField[]>([]);

  // User linking
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const generateTiersFromPrice = (price: number) => {
    const round = (v: number) => Math.round(v / 100) * 100;
    return [
      { minQuantity: 10, pricePerItem: round(price) },
      { minQuantity: 30, pricePerItem: round(price * 0.95) },
      { minQuantity: 50, pricePerItem: round(price * 0.9) },
      { minQuantity: 100, pricePerItem: round(price * 0.85) },
    ];
  };

  const defaultTiers: CoBuyPricingTier[] = [
    { minQuantity: 10, pricePerItem: 25000 },
    { minQuantity: 30, pricePerItem: 22000 },
    { minQuantity: 50, pricePerItem: 20000 },
    { minQuantity: 100, pricePerItem: 18000 },
  ];

  // Fetch design price (design mode only)
  useEffect(() => {
    if (isImageMode || !savedDesignId) {
      setPricingTiers(defaultTiers);
      return;
    }

    const fetchDesignPrice = async () => {
      try {
        const response = await fetch(`/api/admin/designs/${savedDesignId}`);
        if (!response.ok) return;
        const { data } = await response.json();
        const price = data?.price_per_item;
        if (price && typeof price === 'number') {
          setDesignPrice(price);
          setPricingTiers(generateTiersFromPrice(price));
        } else {
          setPricingTiers(defaultTiers);
        }
      } catch {
        setPricingTiers(defaultTiers);
      }
    };
    fetchDesignPrice();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedDesignId, isImageMode]);

  // Update pricing tiers when manual price changes
  const handleManualPriceChange = (value: string) => {
    setManualPrice(value);
    const price = parseInt(value);
    if (price && price > 0) {
      setPricingTiers(generateTiersFromPrice(price));
    }
  };

  // Initialize custom fields with size field
  useEffect(() => {
    if (isImageMode && !product) {
      // Image mode without product: no auto size field, admin will add via sizeOptionsText
      setCustomFields([]);
      return;
    }

    const sizeOptions = product?.size_options || [];
    const sizeLabels = sizeOptions.map((opt) =>
      typeof opt === 'string' ? opt : opt.label
    );
    const sizeField: CoBuyCustomField = {
      id: 'size',
      type: 'dropdown',
      label: '사이즈',
      required: true,
      fixed: true,
      options: sizeLabels,
    };
    setCustomFields([sizeField]);
  }, [product, isImageMode]);

  // Update size custom field when sizeOptions changes (image mode)
  useEffect(() => {
    if (!isImageMode || product) return;

    if (sizeOptions.length > 0) {
      const sizeField: CoBuyCustomField = {
        id: 'size',
        type: 'dropdown',
        label: '사이즈',
        required: true,
        fixed: true,
        options: sizeOptions,
      };
      setCustomFields((prev) => {
        const withoutSize = prev.filter((f) => f.id !== 'size');
        return [sizeField, ...withoutSize];
      });
    } else {
      setCustomFields((prev) => prev.filter((f) => f.id !== 'size'));
    }
  }, [sizeOptions, isImageMode, product]);

  // Set default dates
  useEffect(() => {
    const now = new Date();
    const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    setStartDate(formatDatetimeLocalKst(now));
    setEndDate(formatDatetimeLocalKst(oneWeekLater));
    setReceiveByDate(formatDatetimeLocalKst(twoWeeksLater));
  }, []);

  const handleUserSearch = async () => {
    if (!userSearchQuery.trim()) return;

    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      const response = await fetch(
        `/api/admin/users/search?q=${encodeURIComponent(userSearchQuery)}`
      );

      if (!response.ok) throw new Error('Failed to search users');

      const data = await response.json();
      setSearchResults(data.data || []);

      if (data.data?.length === 0) {
        setSearchError('검색 결과가 없습니다');
      }
    } catch (error) {
      console.error('User search error:', error);
      setSearchError('사용자 검색에 실패했습니다');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectUser = (user: UserSearchResult) => {
    setSelectedUser(user);
    setSearchResults([]);
    setUserSearchQuery('');
  };

  const handleRemoveUser = () => {
    setSelectedUser(null);
  };

  const addPricingTier = () => {
    const lastTier = pricingTiers[pricingTiers.length - 1];
    const newQuantity = lastTier ? lastTier.minQuantity + 50 : 10;
    const newPrice = lastTier ? Math.max(10000, lastTier.pricePerItem - 2000) : 25000;
    setPricingTiers([...pricingTiers, { minQuantity: newQuantity, pricePerItem: newPrice }]);
  };

  const updatePricingTier = (index: number, field: 'minQuantity' | 'pricePerItem', value: number) => {
    const updated = [...pricingTiers];
    updated[index] = { ...updated[index], [field]: value };
    updated.sort((a, b) => a.minQuantity - b.minQuantity);
    setPricingTiers(updated);
  };

  const removePricingTier = (index: number) => {
    setPricingTiers(pricingTiers.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('제목을 입력해주세요');
      return;
    }
    if (!startDate || !endDate) {
      setError('시작일과 종료일을 입력해주세요');
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError('종료일은 시작일보다 이후여야 합니다');
      return;
    }
    if (!selectedUser) {
      setError('공동구매를 연결할 사용자를 선택해주세요');
      return;
    }
    if (isImageMode && (!manualPrice || parseInt(manualPrice) <= 0)) {
      setError('단가를 입력해주세요');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        userId: selectedUser.id,
        title: title.trim(),
        description: description.trim() || null,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        receiveByDate: receiveByDate ? new Date(receiveByDate).toISOString() : null,
        minQuantity: minQuantity ? parseInt(minQuantity) : null,
        maxQuantity: maxQuantity ? parseInt(maxQuantity) : null,
        pricingTiers,
        customFields,
      };

      payload.paymentMode = paymentMode;

      const parsedSizePrices: Record<string, number> = {};
      for (const [size, price] of Object.entries(sizePrices)) {
        const n = parseInt(price);
        if (n > 0) parsedSizePrices[size] = n;
      }
      if (Object.keys(parsedSizePrices).length > 0) {
        payload.sizePrices = parsedSizePrices;
      }

      if (isImageMode) {
        payload.cobuyImageUrls = cobuyImageUrls;
        payload.productId = product?.id || null;
        payload.pricePerItem = parseInt(manualPrice);
      } else {
        payload.savedDesignId = savedDesignId;
      }

      const response = await fetch('/api/admin/cobuy/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create CoBuy session');
      }

      const data = await response.json();
      onSuccess(data.data);
    } catch (error) {
      console.error('Error creating CoBuy:', error);
      setError(error instanceof Error ? error.message : '공동구매 생성에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-4 space-y-5">
        {/* User Selection */}
        <section className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
            <User className="w-4 h-4" />
            사용자 연결 <span className="text-red-500">*</span>
          </h3>

          {selectedUser ? (
            <div className="bg-white border border-blue-300 rounded-md p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{selectedUser.email}</p>
                  {selectedUser.phone_number && (
                    <p className="text-xs text-gray-500">{selectedUser.phone_number}</p>
                  )}
                </div>
              </div>
              <button onClick={handleRemoveUser} className="text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUserSearch()}
                  placeholder="이메일로 사용자 검색..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleUserSearch}
                  disabled={isSearching || !userSearchQuery.trim()}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  <Search className="w-4 h-4" />
                  {isSearching ? '...' : '검색'}
                </button>
              </div>

              {searchError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {searchError}
                </p>
              )}

              {searchResults.length > 0 && (
                <div className="bg-white border rounded-md divide-y max-h-36 overflow-auto">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className="w-full p-2 text-left hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900">{user.email}</p>
                      {user.phone_number && (
                        <p className="text-xs text-gray-500">{user.phone_number}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Basic Info */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">기본 정보</h3>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              공동구매 제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2024 신입생 단체 티셔츠"
              maxLength={100}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="공동구매에 대한 설명을 입력하세요"
              maxLength={500}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </section>

        {/* Size Options (image mode without product) */}
        {isImageMode && !product && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">사이즈 옵션</h3>
            <div>
              {sizeOptions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {sizeOptions.map((size, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium"
                    >
                      {size}
                      <button
                        type="button"
                        onClick={() => setSizeOptions((prev) => prev.filter((_, i) => i !== index))}
                        className="text-blue-400 hover:text-blue-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={sizeInput}
                  onChange={(e) => setSizeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const value = sizeInput.trim();
                      if (value && !sizeOptions.includes(value)) {
                        setSizeOptions((prev) => [...prev, value]);
                        setSizeInput('');
                      }
                    }
                  }}
                  placeholder="예: S, M, L"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const value = sizeInput.trim();
                    if (value && !sizeOptions.includes(value)) {
                      setSizeOptions((prev) => [...prev, value]);
                      setSizeInput('');
                    }
                  }}
                  disabled={!sizeInput.trim()}
                  className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  추가
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">비워두면 사이즈 선택 없이 진행됩니다</p>
            </div>
          </section>
        )}

        {/* Dates */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">일정</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                종료일 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              수령 예정일 (선택)
            </label>
            <input
              type="datetime-local"
              value={receiveByDate}
              onChange={(e) => setReceiveByDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </section>

        {/* Quantity Settings */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">수량 설정</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                최소 수량 (선택)
              </label>
              <input
                type="number"
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
                placeholder="예: 10"
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                최대 수량 (선택)
              </label>
              <input
                type="number"
                value={maxQuantity}
                onChange={(e) => setMaxQuantity(e.target.value)}
                placeholder="무제한"
                min={1}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Pricing Tiers */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">가격 구간</h3>
            {!isImageMode && designPrice && (
              <span className="text-xs text-gray-500">
                원가: <span className="font-medium text-gray-800">{designPrice.toLocaleString()}원</span>
              </span>
            )}
          </div>

          {/* Manual price input for image mode */}
          {isImageMode && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                단가 (개당 가격) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={manualPrice}
                  onChange={(e) => handleManualPriceChange(e.target.value)}
                  placeholder="예: 25000"
                  min={1}
                  step={1000}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">원</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">입력하면 가격 구간이 자동으로 생성됩니다</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_32px] gap-2 text-xs text-gray-500 px-0.5">
              <span>최소 수량</span>
              <span>개당 가격</span>
              <span />
            </div>
            {pricingTiers.map((tier, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
                <div className="relative">
                  <input
                    type="number"
                    value={tier.minQuantity}
                    onChange={(e) => updatePricingTier(index, 'minQuantity', parseInt(e.target.value) || 0)}
                    min={1}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">벌 이상</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={tier.pricePerItem}
                    onChange={(e) => updatePricingTier(index, 'pricePerItem', parseInt(e.target.value) || 0)}
                    min={0}
                    step={1000}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">원</span>
                </div>
                <button
                  onClick={() => removePricingTier(index)}
                  disabled={pricingTiers.length <= 1}
                  className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addPricingTier}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            가격 구간 추가
          </button>
        </section>

        {/* Payment Mode */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">결제 방식</h3>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="paymentMode"
                value="individual"
                checked={paymentMode === 'individual'}
                onChange={() => setPaymentMode('individual')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">각각 결제</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="paymentMode"
                value="survey"
                checked={paymentMode === 'survey'}
                onChange={() => setPaymentMode('survey')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">수요조사 후 대표자 일괄결제</span>
            </label>
          </div>
          {paymentMode === 'survey' && (
            <p className="text-xs text-gray-500">
              참여자는 결제 없이 수량/사이즈만 선택하고, 모집 완료 후 대표자가 일괄 결제합니다.
            </p>
          )}
        </section>

        {/* Size-based Pricing (survey mode) */}
        {paymentMode === 'survey' && (() => {
          const availableSizes = isImageMode && !product
            ? sizeOptions
            : (product?.size_options || []).map((opt) =>
                typeof opt === 'string' ? opt : opt.label
              );
          return availableSizes.length > 0 ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">사이즈별 가격 (선택)</h3>
              <p className="text-xs text-gray-500">
                사이즈마다 다른 가격을 설정할 수 있습니다. 비워두면 가격 구간의 기본 단가가 적용됩니다.
              </p>
              <div className="space-y-2">
                {availableSizes.map((size) => (
                  <div key={size} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 w-16">{size}</span>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={sizePrices[size] || ''}
                        onChange={(e) =>
                          setSizePrices((prev) => ({ ...prev, [size]: e.target.value }))
                        }
                        placeholder="기본 단가 사용"
                        min={0}
                        step={1000}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">원</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null;
        })()}

        {/* Custom Fields */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">참여자 정보 수집</h3>
          <p className="text-xs text-gray-500">
            {isImageMode && !product
              ? '참여자로부터 수집할 추가 정보를 설정하세요.'
              : '참여자로부터 수집할 정보를 설정하세요. 사이즈는 기본으로 포함됩니다.'}
          </p>

          <CustomFieldBuilder
            fields={customFields}
            onChange={setCustomFields}
            maxFields={10}
          />
        </section>

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="pt-3 border-t">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-3 bg-blue-600 text-white text-sm rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                생성 중...
              </>
            ) : (
              '공동구매 생성하기'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
