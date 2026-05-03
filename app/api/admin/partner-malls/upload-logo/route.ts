import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from '@/lib/storage-config';

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

/**
 * Upload a partner mall logo to Supabase storage
 * Accepts base64 data URL and returns public storage URL
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const payload = await request.json().catch(() => null);
    const imageBase64 = payload?.imageBase64;
    const partnerMallId = payload?.partnerMallId; // Optional: for naming the file

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: '이미지 데이터가 필요합니다.' }, { status: 400 });
    }

    // Validate it's a data URL
    if (!imageBase64.startsWith('data:image/')) {
      return NextResponse.json({ error: '올바른 이미지 형식이 아닙니다.' }, { status: 400 });
    }

    // Extract MIME type and base64 data
    const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: '이미지 데이터 파싱에 실패했습니다.' }, { status: 400 });
    }

    const fileExt = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const base64Data = matches[2];

    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const fileName = partnerMallId
      ? `${partnerMallId}-${timestamp}.${fileExt}`
      : `${timestamp}-${randomStr}.${fileExt}`;
    const filePath = `${STORAGE_FOLDERS.PARTNER_MALL_LOGOS}/${fileName}`;

    // Upload using admin client
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.storage
      .from(STORAGE_BUCKETS.USER_DESIGNS)
      .upload(filePath, buffer, {
        contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Logo upload error:', error);
      return NextResponse.json({ error: '로고 업로드에 실패했습니다.' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = adminClient.storage
      .from(STORAGE_BUCKETS.USER_DESIGNS)
      .getPublicUrl(data.path);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: data.path,
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    const message = error instanceof Error ? error.message : '로고 업로드에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
