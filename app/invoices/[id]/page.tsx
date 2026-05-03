'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Plus, Trash2, Send, Eye, ArrowLeft, X, Paperclip, Save } from 'lucide-react';
import type { Invoice, InvoiceItem } from '@/types/types';
import { generateInvoiceEmailHtml, INVOICE_SUPPLIER } from '@/lib/invoice-email';
import { formatKstTodayLong, formatKstDateTimeCompact } from '@/lib/kst';

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

function mapItemsFromInvoice(raw: InvoiceItem[]): InvoiceItem[] {
  if (!raw?.length) return [emptyItem()];
  return raw.map((i) => {
    const quantity = Math.max(1, Number(i.quantity) || 1);
    const unit_price = Math.max(0, Number(i.unit_price) || 0);
    return {
      name: i.name ?? '',
      quantity,
      unit_price,
      amount: quantity * unit_price,
      spec: i.spec ?? '',
      remarks: i.remarks ?? '',
      month: i.month ?? '',
      day: i.day ?? '',
    };
  });
}

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);

  const [includeVat, setIncludeVat] = useState(true);
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [recipientOrg, setRecipientOrg] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
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

  useEffect(() => {
    if (!id) {
      setLoadState('error');
      return;
    }

    setLoadState('loading');
    fetch(`/api/admin/invoices/${id}`)
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok) {
          setLoadState('error');
          return;
        }
        const inv = result.data as Invoice;
        setInvoiceNumber(inv.invoice_number);
        setLastSentAt(inv.sent_at);
        setIncludeVat(!!inv.include_vat);
        setItems(mapItemsFromInvoice(inv.items));
        setRecipientOrg(inv.recipient_org ?? '');
        setRecipientName(inv.recipient_name ?? '');
        setRecipientEmail(inv.recipient_email ?? '');
        setMemo(inv.memo ?? '');
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
  }, [id]);

  const hasDoc = (docType: string) => documents.some((d) => d.doc_type === docType);

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const vatAmount = includeVat ? Math.round(subtotal * 0.1) : 0;
  const totalAmount = subtotal + vatAmount;

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

  const applySuggestion = useCallback(
    (index: number, name: string) => {
      updateItem(index, 'name', name);
    },
    [updateItem],
  );

  const handlePreview = () => {
    const dateStr = formatKstTodayLong();
    const html = generateInvoiceEmailHtml({
      invoiceNumber: invoiceNumber || 'INV',
      date: dateStr,
      includeVat,
      items: items.filter((item) => item.name.trim()),
      subtotal,
      vatAmount,
      totalAmount,
      recipientOrg: recipientOrg.trim() || null,
      recipientName: recipientName.trim() || null,
      memo: memo.trim() || null,
      companySealImageSrc: sealBase64 ? `data:image/png;base64,${sealBase64}` : null,
    });
    setPreviewHtml(html);
  };

  const buildPayload = () => {
    const validItems = items.filter((item) => item.name.trim());
    return {
      include_vat: includeVat,
      items: validItems,
      recipient_org: recipientOrg.trim() || undefined,
      recipient_name: recipientName.trim() || undefined,
      recipient_email: recipientEmail.trim(),
      memo: memo.trim() || undefined,
    };
  };

  const handleSave = async () => {
    const validItems = items.filter((item) => item.name.trim());
    if (validItems.length === 0) {
      alert('최소 1개 이상의 항목을 입력해주세요.');
      return;
    }
    if (!recipientEmail.trim()) {
      alert('이메일 주소를 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(result.error || '저장에 실패했습니다.');
        return;
      }
      if (result.data?.sent_at) setLastSentAt(result.data.sent_at);
      alert('저장되었습니다.');
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async () => {
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

    if (!confirm('현재 내용으로 이메일을 재발송하시겠습니까? (저장과 동시에 발송됩니다)')) return;

    setResending(true);
    try {
      const res = await fetch(`/api/admin/invoices/${id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildPayload(),
          attach_invoice: attachInvoice,
          attach_pdf: attachPdf,
          attach_business_registration: attachBusinessReg,
          attach_bank_account: attachBankAccount,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        alert(result.error || '재발송에 실패했습니다.');
        return;
      }
      if (result.data?.sent_at) setLastSentAt(result.data.sent_at);
      if (result.warning) {
        alert(result.warning);
      } else {
        alert('재발송되었습니다.');
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setResending(false);
    }
  };

  const formatNumber = (n: number) => n.toLocaleString('ko-KR');

  const formatDateTime = (dateStr: string) => formatKstDateTimeCompact(dateStr);

  if (loadState === 'loading') {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-sm text-gray-500">불러오는 중...</div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center space-y-4">
        <p className="text-sm text-gray-600">거래명세서를 불러올 수 없습니다.</p>
        <button
          type="button"
          onClick={() => router.push('/invoices')}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          목록으로
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/invoices')}
            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">거래명세서 수정 · 재발송</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="font-mono text-gray-700">{invoiceNumber}</span>
              {lastSentAt && (
                <span className="ml-2 text-gray-400">마지막 발송: {formatDateTime(lastSentAt)}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
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

        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">VAT 옵션</h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="vat-edit"
                checked={includeVat}
                onChange={() => setIncludeVat(true)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">VAT 포함 (10%)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="vat-edit"
                checked={!includeVat}
                onChange={() => setIncludeVat(false)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm font-medium text-gray-700">VAT 미포함</span>
            </label>
          </div>
        </section>

        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">항목</h2>
            <button
              type="button"
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
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="w-full px-1 py-1.5 border border-gray-300 rounded text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min={0}
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

        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">금액 요약</h2>
          <div className="space-y-2 max-w-xs ml-auto">
            {includeVat && (
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
            <div
              className={`flex justify-between text-base font-bold ${includeVat ? 'pt-2 border-t border-gray-200' : ''}`}
            >
              <span className="text-gray-900">합계금액</span>
              <span className="text-blue-700">{formatNumber(totalAmount)}원</span>
            </div>
          </div>
        </section>

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

        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Paperclip className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">재발송 시 첨부</h2>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            이메일 재발송 시 첨부할 파일을 선택하세요. 거래명세표는 PDF로 첨부됩니다.
          </p>
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

        <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pb-8">
          <button
            type="button"
            onClick={handlePreview}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-4 h-4" />
            미리보기
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '저장 중...' : '저장만 하기'}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {resending ? '재발송 중...' : '이메일 재발송'}
          </button>
        </div>
      </div>

      {previewHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col mx-4">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">명세표 미리보기</h3>
              <button
                type="button"
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
