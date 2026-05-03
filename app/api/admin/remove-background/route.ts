import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { error: NextResponse.json({ error: authError.message }, { status: 401 }) };
  }

  if (!user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return { error: NextResponse.json({ error: profileError.message }, { status: 403 }) };
  }

  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }

  return { user };
};

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: '이미지 파일이 필요합니다.' }, { status: 400 });
    }

    // Validate file type
    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ error: '올바른 이미지 형식이 아닙니다.' }, { status: 400 });
    }

    // Check if API key is configured
    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'remove.bg API 키가 설정되지 않았습니다.' }, { status: 500 });
    }

    // Upload original image to Supabase first
    const adminClient = createAdminClient();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = imageFile.name.split('.').pop() || 'png';
    const originalFileName = `partner-mall-logos/original/${timestamp}-${randomStr}.${ext}`;

    const originalBuffer = Buffer.from(await imageFile.arrayBuffer());
    const { data: originalUpload, error: originalUploadError } = await adminClient.storage
      .from('products')
      .upload(originalFileName, originalBuffer, {
        contentType: imageFile.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (originalUploadError) {
      console.error('Original image upload error:', originalUploadError);
      return NextResponse.json({ error: '원본 이미지 업로드에 실패했습니다.' }, { status: 500 });
    }

    const { data: { publicUrl: originalUrl } } = adminClient.storage
      .from('products')
      .getPublicUrl(originalFileName);

    // Call remove.bg API
    const removeBgFormData = new FormData();
    removeBgFormData.append('image_file', imageFile);
    removeBgFormData.append('size', 'auto');
    removeBgFormData.append('format', 'png');

    const removeBgResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: removeBgFormData,
    });

    if (!removeBgResponse.ok) {
      const errorData = await removeBgResponse.json().catch(() => ({}));
      console.error('remove.bg API error:', errorData);
      return NextResponse.json(
        { error: errorData?.errors?.[0]?.title || '배경 제거에 실패했습니다.' },
        { status: removeBgResponse.status }
      );
    }

    // Get the processed image
    const processedImageBuffer = Buffer.from(await removeBgResponse.arrayBuffer());

    // Upload processed image to Supabase
    const processedFileName = `partner-mall-logos/processed/${timestamp}-${randomStr}.png`;
    const { data: processedUpload, error: processedUploadError } = await adminClient.storage
      .from('products')
      .upload(processedFileName, processedImageBuffer, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      });

    if (processedUploadError) {
      console.error('Processed image upload error:', processedUploadError);
      return NextResponse.json({ error: '처리된 이미지 업로드에 실패했습니다.' }, { status: 500 });
    }

    const { data: { publicUrl: processedUrl } } = adminClient.storage
      .from('products')
      .getPublicUrl(processedFileName);

    return NextResponse.json({
      data: {
        original_url: originalUrl,
        processed_url: processedUrl,
        original_path: originalFileName,
        processed_path: processedFileName,
      },
    });
  } catch (error) {
    console.error('Remove background error:', error);
    const message = error instanceof Error ? error.message : '배경 제거 처리에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
