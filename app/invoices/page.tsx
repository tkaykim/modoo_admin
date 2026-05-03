'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, ChevronLeft, ChevronRight, Upload, Trash2, Download, FileCheck } from 'lucide-react';
import type { Invoice } from '@/types/types';
import { formatKstDateNumeric } from '@/lib/kst';

interface AdminDocument {
  id: string;
  doc_type: 'business_registration' | 'bank_account';
  file_name: string;
  file_url: string;
  uploaded_at: string;
}

const DOC_LABELS: Record<string, string> = {
  business_registration: '사업자등록증',
  bank_account: '통장사본',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const limit = 20;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/invoices?page=${page}&limit=${limit}`);
      const result = await res.json();
      if (res.ok) {
        setInvoices(result.data || []);
        setTotal(result.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/documents');
      const result = await res.json();
      if (res.ok) {
        setDocuments(result.data || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchDocuments();
  }, [fetchInvoices, fetchDocuments]);

  const handleUploadClick = (docType: string) => {
    setUploadTarget(docType);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;

    setUploading(uploadTarget);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', uploadTarget);

      const res = await fetch('/api/admin/documents', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        await fetchDocuments();
      } else {
        const result = await res.json();
        alert(result.error || '업로드에 실패했습니다.');
      }
    } catch {
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(null);
      setUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (docType: keyof typeof DOC_LABELS) => {
    if (!confirm(`${DOC_LABELS[docType]}을(를) 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/admin/documents?doc_type=${docType}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchDocuments();
      }
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  const getDoc = (docType: string) => documents.find((d) => d.doc_type === docType);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const formatDate = (dateStr: string) => formatKstDateNumeric(dateStr);

  const formatCurrency = (n: number) => n.toLocaleString('ko-KR');

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">거래명세서</h1>
          <p className="text-sm text-gray-500 mt-0.5">총 {total}건</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchInvoices}
            disabled={loading}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/invoices/new"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            새 거래명세서
          </Link>
        </div>
      </div>

      {/* Document Management */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">첨부 문서 관리</h2>
        <p className="text-xs text-gray-400 mb-4">거래명세서 발송 시 함께 보낼 수 있는 문서를 등록해두세요.</p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['business_registration', 'bank_account'] as const).map((docType) => {
            const doc = getDoc(docType);
            const isUploading = uploading === docType;

            return (
              <div
                key={docType}
                className={`border rounded-lg p-4 transition-colors ${
                  doc ? 'border-green-200 bg-green-50/50' : 'border-gray-200 border-dashed'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{DOC_LABELS[docType]}</p>
                    {doc ? (
                      <div className="mt-1">
                        <div className="flex items-center gap-1.5 text-xs text-green-700">
                          <FileCheck className="w-3.5 h-3.5" />
                          <span className="truncate">{doc.file_name}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(doc.uploaded_at)} 업로드
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">등록된 파일 없음</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {doc && (
                      <>
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="다운로드"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(docType)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleUploadClick(docType)}
                      disabled={isUploading}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                      title={doc ? '교체' : '업로드'}
                    >
                      <Upload className={`w-4 h-4 ${isUploading ? 'animate-pulse' : ''}`} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">번호</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">받는분</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">이메일</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">합계금액</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">VAT</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">발송일</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    불러오는 중...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    발송된 거래명세서가 없습니다.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const recipientDisplay = [invoice.recipient_org, invoice.recipient_name]
                    .filter(Boolean)
                    .join(' / ') || '-';

                  return (
                    <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">{invoice.invoice_number}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{recipientDisplay}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{invoice.recipient_email}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                        {formatCurrency(invoice.total_amount)}원
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                            invoice.include_vat
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {invoice.include_vat ? '포함' : '미포함'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(invoice.sent_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-800"
                        >
                          상세 · 수정
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <span className="text-sm text-gray-600">
              {page} / {totalPages} 페이지
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
