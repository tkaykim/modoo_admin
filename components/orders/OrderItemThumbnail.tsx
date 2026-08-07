'use client';

import { Package } from 'lucide-react';
import { resolveOrderItemPreview, type OrderItemPreviewSource } from '@/lib/orderItemPreview';

/**
 * 주문 상품 썸네일. 저장된 스냅샷이 빈 면을 찍은 경우 디자인이 있는 면의
 * 아트워크로 대체해 보여준다. 판별 규칙은 lib/orderItemPreview.ts 참고.
 */
export default function OrderItemThumbnail({
  item,
  alt = '',
  className = '',
  iconClassName = 'w-8 h-8',
  showSideBadge = true,
}: {
  item: OrderItemPreviewSource;
  alt?: string;
  /** 바깥 박스 크기/테두리 (예: 'w-20 h-20 rounded') */
  className?: string;
  /** placeholder 아이콘 크기 */
  iconClassName?: string;
  /** 대체 렌더 시 어느 면인지 배지 표시 (아주 작은 썸네일에서는 끄기) */
  showSideBadge?: boolean;
}) {
  const preview = resolveOrderItemPreview(item);

  return (
    <div className={`relative bg-gray-100 shrink-0 overflow-hidden ${className}`}>
      {preview.src ? (
        <img
          src={preview.src}
          alt={alt}
          // 아트워크는 배경이 투명한 원본이라 잘리지 않게 contain + 여백.
          className={
            preview.mode === 'artwork'
              ? 'w-full h-full object-contain p-1 bg-white'
              : 'w-full h-full object-cover'
          }
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Package className={`${iconClassName} text-gray-400`} />
        </div>
      )}

      {preview.mode === 'artwork' && preview.sideLabel && showSideBadge && (
        <span
          title={`${preview.sideLabel}에만 디자인이 있어 해당 면 시안을 표시합니다.`}
          className="absolute bottom-0 inset-x-0 bg-gray-900/70 text-white text-[9px] leading-[13px] text-center font-medium"
        >
          {preview.sideLabel}
        </span>
      )}
    </div>
  );
}
