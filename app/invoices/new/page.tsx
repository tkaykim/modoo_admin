'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2, Send, Eye, ArrowLeft, X, Paperclip } from 'lucide-react';
import type { InvoiceItem, InvoiceDocumentType, InvoiceRecipientBusiness, CashReceiptMethod } from '@/types/types';
import { generateInvoiceEmailHtml, INVOICE_SUPPLIER } from '@/lib/invoice-email';
import { computeInvoiceTotalsByMode } from '@/lib/invoice-payload';
import { formatKstTodayLong } from '@/lib/kst';

const DOC_TYPE_OPTIONS: { value: InvoiceDocumentType; label: string }[] = [
  { value: 'transaction_statement', label: '거래명세서' },
  { value: 'tax_invoice', label: '세금계산서' },
  { value: 'cash_receipt', label: '현금영수증' },
];
const CASH_METHOD_OPTIONS: { value: CashReceiptMethod; label: string }[] = [
  { value: 'phone', label: '휴대폰번호' },
  { value: 'business', label: '사업자번호(지출증빙)' },
  { value: 'card', label: '카드/식별번호' },
];

interface AdminDocument {
  id: string;
  doc_type: 'business_registration' | 'bank_account';
  file_name: string;
  file_url: string;
}

const DOC_LABELS: Record<string, string> = {
  business_registration: '사업자등록증',
  bank_account: '통장사본',
};

const SUGGESTED_ITEMS = ['의류', '프린트', '디자인', '자수', '배송비', '시안작업', '샘플'];

function emptyItem(): InvoiceItem {
  return {
    name: '',
    quantity: 1,
    unit_price: 0,
    amount: 0,
    spec: '',
    remarks: '',
    month: '',
    day: '',
  };
}

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderIdParam = searchParams.get('orderId');
  const docTypeParam = searchParams.get('docType') as InvoiceDocumentType | null;

  const [documentType, setDocumentType] = useState<InvoiceDocumentType>(
    docTypeParam && DOC_TYPE_OPTIONS.some((o) => o.value === docTypeParam) ? docTypeParam : 'transaction_statement',
  );
  const [orderId, setOrderId] = useState<string | null>(orderIdParam);
  const [includeVat, setIncludeVat] = useState(true);
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [recipientOrg, setRecipientOrg] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [memo, setMemo] = useState('');
  // 세금계산서: 공급받는자 사업자정보
  const [rbBizNo, setRbBizNo] = useState('');
  const [rbOrg, setRbOrg] = useState('');
  const [rbCeo, setRbCeo] = useState('');
  const [rbAddress, setRbAddress] = useState('');
  const [rbBizType, setRbBizType] = useState('');
  const [rbBizItem, setRbBizItem] = useState('');
  // 현금영수증
  const [cashMethod, setCashMethod] = useState<CashReceiptMethod>('phone');
  const [cashIdentifier, setCashIdentifier] = useState('');
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [attachInvoice, setAttachInvoice] = useState(true);
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachBusinessReg, setAttachBusinessReg] = useState(false);
  const [attachBankAccount, setAttachBankAccount] = useState(false);
  const [sealBase64, setSealBase64] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/documents')
      .then((res) => res.json())
      .then((result) => {
        if (result.data) setDocuments(result.data);
      })
      .catch(() => {});
    fetch('/api/admin/documents/seal')
      .then((res) => res.json())
      .then((result) => {
        if (result.base64) setSealBase64(result.base64);
      })
      .catch(() => {});
  }, []);

  // 주문 원클릭 자동채움
  useEffect(() => {
    if (!orderIdParam) return;
    let cancelled = false;
    (async () => {
      try {
        const [ordRes, itemsRes] = await Promise.all([
          fetch(`/api/admin/orders?orderId=${encodeURIComponent(orderIdParam)}`),
          fetch(`/api/admin/orders/items?orderId=${encodeURIComponent(orderIdParam)}`),
        ]);
        const ordJson = await ordRes.json().catch(() => null);
        const itemsJson = await itemsRes.json().catch(() => null);
        if (cancelled) return;
        const ord = ordJson?.data?.[0];
        if (ord) {
          setRecipientOrg((ord.customer_name as string) || '');
          if (ord.customer_email) setRecipientEmail(ord.customer_email as string);
          setMemo((m) => m || `주문번호 ${ord.id}`);
        }
        const oItems = Array.isArray(itemsJson?.data) ? itemsJson.data : [];
        if (oItems.length > 0) {
          setItems(
            oItems.map((it: { product_title?: string; design_title?: string; quantity?: number; price_per_item?: number }) => {
              const quantity = Math.max(1, Number(it.quantity) || 1);
              const unit_price = Math.max(0, Number(it.price_per_item) || 0);
              return {
                name: it.product_title || it.design_title || '품목',
                quantity,
                unit_price,
                amount: quantity * unit_price,
                spec: '',
                remarks: it.design_title && it.design_title !== it.product_title ? it.design_title : '',
                month: '',
                day: '',
              } as InvoiceItem;
            }),
          );
        }
      } catch { /* 자동채움 실패는 무시 */ }
    })();
    return () => { cancelled = true; };
  }, [orderIdParam]);

  const hasDoc = (docType: string) => documents.some((d) => d.doc_type === docType);

  // 부가세 계산 모드: 거래명세서는 includeVat(공급가액 기준 가산/없음),
  // 세금계산서·현금영수증은 inclusive(주문 표시가=부가세 포함 → 역산).
  const vatMode: 'none' | 'exclusive' | 'inclusive' =
    documentType === 'transaction_statement' ? (includeVat ? 'exclusive' : 'none') : 'inclusive';
  const { subtotal, vatAmount, totalAmount } = computeInvoiceTotalsByMode(items, vatMode);
  const showVat = vatMode !== 'none';

  const updateItem = useCallback((index: number, field: keyof InvoiceItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };

      if (field === 'name') {
        item.name = value as string;
      } else if (field === 'quantity') {
        item.quantity = Math.max(1, Number(value) || 1);
        item.amount = item.quantity * item.unit_price;
      } else if (field === 'unit_price') {
        item.unit_price = Math.max(0, Number(value) || 0);
        item.amount = item.quantity * item.unit_price;
      } else if (field === 'spec' || field === 'remarks' || field === 'month' || field === 'day') {
        (item as Record<string, unknown>)[field] = value as string;
      }

      next[index] = item;
      return next;
    });
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, emptyItem()]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const applySuggestion = useCallback((index: number, name: string) => {
    updateItem(index, 'name', name);
  }, [updateItem]);

  const buildRecipientBusiness = (): InvoiceRecipientBusiness | null => {
    if (documentType !== 'tax_invoice') return null;
    return {
      biz_no: rbBizNo.trim() || undefined,
      org: rbOrg.trim() || undefined,
      ceo: rbCeo.trim() || undefined,
      address: rbAddress.trim() || undefined,
      biz_type: rbBizType.trim() || undefined,
      biz_item: rbBizItem.trim() || undefined,
    };
  };

  const handlePreview = () => {
    const dateStr = formatKstTodayLong();
    const html = generateInvoiceEmailHtml({
      invoiceNumber: 'INV-PREVIEW',
      date: dateStr,
      includeVat: showVat,
      items: items.filter((item) => item.name.trim()),
      subtotal,
      vatAmount,
      totalAmount,
      recipientOrg: recipientOrg.trim() || null,
      recipientName: recipientName.trim() || null,
      memo: memo.trim() || null,
      companySealImageSrc: sealBase64 ? `data:image/png;base64,${sealBase64}` : null,
      documentType,
      recipientBusiness: buildRecipientBusiness(),
      cashReceiptMethod: documentType === 'cash_receipt' ? cashMethod : null,
      cashReceiptIdentifier: documentType === 'cash_receipt' ? cashIdentifier.trim() || null : null,
    });
    setPreviewHtml(html);
  };

  const handleSubmit = async () => {
    const validItems = items.filter((item) => item.name.trim());
    if (validItems.length === 0) {
      alert('최소 1개 이상의 항목을 입력해주세요.');
      return;
    }
    if (!recipientEmail.trim()) {
      alert('이메일 주소를 입력해주세요.');
      return;
    }
    if (!attachInvoice && !attachBusinessReg && !attachBankAccount) {
      alert('최소 1개 이상의 발송 항목을 선택해주세요.');
      return;
    }
    if (documentType === 'tax_invoice' && !rbBizNo.trim()) {
      alert('세금계산서는 공급받는자 사업자등록번호가 필요합니다.');
      return;
    }
    if (documentType === 'cash_receipt' && !cashIdentifier.trim()) {
      alert('현금영수증은 식별번호가 필요합니다.');
      return;
    }

    const docLabel = DOC_TYPE_OPTIONS.find((o) => o.value === documentType)?.label || '거래명세서';
    if (!confirm(`${docLabel}를 발송하시겠습니까?`)) return;

    setSending(true);
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: documentType,
          order_id: orderId || undefined,
          vat_mode: vatMode,
          include_vat: showVat,
          items: validItems,
          recipient_org: recipientOrg.trim() || undefined,
          recipient_name: recipientName.trim() || undefined,
          recipient_email: recipientEmail.trim(),
          recipient_business: buildRecipientBusiness() || undefined,
          cash_receipt_method: documentType === 'cash_receipt' ? cashMethod : undefined,
          cash_receipt_identifier: documentType === 'cash_receipt' ? cashIdentifier.trim() : undefined,
          memo: memo.trim() || undefined,
          attach_invoice: attachInvoice,
          attach_pdf: attachPdf,
          attach_business_registration: attachBusinessReg,
          attach_bank_account: attachBankAccount,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        alert(result.error || '발송에 실패했습니다.');
        return;
      }

      if (result.warning) {
        alert(result.warning);
      } else {
        alert(`${docLabel}가 성공적으로 발송되었습니다.`);
      }

      router.push('/invoices');
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  };

  const formatNumber = (n: number) => n.toLocaleString('ko-KR');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/invoices')}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{DOC_TYPE_OPTIONS.find((o) => o.value === documentType)?.label} 작성</h1>
      </div>

      <div className="space-y-6">
        {/* 문서 종류 */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">문서 종류</h2>
          <div className="flex flex-wrap gap-2">
            {DOC_TYPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setDocumentType(o.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${documentType === o.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {orderId && (
            <p className="mt-2 text-xs text-gray-500">주문 <span className="font-mono">{orderId}</span> 정보로 자동 채움됨 (수정 가능)</p>
          )}
          {documentType !== 'transaction_statement' && (
            <p className="mt-2 text-xs text-amber-700">⚠ 본 문서는 내부 발행용입니다. 국세청 전자 {documentType === 'tax_invoice' ? '세금계산서' : '현금영수증'} 발행은 홈택스에서 별도로 진행하세요.</p>
          )}
        </section>

        {/* Supplier Info */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">공급자 정보 (명세표에 인쇄)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">서비스 브랜드</span>
              <p className="font-semibold text-gray-900">모두의 유니폼</p>
            </div>
            <div>
              <span className="text-gray-500">등록번호</span>
              <p className="font-semibold text-gray-900">{INVOICE_SUPPLIER.registrationNo}</p>
            </div>
            <div>
              <span className="text-gray-500">상호(법인명)</span>
              <p className="font-semibold text-gray-900">{INVOICE_SUPPLIER.tradeName}</p>
            </div>
            <div>
              <span className="text-gray-500">성명(대표자)</span>
              <p className="font-semibold text-gray-900">{INVOICE_SUPPLIER.representative}</p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500">개업연월</span>
              <p className="font-medium text-gray-900">{INVOICE_SUPPLIER.openingDate}</p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500">사업장 주소</span>
              <p className="font-medium text-gray-900">{INVOICE_SUPPLIER.businessAddress}</p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500">사무실</span>
              <p className="font-medium text-gray-900">{INVOICE_SUPPLIER.officeAddress}</p>
            </div>
            <div>
              <span className="text-gray-500">업태</span>
              <p className="font-semibold text-gray-900">{INVOICE_SUPPLIER.businessType}</p>
            </div>
            <div>
              <span className="text-gray-500">종목</span>
              <p className="font-semibold text-gray-900">{INVOICE_SUPPLIER.businessItem}</p>
            </div>
          </div>
        </section>

        {/* Recipient Info */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">받으시는 분</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">단체명</label>
              <input
                type="text"
                value={recipientOrg}
                onChange={(e) => setRecipientOrg(e.target.value)}
                placeholder="단체명 (선택)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">성함</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="성함 (선택)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이메일 주소 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="example@email.com"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </section>

        {/* 세금계산서: 공급받는자 사업자정보 */}
        {documentType === 'tax_invoice' && (
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">공급받는자 (사업자)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사업자등록번호 <span className="text-red-500">*</span></label>
                <input type="text" value={rbBizNo} onChange={(e) => setRbBizNo(e.target.value)} placeholder="000-00-00000" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상호</label>
                <input type="text" value={rbOrg} onChange={(e) => setRbOrg(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">대표자</label>
                <input type="text" value={rbCeo} onChange={(e) => setRbCeo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">사업장 주소</label>
                <input type="text" value={rbAddress} onChange={(e) => setRbAddress(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">업태</label>
                <input type="text" value={rbBizType} onChange={(e) => setRbBizType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">종목</label>
                <input type="text" value={rbBizItem} onChange={(e) => setRbBizItem(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </section>
        )}

        {/* 현금영수증: 발급정보 */}
        {documentType === 'cash_receipt' && (
          <section className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">현금영수증 발급정보</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">발급수단 <span className="text-red-500">*</span></label>
                <select value={cashMethod} onChange={(e) => setCashMethod(e.target.value as CashReceiptMethod)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CASH_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">식별번호 <span className="text-red-500">*</span></label>
                <input type="text" value={cashIdentifier} onChange={(e) => setCashIdentifier(e.target.value)} placeholder="휴대폰/사업자/카드번호" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </section>
        )}

        {/* VAT Option */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">VAT 옵션</h2>
          {documentType === 'transaction_statement' ? (
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="vat" checked={includeVat} onChange={() => setIncludeVat(true)} className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">VAT 포함 (10%)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="vat" checked={!includeVat} onChange={() => setIncludeVat(false)} className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">VAT 미포함</span>
              </label>
            </div>
          ) : (
            <p className="text-sm text-gray-600">입력 금액을 <b>부가세 포함가</b>로 보고 공급가액(합계÷1.1)·세액을 자동 역산합니다. (주문 표시가 기준)</p>
          )}
        </section>

        {/* Items */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">항목</h2>
            <button
              onClick={addItem}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            >
              <Plus className="w-4 h-4" />
              항목 추가
            </button>
          </div>

          <p className="text-xs text-gray-400 mb-3">
            명세표 열 순서: 월·일·품목·규격·수량·단가·공급가액·세액(VAT 포함 시)·비고. 세액은 자동 계산됩니다.
          </p>

          <div className="overflow-x-auto rounded-md border border-gray-200">
            <div className="min-w-[920px] p-2">
              <div className="grid grid-cols-[36px_36px_minmax(140px,1fr)_88px_56px_88px_88px_minmax(100px,1fr)_40px] gap-1 mb-1 px-1 items-end">
                <span className="text-[10px] font-medium text-gray-500 text-center">월</span>
                <span className="text-[10px] font-medium text-gray-500 text-center">일</span>
                <span className="text-[10px] font-medium text-gray-500">품목</span>
                <span className="text-[10px] font-medium text-gray-500">규격</span>
                <span className="text-[10px] font-medium text-gray-500 text-right">수량</span>
                <span className="text-[10px] font-medium text-gray-500 text-right">단가</span>
                <span className="text-[10px] font-medium text-gray-500 text-right">금액</span>
                <span className="text-[10px] font-medium text-gray-500">행 비고</span>
                <span />
              </div>

              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[36px_36px_minmax(140px,1fr)_88px_56px_88px_88px_minmax(100px,1fr)_40px] gap-1 items-start"
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.month ?? ''}
                      onChange={(e) => updateItem(index, 'month', e.target.value)}
                      placeholder="월"
                      className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.day ?? ''}
                      onChange={(e) => updateItem(index, 'day', e.target.value)}
                      placeholder="일"
                      className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="relative min-w-0">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(index, 'name', e.target.value)}
                        placeholder="품목"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {!item.name && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {SUGGESTED_ITEMS.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => applySuggestion(index, suggestion)}
                              className="px-1.5 py-0.5 text-[10px] text-gray-500 bg-gray-100 hover:bg-gray-200 rounded"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="text"
                      value={item.spec ?? ''}
                      onChange={(e) => updateItem(index, 'spec', e.target.value)}
                      placeholder="규격"
                      className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min="0"
                      value={item.unit_price || ''}
                      onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                      placeholder="0"
                      className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <div className="px-1 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-right font-medium text-gray-900">
                      {formatNumber(item.amount)}
                    </div>
                    <input
                      type="text"
                      value={item.remarks ?? ''}
                      onChange={(e) => updateItem(index, 'remarks', e.target.value)}
                      placeholder="비고"
                      className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={items.length <= 1}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Summary */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">금액 요약</h2>
          <div className="space-y-2 max-w-xs ml-auto">
            {showVat && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">공급가액</span>
                  <span className="text-gray-900">{formatNumber(subtotal)}원</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">세액 (VAT)</span>
                  <span className="text-gray-900">{formatNumber(vatAmount)}원</span>
                </div>
              </>
            )}
            <div className={`flex justify-between text-base font-bold ${showVat ? 'pt-2 border-t border-gray-200' : ''}`}>
              <span className="text-gray-900">합계금액</span>
              <span className="text-blue-700">{formatNumber(totalAmount)}원</span>
            </div>
          </div>
        </section>

        {/* Memo */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">비고</h2>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={3}
            placeholder="비고 사항을 입력해주세요 (선택)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          />
        </section>

        {/* Attachments */}
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">발송 항목 선택</h2>
          </div>
          <p className="text-xs text-gray-400 mb-3">이메일에 첨부할 파일을 선택하세요. 거래명세표는 PDF로 첨부됩니다.</p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={attachInvoice && attachPdf}
                onChange={(e) => {
                  setAttachInvoice(e.target.checked);
                  setAttachPdf(e.target.checked);
                }}
                className="w-4 h-4 text-blue-600 rounded border-gray-300"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">거래명세표 PDF</span>
                <span className="text-xs text-gray-400 ml-2">도장 포함 거래명세표를 PDF 첨부파일로 발송</span>
              </div>
            </label>
            {hasDoc('business_registration') && (
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={attachBusinessReg}
                  onChange={(e) => setAttachBusinessReg(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">{DOC_LABELS.business_registration}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {documents.find((d) => d.doc_type === 'business_registration')?.file_name}
                  </span>
                </div>
              </label>
            )}
            {hasDoc('bank_account') && (
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded-md hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={attachBankAccount}
                  onChange={(e) => setAttachBankAccount(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">{DOC_LABELS.bank_account}</span>
                  <span className="text-xs text-gray-400 ml-2">
                    {documents.find((d) => d.doc_type === 'bank_account')?.file_name}
                  </span>
                </div>
              </label>
            )}
          </div>
        </section>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            onClick={handlePreview}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-4 h-4" />
            미리보기
          </button>
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {sending ? '발송 중...' : '발송하기'}
          </button>
        </div>
      </div>

      {/* Preview Modal */}
      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">이메일 미리보기</h3>
              <button
                onClick={() => setPreviewHtml(null)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
