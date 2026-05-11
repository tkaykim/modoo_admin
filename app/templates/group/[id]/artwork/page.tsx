'use client';

import { use } from 'react';
import GroupArtworkEditor from '@/components/templates/GroupArtworkEditor';

export default function GroupArtworkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <GroupArtworkEditor groupId={id} />;
}
