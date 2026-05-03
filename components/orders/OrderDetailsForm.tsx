'use client';

import { useState, useMemo } from 'react';
import { ArrowLeft, Loader2, Search, MapPin, Tag, Percent, DollarSign, CreditCard, Building2, Link2, Plus, Package } from 'lucide-react';
import AddressSearch from './AddressSearch';
import { type OrderItemDraft, type OrderCreateResult, type CustomerEditableFields, getItemUnitPrice, getItemTotalQuantity, getItemSubtotal } from './AdminOrderCreator';

type ShippingMethod = 'pickup' | 'domestic';
type OrderPricingMode = 'auto' | 'custom_total';
type PaymentType = 'completed' | 'bank_transfer' | 'customer_payment';
type AdminDiscountType = 'fixed' | 'percentage';

interface ShippingAddress {
  postalCode: string;
  state: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
}

interface CouponInfo {
  couponId: string;
  code: string;
  displayName: string;
  discountAmount: number;
  discountText: string;
}

interface OrderDetailsFormProps {
  items: OrderItemDraft[];
  customerEditableFields?: CustomerEditableFields;
  onCustomerEditableFieldsChange?: (fields: CustomerEditableFields) => void;
  onSubmit: (orderId: string, result?: OrderCreateResult) => void;
  onBack: () => void;
}

export default function OrderDetailsForm({ items, customerEditableFields, onCustomerEditableFieldsChange, onSubmit, onBack }: OrderDetailsFormProps) {
  const hasAnyEditable = !!(customerEditableFields?.quantities || customerEditableFields?.customerInfo || customerEditableFields?.shipping);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('pickup');
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    postalCode: '', state: '', city: '', addressLine1: '', addressLine2: '',
  });

  const [pricingMode, setPricingMode] = useState<OrderPricingMode>('auto');
  const [customTotalPrice, setCustomTotalPrice] = useState<string>('');
  const [couponCode, setCouponCode] = useState('');
  const [couponInfo, setCouponInfo] = useState<CouponInfo | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isCouponValidating, setIsCouponValidating] = useState(false);
  const [adminDiscountType, setAdminDiscountType] = useState<AdminDiscountType>('fixed');
  const [adminDiscountValue, setAdminDiscountValue] = useState<string>('');
  const [adminSurcharge, setAdminSurcharge] = useState<string>('');
  const [pricingNote, setPricingNote] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>(hasAnyEditable ? 'customer_payment' : 'completed');

  const totalQuantity = useMemo(
    () => items.reduce((sum, item) => sum + getItemTotalQuantity(item), 0),
    [items],
  );

  const originalAmount = useMemo(
    () => items.reduce((sum, item) => sum + getItemSubtotal(item), 0),
    [items],
  );

  const computedAdminDiscount = useMemo(() => {
    const val = parseFloat(adminDiscountValue) || 0;
    if (val <= 0) return 0;
    if (adminDiscountType === 'percentage') return Math.floor(originalAmount * (val / 100));
    return val;
  }, [adminDiscountValue, adminDiscountType, originalAmount]);

  const computedSurcharge = useMemo(
    () => Math.max(0, parseFloat(adminSurcharge) || 0),
    [adminSurcharge],
  );

  const deliveryFee = useMemo(
    () => shippingMethod === 'domestic' ? 3000 : 0,
    [shippingMethod],
  );

  const computedCouponDiscount = useMemo(
    () => couponInfo?.discountAmount ?? 0,
    [couponInfo],
  );

  const totalAmount = useMemo(() => {
    if (pricingMode === 'custom_total') {
      const parsed = parseFloat(customTotalPrice);
      return parsed > 0 ? parsed : 0;
    }
    return Math.max(0, originalAmount + deliveryFee - computedCouponDiscount - computedAdminDiscount + computedSurcharge);
  }, [pricingMode, customTotalPrice, originalAmount, deliveryFee, computedCouponDiscount, computedAdminDiscount, computedSurcharge]);

  const handleCouponValidate = async (silent = false) => {
    const code = couponCode.trim();
    if (!code) {
      if (!silent) setCouponError('쿠폰 코드를 입력해주세요.');
      return;
    }
    setIsCouponValidating(true);
    setCouponError(null);
    try {
      const res = await fetch('/api/admin/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, orderTotal: originalAmount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponInfo(null);
        if (!silent) setCouponError(data.error || '쿠폰 검증에 실패했습니다.');
        return;
      }
      setCouponInfo({
        couponId: data.data.couponId,
        code: data.data.code,
        displayName: data.data.displayName,
        discountAmount: data.data.discountAmount,
        discountText: data.data.discountText,
      });
      setCouponError(null);
    } catch {
      if (!silent) setCouponError('쿠폰 검증 중 오류가 발생했습니다.');
    } finally {
      setIsCouponValidating(false);
    }
  };

  const handleCouponRemove = () => {
    setCouponInfo(null);
    setCouponCode('');
    setCouponError(null);
  };

  const handleSubmit = async () => {
    setError(null);

    const ceq = customerEditableFields?.quantities;
    const ceInfo = customerEditableFields?.customerInfo;
    const ceShip = customerEditableFields?.shipping;

    if (!ceInfo && !customerName.trim()) { setError('고객 이름을 입력해주세요.'); return; }
    if (!ceInfo && !customerEmail.trim()) { setError('고객 이메일을 입력해주세요.'); return; }
    if (!ceInfo && customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) { setError('올바른 이메일 형식을 입력해주세요.'); return; }
    if (!ceq && totalQuantity <= 0) { setError('최소 하나 이상의 수량을 선택해주세요.'); return; }
    if (pricingMode === 'custom_total' && totalAmount <= 0) { setError('전체 금액을 입력해주세요.'); return; }
    if (!ceShip && shippingMethod === 'domestic' && (!shippingAddress.postalCode || !shippingAddress.addressLine1)) {
      setError('배송 주소를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    const effectivePaymentType = hasAnyEditable ? 'customer_payment' : paymentType;

    try {
      const response = await fetch('/api/admin/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            designId: item.designId,
            productId: item.productId,
            variants: ceq ? item.variants : item.variants.filter(v => v.quantity > 0),
            pricingMode: item.pricingMode,
            customUnitPrice: item.pricingMode === 'custom_unit_price' ? getItemUnitPrice(item) : undefined,
          })),
          customerName: customerName.trim() || (ceInfo ? '고객 입력 대기' : ''),
          customerEmail: customerEmail.trim() || (ceInfo ? 'pending@placeholder.com' : ''),
          customerPhone: customerPhone.trim() || undefined,
          notes: notes.trim() || undefined,
          shippingMethod,
          deliveryFee,
          ...(shippingMethod === 'domestic' && {
            postalCode: shippingAddress.postalCode,
            state: shippingAddress.state,
            city: shippingAddress.city,
            addressLine1: shippingAddress.addressLine1,
            addressLine2: shippingAddress.addressLine2 || undefined,
          }),
          pricingMode,
          customTotalPrice: pricingMode === 'custom_total' ? totalAmount : undefined,
          couponCode: pricingMode !== 'custom_total' ? (couponInfo?.code || undefined) : undefined,
          couponId: pricingMode !== 'custom_total' ? (couponInfo?.couponId || undefined) : undefined,
          couponDiscount: pricingMode !== 'custom_total' ? (computedCouponDiscount || undefined) : undefined,
          adminDiscount: pricingMode !== 'custom_total' ? (computedAdminDiscount || undefined) : undefined,
          adminDiscountType: pricingMode !== 'custom_total' && computedAdminDiscount > 0 ? adminDiscountType : undefined,
          adminSurcharge: pricingMode !== 'custom_total' ? (computedSurcharge || undefined) : undefined,
          pricingNote: pricingNote.trim() || undefined,
          paymentType: effectivePaymentType,
          ...(hasAnyEditable && { customerEditableFields }),
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '주문 생성에 실패했습니다.');
      onSubmit(result.data.orderId, result.data as OrderCreateResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주문 생성에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          <span>제품 목록으로</span>
        </button>
        <h2 className="text-2xl font-bold">주문 정보 입력</h2>
        <p className="text-gray-500 mt-1">고객 정보, 배송, 가격 조정 및 결제 방식을 설정하세요</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}

      {/* Items Summary */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">주문 상품</h3>
        <div className="space-y-3">
          {items.map((item, idx) => {
            const qty = getItemTotalQuantity(item);
            const unitP = getItemUnitPrice(item);
            const sub = getItemSubtotal(item);
            return (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-12 h-12 bg-white rounded-lg overflow-hidden shrink-0 flex items-center justify-center border border-gray-200">
                  {item.designPreviewUrl || item.productThumbnail ? (
                    <img src={item.designPreviewUrl || item.productThumbnail!} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <Package className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{idx + 1}. {item.productTitle}</p>
                  <p className="text-xs text-gray-500">{unitP.toLocaleString()}원 × {qty}개</p>
                </div>
                <p className="text-sm font-semibold text-gray-800 shrink-0">{sub.toLocaleString()}원</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer Info */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">고객 정보</h3>
          <button
            type="button"
            onClick={() => onCustomerEditableFieldsChange?.({ ...customerEditableFields, customerInfo: !customerEditableFields?.customerInfo })}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              customerEditableFields?.customerInfo
                ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                : 'border-gray-300 text-gray-500 hover:border-gray-400'
            }`}
          >
            고객이 직접 입력
          </button>
        </div>
        {customerEditableFields?.customerInfo ? (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-400 text-center">고객이 결제 페이지에서 직접 입력합니다</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="고객 이름" className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">이메일 <span className="text-red-500">*</span></label>
              <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@example.com" className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
              <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="010-0000-0000" className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}
      </div>

      {/* Shipping */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">배송 정보</h3>
          <button
            type="button"
            onClick={() => onCustomerEditableFieldsChange?.({ ...customerEditableFields, shipping: !customerEditableFields?.shipping })}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              customerEditableFields?.shipping
                ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                : 'border-gray-300 text-gray-500 hover:border-gray-400'
            }`}
          >
            고객이 직접 입력
          </button>
        </div>
        {customerEditableFields?.shipping ? (
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-400 text-center">고객이 결제 페이지에서 직접 입력합니다</p>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="shippingMethod" value="pickup" checked={shippingMethod === 'pickup'} onChange={() => setShippingMethod('pickup')} className="w-4 h-4 text-blue-600" />
                <span className="text-gray-700">직접 수령</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="shippingMethod" value="domestic" checked={shippingMethod === 'domestic'} onChange={() => setShippingMethod('domestic')} className="w-4 h-4 text-blue-600" />
                <span className="text-gray-700">국내 배송</span>
              </label>
            </div>
            {shippingMethod === 'domestic' && (
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">주소 <span className="text-red-500">*</span></label>
                  <button type="button" onClick={() => setShowAddressSearch(true)} className="w-full p-3 border border-gray-300 rounded-lg bg-white text-left flex items-center gap-2 hover:border-blue-500 transition-colors">
                    <Search className="w-4 h-4 text-gray-400" />
                    {shippingAddress.addressLine1 ? <span className="text-gray-900">{shippingAddress.addressLine1}</span> : <span className="text-gray-400">주소 검색</span>}
                  </button>
                </div>
                {shippingAddress.addressLine1 && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">[{shippingAddress.postalCode}] {shippingAddress.addressLine1}</p>
                        <p className="text-xs text-gray-500 mt-1">{shippingAddress.state} {shippingAddress.city}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">상세 주소</label>
                  <input type="text" value={shippingAddress.addressLine2} onChange={(e) => setShippingAddress(prev => ({ ...prev, addressLine2: e.target.value }))} placeholder="상세 주소 입력 (동, 호수 등)" className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order-level Pricing */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          가격 조정
        </h3>
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">가격 설정 방식</label>
            <div className="flex flex-wrap gap-3 mb-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="orderPricingMode" value="auto" checked={pricingMode === 'auto'} onChange={() => setPricingMode('auto')} className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-gray-700">자동 계산 (상품 합계 기반)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="orderPricingMode" value="custom_total" checked={pricingMode === 'custom_total'} onChange={() => setPricingMode('custom_total')} className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-gray-700">전체 금액 직접 입력</span>
              </label>
            </div>
            {pricingMode === 'custom_total' && (
              <div className="relative">
                <input type="number" min="0" value={customTotalPrice} onChange={(e) => setCustomTotalPrice(e.target.value)} placeholder="최종 결제 금액 직접 입력" className="w-full p-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">원</span>
              </div>
            )}
          </div>

          {pricingMode !== 'custom_total' && (
            <>
              {/* Coupon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Tag className="w-4 h-4" /> 쿠폰 적용
                </label>
                {couponInfo ? (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-green-800">{couponInfo.displayName}</p>
                      <p className="text-xs text-green-600">{couponInfo.discountText} (-{couponInfo.discountAmount.toLocaleString()}원)</p>
                    </div>
                    <button onClick={handleCouponRemove} className="text-green-600 hover:text-green-800 text-sm font-medium">제거</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="text" value={couponCode} onChange={(e) => { setCouponCode(e.target.value); setCouponError(null); }} placeholder="쿠폰 코드 입력" className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => { if (e.key === 'Enter') handleCouponValidate(); }} />
                    <button onClick={() => handleCouponValidate()} disabled={isCouponValidating || !couponCode.trim()} className="px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap">
                      {isCouponValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : '적용'}
                    </button>
                  </div>
                )}
                {couponError && <p className="mt-1 text-xs text-red-500">{couponError}</p>}
              </div>

              {/* Admin Discount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Percent className="w-4 h-4" /> 임의 할인
                </label>
                <div className="flex gap-2">
                  <select value={adminDiscountType} onChange={(e) => setAdminDiscountType(e.target.value as AdminDiscountType)} className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm">
                    <option value="fixed">금액(원)</option>
                    <option value="percentage">비율(%)</option>
                  </select>
                  <div className="relative flex-1">
                    <input type="number" min="0" value={adminDiscountValue} onChange={(e) => setAdminDiscountValue(e.target.value)} placeholder={adminDiscountType === 'fixed' ? '할인 금액' : '할인 비율'} className="w-full p-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{adminDiscountType === 'fixed' ? '원' : '%'}</span>
                  </div>
                </div>
                {computedAdminDiscount > 0 && <p className="mt-1 text-xs text-orange-600">할인 적용: -{computedAdminDiscount.toLocaleString()}원</p>}
              </div>

              {/* Admin Surcharge */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Plus className="w-4 h-4" /> 추가 금액
                </label>
                <div className="relative">
                  <input type="number" min="0" value={adminSurcharge} onChange={(e) => setAdminSurcharge(e.target.value)} placeholder="추가 금액 (인쇄비, 급행 수수료 등)" className="w-full p-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">원</span>
                </div>
              </div>
            </>
          )}

          {pricingMode === 'custom_total' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">전체 금액 직접 입력 모드에서는 쿠폰/할인/추가금액이 적용되지 않습니다.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">조정 사유 메모</label>
            <input type="text" value={pricingNote} onChange={(e) => setPricingNote(e.target.value)} placeholder="가격 조정 사유 (내부 참고용)" className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* Payment Type */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          결제 방식
        </h3>
        {hasAnyEditable && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-700">고객 직접 입력 항목이 설정되어 있어 &quot;고객 온라인 결제&quot;로 자동 설정됩니다.</p>
          </div>
        )}
        <div className="space-y-3">
          <label className={`flex items-start gap-3 p-4 border rounded-lg transition-colors ${hasAnyEditable && paymentType !== 'completed' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`} style={{ borderColor: paymentType === 'completed' ? '#2563eb' : '#e5e7eb', backgroundColor: paymentType === 'completed' ? '#eff6ff' : 'white' }}>
            <input type="radio" name="paymentType" value="completed" checked={paymentType === 'completed'} onChange={() => setPaymentType('completed')} disabled={hasAnyEditable} className="w-4 h-4 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">결제 완료 처리</p>
              <p className="text-sm text-gray-500">즉시 결제 완료로 처리합니다 (관리자가 직접 수금한 경우)</p>
            </div>
          </label>
          <label className={`flex items-start gap-3 p-4 border rounded-lg transition-colors ${hasAnyEditable && paymentType !== 'bank_transfer' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`} style={{ borderColor: paymentType === 'bank_transfer' ? '#2563eb' : '#e5e7eb', backgroundColor: paymentType === 'bank_transfer' ? '#eff6ff' : 'white' }}>
            <input type="radio" name="paymentType" value="bank_transfer" checked={paymentType === 'bank_transfer'} onChange={() => setPaymentType('bank_transfer')} disabled={hasAnyEditable} className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900">무통장입금 대기</p>
                <p className="text-sm text-gray-500">고객의 입금 확인 후 관리자가 수동으로 결제 완료 처리합니다</p>
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50" style={{ borderColor: paymentType === 'customer_payment' ? '#2563eb' : '#e5e7eb', backgroundColor: paymentType === 'customer_payment' ? '#eff6ff' : 'white' }}>
            <input type="radio" name="paymentType" value="customer_payment" checked={paymentType === 'customer_payment'} onChange={() => setPaymentType('customer_payment')} className="w-4 h-4 text-blue-600 mt-0.5" />
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900">고객 온라인 결제</p>
                <p className="text-sm text-gray-500">결제 링크를 생성하여 고객이 직접 온라인 결제합니다</p>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">메모 (선택)</h3>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="주문에 대한 메모를 입력하세요..." rows={3} className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      {/* Order Summary */}
      <div className="mb-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3">주문 요약</h3>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="flex justify-between text-sm text-gray-700">
              <span className="truncate mr-2">{idx + 1}. {item.productTitle} ({getItemTotalQuantity(item)}개)</span>
              <span className="shrink-0">{getItemSubtotal(item).toLocaleString()}원</span>
            </div>
          ))}

          <div className="border-t border-blue-200 my-2" />
          <div className="flex justify-between text-gray-700">
            <span>소계 ({items.length}건 · {totalQuantity}개)</span>
            <span>{originalAmount.toLocaleString()}원</span>
          </div>

          <div className="flex justify-between text-gray-700">
            <span>배송비 ({shippingMethod === 'domestic' ? '국내 배송' : '직접 수령'})</span>
            <span>{deliveryFee > 0 ? `+${deliveryFee.toLocaleString()}원` : '무료'}</span>
          </div>

          {pricingMode !== 'custom_total' && (
            <>
              {computedCouponDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>쿠폰 할인 ({couponInfo?.displayName})</span>
                  <span>-{computedCouponDiscount.toLocaleString()}원</span>
                </div>
              )}
              {computedAdminDiscount > 0 && (
                <div className="flex justify-between text-orange-600">
                  <span>임의 할인</span>
                  <span>-{computedAdminDiscount.toLocaleString()}원</span>
                </div>
              )}
              {computedSurcharge > 0 && (
                <div className="flex justify-between text-purple-600">
                  <span>추가 금액</span>
                  <span>+{computedSurcharge.toLocaleString()}원</span>
                </div>
              )}
            </>
          )}

          {pricingMode === 'custom_total' && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>가격 설정</span>
              <span>전체 금액 직접 입력</span>
            </div>
          )}

          <div className="border-t border-blue-200 my-2" />
          <div className="flex justify-between font-bold text-lg">
            <span>최종 금액</span>
            <span className="text-blue-600">{totalAmount.toLocaleString()}원</span>
          </div>

          <div className="mt-2 pt-2 border-t border-blue-200">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">결제 방식</span>
              <span className="font-medium text-gray-800">
                {paymentType === 'completed' && '결제 완료 처리'}
                {paymentType === 'bank_transfer' && '무통장입금 대기'}
                {paymentType === 'customer_payment' && '고객 온라인 결제 (링크 발급)'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting || (!customerEditableFields?.quantities && totalQuantity <= 0)}
        className="w-full py-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>주문 생성 중...</span>
          </>
        ) : (
          <span>{paymentType === 'customer_payment' ? '주문 생성 및 결제 링크 발급' : '주문 생성하기'}</span>
        )}
      </button>

      {showAddressSearch && (
        <AddressSearch
          onSelect={(address) => {
            setShippingAddress({
              postalCode: address.postalCode,
              state: address.state,
              city: address.city,
              addressLine1: address.addressLine1,
              addressLine2: '',
            });
          }}
          onClose={() => setShowAddressSearch(false)}
        />
      )}
    </div>
  );
}
