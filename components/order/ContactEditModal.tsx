'use client';

/**
 * 주문 받는 분·배송지 정정 모달.
 *
 * 배경: 고객이 번호를 한 자리 빠뜨려 입력하면(0104931766) 연락이 닿지 않는데
 * 운영자가 이를 고칠 경로가 없었다. 주문 상세의 로젠 송장 폼에서 고친 값은
 * 로젠으로만 나가고 orders 에는 반영되지 않아, 오히려 "고쳤다"는 착각을 만들었다.
 *
 * 여기서 고치면 orders 본체가 바뀌고 원본은 order_contact_changes 에 남는다.
 *
 * 배송지(2026-09-15): 로젠은 접수를 고치거나 지우는 API가 없다.
 * - 송장 출력·배송 시작 뒤 = 주소 수정 차단(로젠에서 직접 변경)
 * - 접수만 된 주문 = "로젠 지점에 주소 변경 요청" 확인 후 저장
 * - 재접수는 하지 않는다(중복 배송 사고 이력).
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, X } from 'lucide-react';
import { checkPhone, formatPhone, sanitizePhoneInput } from '@/lib/phone';
import AddressSearch from '@/components/orders/AddressSearch';

interface ContactEditModalProps {
  order: {
    id: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    recipient_name?: string | null;
    recipient_phone?: string | null;
    recipient_same_as_orderer?: boolean | null;
    logen_registered_at?: string | null;
    logen_slip_printed?: boolean | null;
    tracking_number?: string | null;
    shipping_method?: string | null;
    order_status?: string | null;
    payment_status?: string | null;
    postal_code?: string | null;
    address_line_1?: string | null;
    address_line_2?: string | null;
    state?: string | null;
    city?: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

interface ContactChange {
  id: number;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string;
  changed_by_email: string | null;
  created_at: string;
}

const FIELD_LABEL: Record<string, string> = {
  customer_name: '주문자 성함',
  customer_phone: '주문자 연락처',
  recipient_name: '받는 분 성함',
  recipient_phone: '받는 분 연락처',
  postal_code: '우편번호',
  address_line_1: '기본 주소',
  address_line_2: '상세 주소',
  state: '시·도',
  city: '시·군·구',
};

const ADDRESS_FIELDS = ['postal_code', 'address_line_1', 'address_line_2', 'state', 'city'] as const;
type AddressField = (typeof ADDRESS_FIELDS)[number];

export default function ContactEditModal({ order, onClose, onSaved }: ContactEditModalProps) {
  const [customerName, setCustomerName] = useState(order.customer_name ?? '');
  const [customerPhone, setCustomerPhone] = useState(sanitizePhoneInput(order.customer_phone ?? ''));
  const [recipientName, setRecipientName] = useState(order.recipient_name ?? '');
  const [recipientPhone, setRecipientPhone] = useState(sanitizePhoneInput(order.recipient_phone ?? ''));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ContactChange[]>([]);

  const [address, setAddress] = useState<Record<AddressField, string>>({
    postal_code: order.postal_code ?? '',
    address_line_1: order.address_line_1 ?? '',
    address_line_2: order.address_line_2 ?? '',
    state: order.state ?? '',
    city: order.city ?? '',
  });
  const [showAddressSearch, setShowAddressSearch] = useState(false);
  const [logenAcknowledged, setLogenAcknowledged] = useState(false);

  // 주문자 = 받는 분인 주문은 한쪽만 고치면 반대쪽에 오타가 남는다.
  // 이규희님 주문(ORD-20260811-DUB7CB)이 정확히 이 경우였다.
  const sameAsOrderer = order.recipient_same_as_orderer !== false;
  const [syncRecipient, setSyncRecipient] = useState(sameAsOrderer);

  const alreadyShipped = !!order.logen_registered_at || !!order.tracking_number;

  const isDomestic = order.shipping_method === 'domestic';
  const orderStatus = order.order_status ?? '';
  const addressClosed = ['cancelled', 'partially_cancelled'].includes(orderStatus) || order.payment_status === 'refunded';
  const addressLocked =
    !!order.logen_slip_printed || !!order.tracking_number || ['shipping', 'delivered'].includes(orderStatus);
  const addressEditable = isDomestic && !addressClosed && !addressLocked;
  const logenRegistered = !!order.logen_registered_at;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/orders/${order.id}/contact-changes`)
      .then((res) => (res.ok ? res.json() : { changes: [] }))
      .then((data) => {
        if (!cancelled) setHistory(data.changes ?? []);
      })
      .catch(() => { /* 이력 조회 실패가 수정을 막지는 않는다 */ });
    return () => { cancelled = true; };
  }, [order.id]);

  // "주문자와 동일" 주문에서는 주문자 연락처를 고치면 받는 분도 따라간다.
  useEffect(() => {
    if (!syncRecipient) return;
    setRecipientPhone(customerPhone);
    setRecipientName(customerName);
  }, [syncRecipient, customerPhone, customerName]);

  const customerPhoneCheck = checkPhone(customerPhone);
  const recipientPhoneCheck = checkPhone(recipientPhone);

  const changedFields: string[] = [];
  if (customerName.trim() !== (order.customer_name ?? '')) changedFields.push('customer_name');
  if (customerPhone !== sanitizePhoneInput(order.customer_phone ?? '')) changedFields.push('customer_phone');
  if (recipientName.trim() !== (order.recipient_name ?? '')) changedFields.push('recipient_name');
  if (recipientPhone !== sanitizePhoneInput(order.recipient_phone ?? '')) changedFields.push('recipient_phone');

  const changedAddressFields = addressEditable
    ? ADDRESS_FIELDS.filter((field) => address[field].trim() !== (order[field] ?? ''))
    : [];
  const addressChanged = changedAddressFields.length > 0;
  const addressIncomplete = addressChanged && (!/^\d{5}$/.test(address.postal_code) || !address.address_line_1.trim());
  const needsLogenAck = addressChanged && logenRegistered && !logenAcknowledged;

  // 손대지 않은 필드는 아예 보내지 않는다.
  // 예전 주문 중에는 연락처가 비어 있는 건이 있어서, 성함만 고치려는데
  // 빈 연락처 때문에 저장이 막히는 일이 없어야 한다.
  const blocked =
    (changedFields.includes('customer_phone') && customerPhoneCheck.blocking) ||
    (changedFields.includes('recipient_phone') && recipientPhoneCheck.blocking) ||
    addressIncomplete ||
    needsLogenAck;
  const canSave = (changedFields.length > 0 || addressChanged) && !!reason.trim() && !blocked && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const contactUpdate: Record<string, string | boolean> = { reason: reason.trim() };
      if (changedFields.includes('customer_name')) contactUpdate.customer_name = customerName.trim();
      if (changedFields.includes('customer_phone')) contactUpdate.customer_phone = customerPhone;
      if (changedFields.includes('recipient_name')) contactUpdate.recipient_name = recipientName.trim();
      if (changedFields.includes('recipient_phone')) contactUpdate.recipient_phone = recipientPhone;
      for (const field of changedAddressFields) contactUpdate[field] = address[field].trim();
      if (addressChanged && logenRegistered) contactUpdate.logenAddressAcknowledged = logenAcknowledged;

      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, contactUpdate }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '저장에 실패했습니다.');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" data-testid="contact-edit-modal">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="text-sm font-semibold text-gray-900">연락처·배송지 정정</h3>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600" aria-label="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {alreadyShipped && (
            <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                이미 택배 접수된 주문입니다.
                <br />
                연락처를 고쳐도 <strong>이미 접수된 송장은 바뀌지 않습니다.</strong> 로젠에서 수정하거나 재발행해 주세요.
              </span>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500">주문자 — 결제·금액 안내 수신</p>
            <div>
              <label className="block text-xs text-gray-600 mb-1">성함</label>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">연락처</label>
              <input
                type="tel"
                inputMode="numeric"
                value={formatPhone(customerPhone)}
                onChange={(e) => setCustomerPhone(sanitizePhoneInput(e.target.value))}
                className={`w-full px-3 py-2 border rounded text-sm font-mono ${
                  customerPhoneCheck.severity === 'error' ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
              {customerPhoneCheck.message && (
                <p className={`mt-1 text-xs ${customerPhoneCheck.severity === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                  {customerPhoneCheck.message}
                </p>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={syncRecipient}
              onChange={(e) => setSyncRecipient(e.target.checked)}
              className="rounded border-gray-300"
            />
            받는 분도 같은 정보로 함께 수정
          </label>

          <div className={`space-y-3 ${syncRecipient ? 'opacity-50 pointer-events-none' : ''}`}>
            <p className="text-xs font-semibold text-gray-500">받는 분 — 송장·배송 안내 전용</p>
            <div>
              <label className="block text-xs text-gray-600 mb-1">성함</label>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">연락처</label>
              <input
                type="tel"
                inputMode="numeric"
                value={formatPhone(recipientPhone)}
                onChange={(e) => setRecipientPhone(sanitizePhoneInput(e.target.value))}
                className={`w-full px-3 py-2 border rounded text-sm font-mono ${
                  recipientPhoneCheck.severity === 'error' ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
              {recipientPhoneCheck.message && (
                <p className={`mt-1 text-xs ${recipientPhoneCheck.severity === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                  {recipientPhoneCheck.message}
                </p>
              )}
            </div>
          </div>

          {isDomestic && (
            <div className="space-y-3 border-t border-gray-100 pt-4" data-testid="shipping-address-section">
              <p className="text-xs font-semibold text-gray-500">배송지 — 송장 주소</p>

              {addressClosed && (
                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2.5" data-testid="address-closed-note">
                  취소·환불된 주문은 배송지를 수정할 수 없습니다.
                </p>
              )}
              {!addressClosed && addressLocked && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2.5 leading-relaxed" data-testid="address-locked-note">
                  송장이 출력됐거나 배송이 시작된 주문입니다.
                  <br />
                  배송지는 여기서 바꿀 수 없으니 로젠에서 직접 변경해 주세요.
                </p>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs text-gray-600">주소</label>
                  {addressEditable && (
                    <button
                      type="button"
                      onClick={() => setShowAddressSearch(true)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      data-testid="address-search-button"
                    >
                      <MapPin className="w-3.5 h-3.5" /> 주소 검색
                    </button>
                  )}
                </div>
                <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded text-sm text-gray-900 min-h-[38px]" data-testid="address-preview">
                  {address.address_line_1 ? (
                    <>
                      {address.postal_code && <span className="text-gray-500">[{address.postal_code}] </span>}
                      {address.address_line_1}
                    </>
                  ) : (
                    <span className="text-gray-400">주소 검색으로 입력해 주세요</span>
                  )}
                </div>
              </div>

              {showAddressSearch && (
                <AddressSearch
                  onSelect={(picked) => {
                    setAddress((prev) => ({
                      ...prev,
                      postal_code: picked.postalCode.replace(/[^0-9]/g, ''),
                      address_line_1: picked.addressLine1,
                      state: picked.state,
                      city: picked.city,
                    }));
                    setShowAddressSearch(false);
                  }}
                  onClose={() => setShowAddressSearch(false)}
                />
              )}

              <div>
                <label className="block text-xs text-gray-600 mb-1">상세 주소</label>
                <input
                  value={address.address_line_2}
                  onChange={(e) => setAddress((prev) => ({ ...prev, address_line_2: e.target.value }))}
                  disabled={!addressEditable}
                  placeholder="동·호수 등"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm disabled:bg-gray-50 disabled:text-gray-500"
                  data-testid="address-line-2-input"
                />
              </div>

              {addressChanged && logenRegistered && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-3 leading-relaxed space-y-2" data-testid="logen-ack-box">
                  <p>
                    로젠에 이미 접수된 주문입니다.
                    <br />
                    여기서 주소를 바꿔도 <strong>로젠 접수 주소는 바뀌지 않고</strong>, 다시 접수하면 중복 배송될 수 있습니다.
                  </p>
                  <label className="flex items-start gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={logenAcknowledged}
                      onChange={(e) => setLogenAcknowledged(e.target.checked)}
                      className="mt-0.5 rounded border-amber-400"
                      data-testid="logen-ack-checkbox"
                    />
                    로젠 지점에 주소 변경을 요청했습니다(또는 요청하겠습니다).
                  </label>
                </div>
              )}
              {addressIncomplete && (
                <p className="text-xs text-red-600">우편번호와 기본 주소가 필요합니다. 주소 검색으로 입력해 주세요.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-600 mb-1">
              수정 사유 <span className="text-red-500">*</span>
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 고객 통화로 확인, 이사로 배송지 변경"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              data-testid="contact-edit-reason"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              원본 값과 함께 이력에 남습니다. CS·분쟁 시 근거가 됩니다.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2" data-testid="contact-edit-error">{error}</p>
          )}

          {history.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">수정 이력</p>
              <ul className="space-y-1.5" data-testid="contact-edit-history">
                {history.map((change) => (
                  <li key={change.id} className="text-[11px] text-gray-600 leading-relaxed">
                    <span className="text-gray-400">
                      {new Date(change.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>{' '}
                    {FIELD_LABEL[change.field] ?? change.field}{' '}
                    <span className="font-mono line-through text-gray-400">{change.old_value || '(없음)'}</span>
                    {' → '}
                    <span className="font-mono text-gray-900">{change.new_value || '(없음)'}</span>
                    <br />
                    <span className="text-gray-400">
                      {change.changed_by_email || '알 수 없음'} · {change.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="ml-auto px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            data-testid="contact-edit-save"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
