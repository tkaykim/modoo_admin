'use client';

import { use } from 'react';
import AdminGroupDetail from '@/components/templates/AdminGroupDetail';

export default function AdminGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <AdminGroupDetail groupId={id} />;
}
