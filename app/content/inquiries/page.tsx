import { Suspense } from 'react';
import { InquiriesSection } from '@/components/content-management';

export default function InquiriesPage() {
  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">문의 관리</h2>
      <Suspense fallback={<div className="text-gray-500">불러오는 중...</div>}>
        <InquiriesSection />
      </Suspense>
    </div>
  );
}
