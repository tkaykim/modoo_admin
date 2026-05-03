'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import UnifiedEditor from '@/components/editor/UnifiedEditor';

function EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const productId = params.productId as string;
  const mode = (searchParams.get('mode') || 'design') as 'design' | 'order' | 'template';
  const orderId = searchParams.get('orderId') || undefined;
  const orderItemId = searchParams.get('orderItemId') || undefined;
  const templateId = searchParams.get('templateId') || undefined;
  const designId = searchParams.get('designId') || undefined;
  const returnUrl = searchParams.get('returnUrl') || undefined;
  const cobuyRequestId = searchParams.get('cobuyRequestId') || undefined;
  const partnerMallAdd = searchParams.get('partnerMallAdd') === 'true';
  const presetType = searchParams.get('presetType') || undefined;

  return (
    <UnifiedEditor
      productId={productId}
      mode={mode}
      orderId={orderId}
      orderItemId={orderItemId}
      templateId={templateId}
      designId={designId}
      returnUrl={returnUrl}
      cobuyRequestId={cobuyRequestId}
      partnerMallAdd={partnerMallAdd}
      presetType={presetType}
    />
  );
}

export default function EditorPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <EditorPage />
    </Suspense>
  );
}
