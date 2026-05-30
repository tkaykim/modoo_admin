import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'application/postscript', 'application/illustrator', 'application/vnd.adobe.illustrator',
];
const MAX_FILES = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB/파일

function pickExtension(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('image/')) return 'jpg';
  return 'bin';
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const formData = await req.formData();
  const files = formData.getAll('files').filter((v): v is File => v instanceof File);
  if (files.length === 0) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `최대 ${MAX_FILES}개까지 업로드 가능합니다.` }, { status: 400 });

  for (const file of files) {
    const ok = ALLOWED_TYPES.includes(file.type) || file.name.toLowerCase().endsWith('.ai');
    if (!ok) return NextResponse.json({ error: `허용되지 않은 파일 형식: ${file.name}` }, { status: 400 });
    if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: `파일이 너무 큽니다(최대 50MB): ${file.name}` }, { status: 400 });
  }

  const admin = createAdminClient();
  const uploaded: Array<{ url: string; name: string }> = [];
  for (const file of files) {
    const path = `admin/${crypto.randomUUID()}.${pickExtension(file)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from('inquiry-files').upload(path, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) return NextResponse.json({ error: error.message || '업로드 실패' }, { status: 500 });
    const { data: { publicUrl } } = admin.storage.from('inquiry-files').getPublicUrl(path);
    uploaded.push({ url: publicUrl, name: file.name });
  }
  return NextResponse.json({ data: uploaded });
}
