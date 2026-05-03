import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  COMPANY_SEAL_BUCKET,
  COMPANY_SEAL_MAX_BYTES,
  COMPANY_SEAL_STORAGE_PATH,
  isPngBuffer,
  companySealExists,
} from '@/lib/company-seal';

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
}

const BUCKET_PUBLIC = 'admin-documents';

export async function GET() {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from('admin_documents')
      .select('*')
      .order('doc_type');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const docs = data || [];

    const hasSeal = await companySealExists(adminClient);
    if (hasSeal) {
      docs.push({
        id: '__seal__',
        doc_type: 'company_seal',
        file_name: COMPANY_SEAL_STORAGE_PATH,
        file_url: null,
        storage_path: COMPANY_SEAL_STORAGE_PATH,
        uploaded_at: null,
      } as never);
    }

    return NextResponse.json({ data: docs });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문서 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const docType = formData.get('doc_type') as string | null;

    if (!file || !docType) {
      return NextResponse.json({ error: '파일과 문서 유형이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    if (docType === 'company_seal') {
      if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
        return NextResponse.json({ error: '도장은 PNG 파일만 등록할 수 있습니다.' }, { status: 400 });
      }
      if (file.size > COMPANY_SEAL_MAX_BYTES) {
        return NextResponse.json(
          { error: `파일 크기는 ${COMPANY_SEAL_MAX_BYTES / 1024 / 1024}MB 이하여야 합니다.` },
          { status: 400 },
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      if (!isPngBuffer(arrayBuffer)) {
        return NextResponse.json({ error: '유효한 PNG 이미지가 아닙니다.' }, { status: 400 });
      }

      const { error: uploadError } = await adminClient.storage
        .from(COMPANY_SEAL_BUCKET)
        .upload(COMPANY_SEAL_STORAGE_PATH, arrayBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message || '도장 업로드에 실패했습니다. admin-seal 버킷을 생성했는지 확인하세요.' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        data: {
          id: '__seal__',
          doc_type: 'company_seal',
          file_name: file.name,
          file_url: null,
          storage_path: COMPANY_SEAL_STORAGE_PATH,
        },
      });
    }

    if (!['business_registration', 'bank_account'].includes(docType)) {
      return NextResponse.json({ error: '올바르지 않은 문서 유형입니다.' }, { status: 400 });
    }

    const { data: existing } = await adminClient
      .from('admin_documents')
      .select('id, storage_path')
      .eq('doc_type', docType)
      .maybeSingle();

    if (existing) {
      await adminClient.storage.from(BUCKET_PUBLIC).remove([existing.storage_path]);
      await adminClient.from('admin_documents').delete().eq('id', existing.id);
    }

    const ext = file.name.split('.').pop() || 'pdf';
    const storagePath = `${docType}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET_PUBLIC)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = adminClient.storage.from(BUCKET_PUBLIC).getPublicUrl(storagePath);

    const { data: doc, error: insertError } = await adminClient
      .from('admin_documents')
      .insert({
        doc_type: docType,
        file_name: file.name,
        file_url: urlData.publicUrl,
        storage_path: storagePath,
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ data: doc });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문서 업로드에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const docType = url.searchParams.get('doc_type');

    if (!docType) {
      return NextResponse.json({ error: '문서 유형이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    if (docType === 'company_seal') {
      await adminClient.storage.from(COMPANY_SEAL_BUCKET).remove([COMPANY_SEAL_STORAGE_PATH]);
      return NextResponse.json({ success: true });
    }

    if (!['business_registration', 'bank_account'].includes(docType)) {
      return NextResponse.json({ error: '올바르지 않은 문서 유형입니다.' }, { status: 400 });
    }

    const { data: existing } = await adminClient
      .from('admin_documents')
      .select('id, storage_path')
      .eq('doc_type', docType)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: '해당 문서가 없습니다.' }, { status: 404 });
    }

    await adminClient.storage.from(BUCKET_PUBLIC).remove([existing.storage_path]);
    await adminClient.from('admin_documents').delete().eq('id', existing.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '문서 삭제에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
