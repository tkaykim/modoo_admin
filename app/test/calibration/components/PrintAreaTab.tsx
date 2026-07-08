'use client';

import { useEffect, useState } from 'react';
import PrintAreaEditor from '@/components/PrintAreaEditor';
import type { Product, ProductSide } from '@/types/types';
import {
  fetchProductRaw,
  loadCalibPayloadsForProduct,
  upsertCalibPayload,
  type CalibPayloadRow,
} from '../lib/operationalDb';

interface Props {
  /** 캘리브 도구 내부 product id (op-{realId}). */
  productId: string;
  /** 캘리브 도구 내부 side id (op-{realProductId}-{realSideId}). 상단 면 선택과 동기화. */
  sideId?: string;
  /** 저장 후 캘리브 상태(printAreaPx/실측mm)를 다시 동기화하기 위한 콜백. */
  onSaved?: () => void;
  /** 내부 캐러셀로 면을 바꾸면 캘리브 도구의 면 선택(드롭다운)도 맞추기 위한 콜백.
   *  PrintAreaEditor가 주는 realSideId를 캘리브 내부 sideId(op-{realProductId}-{realSideId})로 변환해 전달. */
  onSideChange?: (calibSideId: string) => void;
}

/**
 * 인쇄영역 실측 도구 (환산 1순위 소스).
 *
 * 제품관리의 PrintAreaEditor를 임베드하되 캘리브 화면에서는 저장을 한 번으로 묶는다.
 * 저장 시 products.configuration과 product_calibrations.payload.printAreaRealMm을 같이 갱신한다.
 */
export function PrintAreaTab({ productId, sideId, onSaved, onSideChange }: Props) {
  const isOperational = productId.startsWith('op-');
  const realId = isOperational ? productId.slice(3) : productId;
  // 캘리브 내부 sideId(op-{realProductId}-{realSideId}) → 실제 side id로 환원.
  const realSideId =
    sideId && sideId.startsWith(`op-${realId}-`)
      ? sideId.slice(`op-${realId}-`.length)
      : sideId;

  const [product, setProduct] = useState<Product | null>(null);
  const [calibrationRows, setCalibrationRows] = useState<CalibPayloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      setProduct(null);
      setCalibrationRows([]);
      if (!isOperational) {
        setErr('운영 DB에서 불러온 제품만 편집할 수 있습니다. (로컬 추가 제품 불가)');
        setLoading(false);
        return;
      }
      try {
        const [raw, rows] = await Promise.all([
          fetchProductRaw(realId),
          loadCalibPayloadsForProduct(realId),
        ]);
        if (cancelled) return;
        if (!raw) {
          setErr('제품을 찾을 수 없습니다.');
          return;
        }
        setCalibrationRows(rows);
        setProduct(mergeProductWithCalibrationRows(raw, rows));
      } catch (e: unknown) {
        if (!cancelled) setErr(getErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, realId, isOperational]);

  const handlePersist = async (nextSides: ProductSide[]) => {
    if (!product) return null;

    const response = await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: realId, configuration: nextSides }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || '인쇄영역 제품 설정 저장에 실패했습니다.');
    }

    const payload = await response.json().catch(() => ({}));
    await persistPrintAreaCalibrationRows(realId, nextSides, calibrationRows);

    const refreshedRows = await loadCalibPayloadsForProduct(realId);
    const updatedProduct = (payload?.data ?? { ...product, configuration: nextSides }) as Product;
    const mergedProduct = mergeProductWithCalibrationRows(updatedProduct, refreshedRows);
    setCalibrationRows(refreshedRows);
    setProduct(mergedProduct);
    return mergedProduct;
  };

  if (loading) return <div className="p-8 text-sm text-gray-500">제품 구성 불러오는 중...</div>;
  if (err) return <div className="p-8 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded">{err}</div>;
  if (!product) return null;

  return (
    <div>
      <div className="mb-3 text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded px-3 py-2">
        <b>인쇄영역 실측 (환산 1순위)</b> · 파란 영역을 드래그/모서리로 크기 조절하고, 우측{' '}
        <b>실제 치수(mm)</b>에 공장 인쇄 스펙을 입력한 뒤 <b>인쇄영역+캘리브 저장</b>을 누르세요.
        운영 제품 설정과 고객 앱 캘리브 기준이 같이 갱신됩니다.
      </div>
      <PrintAreaEditor
        product={product}
        initialSideId={realSideId}
        saveLabel="인쇄영역+캘리브 저장"
        savingLabel="인쇄영역+캘리브 저장 중..."
        saveHelpText="운영 제품 설정과 고객 앱 캘리브 기준을 함께 저장합니다."
        onPersist={handlePersist}
        onSave={(updatedProduct) => {
          setProduct(updatedProduct);
          onSaved?.();
        }}
        onCancel={() => onSaved?.()}
        onSideChange={(realSid) => onSideChange?.(`op-${realId}-${realSid}`)}
      />
    </div>
  );
}

function mergeProductWithCalibrationRows(
  raw: { id: string; title: string; configuration: unknown },
  rows: CalibPayloadRow[],
): Product {
  const rowsBySide = new Map(rows.map((row) => [row.side_id, row]));
  const configuration = Array.isArray(raw.configuration) ? raw.configuration : [];
  const mergedConfiguration = configuration.map((side) => {
    if (!side || typeof side !== 'object') return side;

    const productSide = side as ProductSide;
    const row = rowsBySide.get(productSide.id);
    const printAreaRealMm = row?.payload?.printAreaRealMm;
    const widthMm =
      normalizePositiveMm(printAreaRealMm?.widthMm) ??
      normalizePositiveMm(productSide.realLifeDimensions?.printAreaWidthMm);
    const heightMm =
      normalizePositiveMm(printAreaRealMm?.heightMm) ??
      normalizePositiveMm(productSide.realLifeDimensions?.printAreaHeightMm);

    if (widthMm === null && heightMm === null) return productSide;

    const realLifeDimensions = {
      ...productSide.realLifeDimensions,
      productWidthMm: Number(productSide.realLifeDimensions?.productWidthMm) || 0,
    };

    if (widthMm !== null) realLifeDimensions.printAreaWidthMm = widthMm;
    if (heightMm !== null) realLifeDimensions.printAreaHeightMm = heightMm;

    return {
      ...productSide,
      realLifeDimensions,
    };
  });

  return {
    ...(raw as unknown as Product),
    configuration: mergedConfiguration as ProductSide[],
  };
}

async function persistPrintAreaCalibrationRows(
  productId: string,
  sides: ProductSide[],
  existingRows: CalibPayloadRow[],
): Promise<void> {
  const rowsBySide = new Map(existingRows.map((row) => [row.side_id, row]));

  await Promise.all(
    sides.map(async (side) => {
      if (!side.id) return;

      const existing = rowsBySide.get(side.id);
      const widthMm = normalizePositiveMm(side.realLifeDimensions?.printAreaWidthMm);
      const heightMm = normalizePositiveMm(side.realLifeDimensions?.printAreaHeightMm);
      if (!existing && widthMm === null && heightMm === null) return;

      const existingPayload =
        existing?.payload && typeof existing.payload === 'object' ? existing.payload : {};
      await upsertCalibPayload(productId, side.id, {
        ...existingPayload,
        printAreaRealMm: {
          widthMm,
          heightMm,
        },
      });
    }),
  );
}

function normalizePositiveMm(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
