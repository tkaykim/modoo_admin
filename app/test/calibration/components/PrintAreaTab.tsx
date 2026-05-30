'use client';

import { useEffect, useState } from 'react';
import PrintAreaEditor from '@/components/PrintAreaEditor';
import type { Product } from '@/types/types';
import { fetchProductRaw } from '../lib/operationalDb';

interface Props {
  /** 캘리브 도구 내부 product id (op-{realId}). */
  productId: string;
  /** 캘리브 도구 내부 side id (op-{realProductId}-{realSideId}). 상단 면 선택과 동기화. */
  sideId?: string;
  /** 저장 후 캘리브 상태(printAreaPx/실측mm)를 다시 동기화하기 위한 콜백. */
  onSaved?: () => void;
}

/**
 * 인쇄영역 실측 도구 (환산 1순위 소스).
 *
 * 제품관리의 PrintAreaEditor를 그대로 임베드한다 — 인쇄영역 사각형 드래그/리사이즈
 * + 실제 크기(mm) 입력 + 저장이 모두 가능. 저장은 PrintAreaEditor가 /api/admin/products
 * PATCH로 products.configuration에 직접 반영(제품관리와 동일 경로). 별도 캘리브 우회 없음.
 */
export function PrintAreaTab({ productId, sideId, onSaved }: Props) {
  const isOperational = productId.startsWith('op-');
  const realId = isOperational ? productId.slice(3) : productId;
  // 캘리브 내부 sideId(op-{realProductId}-{realSideId}) → 실제 side id로 환원.
  const realSideId =
    sideId && sideId.startsWith(`op-${realId}-`)
      ? sideId.slice(`op-${realId}-`.length)
      : sideId;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setProduct(null);
    if (!isOperational) {
      setErr('운영 DB에서 불러온 제품만 편집할 수 있습니다. (로컬 추가 제품 불가)');
      setLoading(false);
      return;
    }
    fetchProductRaw(realId)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setErr('제품을 찾을 수 없습니다.');
          return;
        }
        // PrintAreaEditor는 id/title/configuration만 사용. 나머지 필드는 PATCH 시 보존됨.
        setProduct(raw as unknown as Product);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, realId, isOperational]);

  if (loading) return <div className="p-8 text-sm text-gray-500">제품 구성 불러오는 중...</div>;
  if (err) return <div className="p-8 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded">{err}</div>;
  if (!product) return null;

  return (
    <div>
      <div className="mb-3 text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
        <b>인쇄영역 실측 (환산 1순위)</b> · 파란 영역을 드래그/모서리로 크기 조절하고, 우측
        "실제 치수(mm)"에 공장 인쇄 스펙을 입력한 뒤 <b>저장</b>하세요. 저장 시 운영 제품에
        바로 반영되고, 시뮬레이션 탭에서 캘리브와 비교됩니다.
      </div>
      <PrintAreaEditor
        product={product}
        initialSideId={realSideId}
        onSave={() => onSaved?.()}
        onCancel={() => onSaved?.()}
      />
    </div>
  );
}
