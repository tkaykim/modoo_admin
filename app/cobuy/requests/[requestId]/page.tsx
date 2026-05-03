'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ChevronLeft, MessageSquare, ExternalLink, Link2, Eye, CheckCircle, XCircle, Send, Copy, Check, Download, FileText } from 'lucide-react';
import { CoBuyRequest, CoBuyRequestComment, CoBuyRequestStatus, CoBuyRequestAdminStatus } from '@/types/types';
import '@/lib/curvedText';
import { formatKstDateTimeMedium, formatKstDateShort } from '@/lib/kst';

const statusLabels: Record<CoBuyRequestStatus, string> = {
  draft: '작성중',
  pending: '대기중',
  in_progress: '작업중',
  design_shared: '디자인 공유됨',
  feedback: '피드백 대기',
  confirmed: '확정',
  session_created: '세션 생성됨',
  rejected: '거절',
};

const statusColors: Record<CoBuyRequestStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  design_shared: 'bg-purple-100 text-purple-800',
  feedback: 'bg-orange-100 text-orange-800',
  confirmed: 'bg-green-100 text-green-800',
  session_created: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

const adminStatusLabels: Record<CoBuyRequestAdminStatus, string> = {
  not_reviewed: '미확인',
  reviewing: '확인중',
  quote_sent: '견적발송',
  contract_done: '계약완료',
  on_hold: '보류',
  cancelled: '취소',
};

const adminStatusColors: Record<CoBuyRequestAdminStatus, string> = {
  not_reviewed: 'bg-gray-100 text-gray-500',
  reviewing: 'bg-blue-100 text-blue-700',
  quote_sent: 'bg-amber-100 text-amber-700',
  contract_done: 'bg-green-100 text-green-700',
  on_hold: 'bg-red-100 text-red-600',
  cancelled: 'bg-red-50 text-red-500',
};

const fetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
});

const formatDate = (dateString?: string | null) =>
  dateString ? formatKstDateTimeMedium(dateString) : '-';

// ============================================================================
// Freeform Sketch Preview
// ============================================================================

interface ProductLayerInfo {
  id: string;
  name: string;
  imageUrl: string;
  zIndex: number;
  colorOptions?: { hex: string; colorCode: string }[];
}

interface ProductSideInfo {
  id: string;
  name: string;
  imageUrl?: string;
  zoomScale?: number;
  layers?: ProductLayerInfo[];
}

const SRC_W = 400;
const SRC_H = 500;
const SKETCH_DISPLAY_SCALE = 0.55;

function FreeformSketchPreview({
  canvasState,
  productSides,
  productColorHex,
  colorSelections,
}: {
  canvasState: Record<string, any>;
  productSides?: ProductSideInfo[];
  productColorHex?: string;
  colorSelections?: Record<string, any>;
}) {
  const sideIds = productSides?.map(s => s.id) ?? Object.keys(canvasState);
  if (sideIds.length === 0) return <p className="text-xs text-gray-400">스케치 데이터 없음</p>;

  return (
    <div className="flex gap-3 flex-wrap">
      {sideIds.map(sideId => {
        const side = productSides?.find(s => s.id === sideId);
        const layerColors = colorSelections?.[sideId] as Record<string, string> | undefined;
        return (
          <SketchSideCanvas
            key={sideId}
            sideId={sideId}
            side={side}
            stateValue={canvasState[sideId]}
            productColorHex={productColorHex}
            layerColors={layerColors}
          />
        );
      })}
    </div>
  );
}

function SketchSideCanvas({
  sideId,
  side,
  stateValue,
  productColorHex,
  layerColors,
}: {
  sideId: string;
  side?: ProductSideInfo;
  stateValue?: any;
  productColorHex?: string;
  layerColors?: Record<string, string>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let disposed = false;

    const init = async () => {
      const fabric = await import('fabric');
      if (disposed) return;

      const canvas = new fabric.StaticCanvas(canvasRef.current!, {
        width: SRC_W,
        height: SRC_H,
        backgroundColor: '#EBEBEB',
      });
      fabricRef.current = canvas;

      try {
        const hasLayers = side?.layers && side.layers.length > 0;
        const zoom = side?.zoomScale || 1.0;

        const applyColorFilter = (img: any, colorHex?: string) => {
          const color = colorHex || productColorHex;
          if (color && color !== '#FFFFFF') {
            img.filters = [new fabric.filters.BlendColor({ color, mode: 'multiply', alpha: 1 })];
            img.applyFilters();
          }
        };

        if (hasLayers) {
          const sorted = [...side!.layers!].sort((a, b) => a.zIndex - b.zIndex);
          for (const layer of sorted) {
            if (disposed) return;
            try {
              const img = await fabric.FabricImage.fromURL(layer.imageUrl, { crossOrigin: 'anonymous' });
              if (disposed) { canvas.dispose(); return; }
              const imgW = img.width || 1;
              const imgH = img.height || 1;
              const baseScale = Math.min(SRC_W / imgW, SRC_H / imgH);
              img.set({
                scaleX: baseScale * zoom,
                scaleY: baseScale * zoom,
                originX: 'center',
                originY: 'center',
                left: SRC_W / 2,
                top: SRC_H / 2,
              });
              applyColorFilter(img, layerColors?.[layer.id]);
              canvas.add(img);
            } catch (e) {
              console.error('Failed to load layer', layer.id, e);
            }
          }
        } else if (side?.imageUrl) {
          try {
            const img = await fabric.FabricImage.fromURL(side.imageUrl, { crossOrigin: 'anonymous' });
            if (disposed) { canvas.dispose(); return; }
            const imgW = img.width || 1;
            const imgH = img.height || 1;
            const baseScale = Math.min(SRC_W / imgW, SRC_H / imgH);
            img.set({
              scaleX: baseScale * zoom,
              scaleY: baseScale * zoom,
              originX: 'center',
              originY: 'center',
              left: SRC_W / 2,
              top: SRC_H / 2,
            });
            applyColorFilter(img);
            canvas.add(img);
          } catch (e) {
            console.error('Failed to load mockup image for', sideId, e);
          }
        }

        if (stateValue) {
          const sideData = typeof stateValue === 'string' ? JSON.parse(stateValue) : stateValue;
          if (sideData?.objects?.length) {
            const tempCanvas = new fabric.StaticCanvas(undefined, { width: SRC_W, height: SRC_H });
            await tempCanvas.loadFromJSON({ version: sideData.version || '6.0.0', objects: sideData.objects });
            if (disposed) { tempCanvas.dispose(); canvas.dispose(); return; }

            const objs = tempCanvas.getObjects();
            for (const obj of objs) {
              tempCanvas.remove(obj);
              canvas.add(obj);
            }
            tempCanvas.dispose();
          }
        }

        canvas.renderAll();
      } catch (e) {
        console.error('Error rendering sketch for side', sideId, e);
      }
    };

    init();

    return () => {
      disposed = true;
      if (fabricRef.current) { try { fabricRef.current.dispose(); } catch {} }
      fabricRef.current = null;
    };
  }, [sideId, side, stateValue, productColorHex, layerColors]);

  return (
    <div className="flex flex-col items-center">
      <div
        className="rounded-lg overflow-hidden"
        style={{ width: SRC_W * SKETCH_DISPLAY_SCALE, height: SRC_H * SKETCH_DISPLAY_SCALE }}
      >
        <canvas ref={canvasRef} className="origin-top-left" style={{ transform: `scale(${SKETCH_DISPLAY_SCALE})` }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{side?.name || sideId}</p>
    </div>
  );
}

// ============================================================================
// Request Detail Page
// ============================================================================

export default function CoBuyRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.requestId as string;

  const { data: requests, error: swrError, mutate } = useSWR<CoBuyRequest[]>(
    `/api/admin/cobuy/requests?id=${requestId}`,
    fetcher
  );
  const request = requests?.[0];

  const { data: comments, mutate: mutateComments } = useSWR<CoBuyRequestComment[]>(
    `/api/admin/cobuy/requests/${requestId}/comments`,
    fetcher
  );

  // Fetch admin design canvas state when linked
  const adminDesignId = request?.admin_design_id;
  const { data: adminDesignData } = useSWR(
    adminDesignId ? `/api/admin/designs/${adminDesignId}` : null,
    fetcher
  );

  const [commentText, setCommentText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [adminMemo, setAdminMemo] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);

  const [showShareLink, setShowShareLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [confirmPrice, setConfirmPrice] = useState('');
  const [confirmStartDate, setConfirmStartDate] = useState('');
  const [confirmEndDate, setConfirmEndDate] = useState('');
  const [confirmReceiveByDate, setConfirmReceiveByDate] = useState('');

  useEffect(() => {
    if (request) setAdminMemo(request.admin_notes || '');
  }, [request]);

  const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://modoouniform.com';
  const shareUrl = request ? `${APP_BASE_URL}/cobuy/request/${request.share_token}` : '';

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const updateRequest = async (updates: Record<string, unknown>) => {
    setIsUpdating(true);
    try {
      const res = await fetch('/api/admin/cobuy/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId, ...updates }),
      });
      if (!res.ok) throw new Error('Update failed');
      mutate();
    } catch (error) {
      console.error('Failed to update:', error);
      alert('업데이트에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const addComment = async () => {
    if (!commentText.trim()) return;
    try {
      await fetch(`/api/admin/cobuy/requests/${requestId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      setCommentText('');
      mutateComments();
    } catch { /* ignore */ }
  };

  if (swrError) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-red-500 mb-3">데이터를 불러오지 못했습니다.</p>
        <button
          onClick={() => router.push('/cobuy/requests')}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md"
        >
          목록으로
        </button>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <button onClick={() => router.push('/cobuy/requests')} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ChevronLeft className="w-4 h-4" /> 목록으로
      </button>

      <div className="space-y-4">
        {/* Request Info */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{request.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {(request as any).guest_name
                  ? `${(request as any).guest_name} (비회원)`
                  : (request as any).profiles?.email
                } · {formatDate(request.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${adminStatusColors[request.admin_status || 'not_reviewed']}`}>
                {adminStatusLabels[request.admin_status || 'not_reviewed']}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[request.status]}`}>
                {statusLabels[request.status]}
              </span>
            </div>
          </div>

          {/* Quantity & Schedule */}
          <div className="mb-3 grid grid-cols-2 gap-3">
            {(request.quantity_expectations as any)?.estimatedQuantity && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">수량</p>
                <p className="text-sm font-medium text-gray-900">{(request.quantity_expectations as any).estimatedQuantity}벌</p>
              </div>
            )}
            {(request.schedule_preferences as any)?.receiveByDate && (
              <div>
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">희망 수령일</p>
                <p className="text-sm text-gray-600">
                  {formatKstDateShort((request.schedule_preferences as any).receiveByDate)}
                </p>
              </div>
            )}
          </div>

          {request.description && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">참고사항</p>
              <p className="text-sm text-gray-600">{request.description}</p>
            </div>
          )}

          {/* Uploaded Reference Files */}
          {request.uploaded_image_paths && request.uploaded_image_paths.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">첨부 파일</p>
              <div className="space-y-1.5">
                {request.uploaded_image_paths.map((filePath: string, i: number) => {
                  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/user-designs/${filePath}`;
                  const fileName = filePath.split('/').pop() || filePath;
                  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                      {isImage ? (
                        <img src={url} alt={fileName} className="w-10 h-10 rounded object-cover shrink-0 border border-gray-200" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <span className="text-xs text-gray-600 truncate flex-1">{fileName}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Colors */}
          {(() => {
            const colorSelections = request.freeform_color_selections as Record<string, any> | null;
            const productConfig = (request as any).product?.configuration as ProductSideInfo[] | undefined;
            const productColor = colorSelections?._productColor;

            const layerColorInfo: { layerName: string; hex: string; colorCode?: string }[] = [];
            if (productConfig && colorSelections) {
              const seen = new Set<string>();
              productConfig.forEach((side: any) => {
                side.layers?.forEach((layer: any) => {
                  if (seen.has(layer.id)) return;
                  seen.add(layer.id);
                  let selectedHex: string | undefined;
                  for (const sideId of Object.keys(colorSelections)) {
                    if (sideId === '_productColor') continue;
                    const sideColors = colorSelections[sideId];
                    if (sideColors?.[layer.id]) { selectedHex = sideColors[layer.id]; break; }
                  }
                  if (!selectedHex) return;
                  const matched = layer.colorOptions?.find((co: any) => co.hex === selectedHex);
                  layerColorInfo.push({
                    layerName: layer.name,
                    hex: selectedHex,
                    colorCode: matched?.colorCode,
                  });
                });
              });
            }

            const hasColors = productColor || layerColorInfo.length > 0;
            if (!hasColors) return null;

            return (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-1.5">선택 색상</p>
                <div className="flex flex-wrap gap-2">
                  {productColor && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: productColor.hex }} />
                      <span className="text-xs text-gray-700">
                        {productColor.name}{productColor.colorCode && ` (${productColor.colorCode})`}
                      </span>
                    </div>
                  )}
                  {layerColorInfo.map((info, i) => (
                    <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: info.hex }} />
                      <span className="text-xs text-gray-700">
                        {info.layerName}{info.colorCode && ` (${info.colorCode})`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Design Preview */}
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-500 mb-1.5">디자인 미리보기</p>
            <FreeformSketchPreview
              canvasState={adminDesignData?.data?.canvas_state || request.freeform_canvas_state || {}}
              productSides={(request as any).product?.configuration}
              productColorHex={(request.freeform_color_selections as any)?._productColor?.hex}
              colorSelections={request.freeform_color_selections as Record<string, any> | undefined}
            />
          </div>

          {/* Guest Contact Info */}
          {(request as any).guest_name && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-800 mb-1.5">비회원 요청자 정보</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-amber-600">이름</p>
                  <p className="font-medium text-gray-900">{(request as any).guest_name}</p>
                </div>
                <div>
                  <p className="text-amber-600">이메일</p>
                  <p className="font-medium text-gray-900">{(request as any).guest_email || '-'}</p>
                </div>
                <div>
                  <p className="text-amber-600">전화번호</p>
                  <p className="font-medium text-gray-900">{(request as any).guest_phone || '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Request Details */}
          {request.confirmed_price && (
            <div className="text-xs mt-3 pt-3 border-t border-gray-100">
              <p className="text-gray-500">확정 가격</p>
              <p className="font-medium">₩{Number(request.confirmed_price).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Admin Internal */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-900 mb-3">관리자 내부 관리</p>
          <div className="mb-3">
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider block mb-1">관리자 상태</label>
            <div className="flex gap-1.5 flex-wrap">
              {(['not_reviewed', 'reviewing', 'quote_sent', 'contract_done', 'on_hold', 'cancelled'] as CoBuyRequestAdminStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => updateRequest({ admin_status: s })}
                  disabled={isUpdating}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition ${
                    request.admin_status === s
                      ? adminStatusColors[s] + ' ring-2 ring-offset-1 ring-blue-400'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  } disabled:opacity-50`}
                >
                  {adminStatusLabels[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider block mb-1">관리자 메모</label>
            <div className="flex gap-2">
              <textarea
                value={adminMemo}
                onChange={e => setAdminMemo(e.target.value)}
                placeholder="내부 메모를 입력하세요..."
                rows={2}
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
              />
              <button
                onClick={async () => {
                  setSavingMemo(true);
                  await updateRequest({ admin_notes: adminMemo.trim() || null });
                  setSavingMemo(false);
                }}
                disabled={savingMemo}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 self-end"
              >
                {savingMemo ? '저장중...' : '저장'}
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-900 mb-3">작업</p>
          <div className="flex flex-wrap gap-2">
            {(['pending', 'in_progress', 'feedback', 'design_shared', 'confirmed'] as CoBuyRequestStatus[]).includes(request.status) && (
              request.status === 'pending' ? (
                <button
                  onClick={async () => {
                    setIsUpdating(true);
                    try {
                      const res = await fetch('/api/admin/cobuy/requests', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: requestId, status: 'in_progress' }),
                      });
                      if (!res.ok) throw new Error('Update failed');
                      window.location.href = `/editor/${request.product_id}?mode=design&cobuyRequestId=${request.id}`;
                    } catch (error) {
                      console.error('Failed to update:', error);
                      alert('업데이트에 실패했습니다.');
                      setIsUpdating(false);
                    }
                  }}
                  disabled={isUpdating}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> 에디터 열기
                </button>
              ) : (
                <a
                  href={`/editor/${request.product_id}?mode=design&cobuyRequestId=${request.id}${request.admin_design_id ? `&designId=${request.admin_design_id}` : ''}`}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> 에디터 열기
                </a>
              )
            )}

            {request.admin_design_id && request.status === 'in_progress' && (
              <button
                onClick={async () => {
                  await updateRequest({ status: 'design_shared' });
                  setShowShareLink(true);
                }}
                disabled={isUpdating}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> 사용자에게 공유
              </button>
            )}

            {(request.status === 'design_shared' || request.status === 'feedback') && (
              <button
                onClick={() => setShowShareLink(s => !s)}
                className="px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-medium hover:bg-purple-100 flex items-center gap-1.5"
              >
                <Link2 className="w-3.5 h-3.5" /> 공유 링크 보기
              </button>
            )}

            {(request.status === 'feedback' || request.status === 'design_shared') && request.admin_design_id && (
              <button
                onClick={() => setShowConfirmForm(true)}
                disabled={isUpdating}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" /> 디자인 확정 및 세션 생성
              </button>
            )}

            {request.status !== 'rejected' && request.status !== 'session_created' && (
              <button
                onClick={() => {
                  if (confirm('이 요청을 거절하시겠습니까?')) {
                    updateRequest({ status: 'rejected' });
                  }
                }}
                disabled={isUpdating}
                className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50 flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" /> 거절
              </button>
            )}
          </div>
        </div>

        {/* Share Link */}
        {showShareLink && request.share_token && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <p className="text-sm font-medium text-purple-900 mb-2">공유 링크</p>
            <p className="text-xs text-purple-700 mb-2">이 링크를 사용자에게 보내주세요. 디자인을 확인하고 피드백을 남길 수 있습니다.</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 text-xs bg-white border border-purple-200 rounded-lg text-gray-700 select-all"
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={copyShareLink}
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                  linkCopied
                    ? 'bg-green-600 text-white'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {linkCopied ? <><Check className="w-3.5 h-3.5" /> 복사됨</> : <><Copy className="w-3.5 h-3.5" /> 복사</>}
              </button>
            </div>
          </div>
        )}

        {/* Confirm & Create Session Form */}
        {showConfirmForm && (
          <div className="bg-white border border-green-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-900 mb-3">세션 생성 정보</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">확정 가격 (원) *</label>
                <input
                  type="number"
                  value={confirmPrice}
                  onChange={e => setConfirmPrice(e.target.value)}
                  placeholder="예: 25000"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">모집 시작일 *</label>
                  <input
                    type="date"
                    value={confirmStartDate}
                    onChange={e => setConfirmStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">모집 종료일 *</label>
                  <input
                    type="date"
                    value={confirmEndDate}
                    onChange={e => setConfirmEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">수령 예정일 (선택)</label>
                <input
                  type="date"
                  value={confirmReceiveByDate}
                  onChange={e => setConfirmReceiveByDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={async () => {
                    if (!confirmPrice || !confirmStartDate || !confirmEndDate) {
                      alert('가격, 시작일, 종료일은 필수입니다.');
                      return;
                    }
                    setIsUpdating(true);
                    try {
                      const res = await fetch(`/api/admin/cobuy/requests/${requestId}/confirm`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          confirmed_price: Number(confirmPrice),
                          start_date: new Date(confirmStartDate).toISOString(),
                          end_date: new Date(confirmEndDate).toISOString(),
                          receive_by_date: confirmReceiveByDate ? new Date(confirmReceiveByDate).toISOString() : null,
                        }),
                      });
                      if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error || 'Failed');
                      }
                      alert('공동구매 세션이 생성되었습니다!');
                      mutate();
                      setShowConfirmForm(false);
                    } catch (err: any) {
                      alert(err.message || '세션 생성에 실패했습니다.');
                    } finally {
                      setIsUpdating(false);
                    }
                  }}
                  disabled={isUpdating}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {isUpdating ? '생성 중...' : '확정 및 세션 생성'}
                </button>
                <button
                  onClick={() => setShowConfirmForm(false)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Session Created Info */}
        {request.status === 'session_created' && request.cobuy_session_id && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm font-medium text-emerald-800 mb-1">공동구매 세션 생성됨</p>
            <p className="text-xs text-emerald-700">세션 ID: {request.cobuy_session_id}</p>
            {request.confirmed_price && (
              <p className="text-xs text-emerald-700">확정 가격: ₩{Number(request.confirmed_price).toLocaleString()}</p>
            )}
          </div>
        )}

        {/* Comments */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" /> 댓글 ({comments?.length || 0})
          </p>

          <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
            {comments?.map(comment => (
              <div key={comment.id} className={`p-2.5 rounded-lg text-xs ${comment.is_admin ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`font-medium ${comment.is_admin ? 'text-blue-700' : 'text-gray-700'}`}>
                    {comment.is_admin ? '관리자' : ((comment as any).profiles?.name || (comment as any).profiles?.email || '사용자')}
                  </span>
                  <span className="text-gray-400">{formatDate(comment.created_at)}</span>
                </div>
                <p className="text-gray-600">{comment.content}</p>
              </div>
            )) || null}
            {(!comments || comments.length === 0) && (
              <p className="text-xs text-gray-400 text-center py-4">댓글이 없습니다.</p>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
              placeholder="관리자 댓글 작성..."
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={addComment}
              disabled={!commentText.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Send className="w-3 h-3" /> 전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
