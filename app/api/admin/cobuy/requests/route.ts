import { NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';

const requireAdmin = async () => {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || (!isAdminLike(profile.role))) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { user };
};

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const id = url.searchParams.get('id');

    const admin = createAdminClient();
    let query = admin
      .from('cobuy_requests')
      .select(`
        *,
        product:products (id, title, thumbnail_image_link, configuration),
        profiles:profiles!cobuy_requests_user_id_fkey (email, name)
      `)
      .order('created_at', { ascending: false });

    if (id) {
      query = query.eq('id', id);
    } else if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform nested arrays to objects
    const transformed = (data || []).map((item: any) => ({
      ...item,
      product: Array.isArray(item.product) ? item.product[0] : item.product,
      profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
    }));

    return NextResponse.json(transformed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin();
    if (authResult.error) return authResult.error;

    const body = await request.json();
    const { id, status, admin_design_id, admin_design_preview_url, confirmed_price, admin_status, admin_notes, preview_images } = body;

    if (!id) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (status) updateData.status = status;
    if (admin_design_id !== undefined) updateData.admin_design_id = admin_design_id;
    if (admin_design_preview_url !== undefined) updateData.admin_design_preview_url = admin_design_preview_url;
    if (confirmed_price !== undefined) updateData.confirmed_price = confirmed_price;
    if (admin_status !== undefined) updateData.admin_status = admin_status;
    if (admin_notes !== undefined) updateData.admin_notes = admin_notes;

    // Upload per-side preview images to storage
    if (preview_images && typeof preview_images === 'object') {
      const previewUrls: Record<string, { url: string; name: string }> = {};
      for (const [sideId, info] of Object.entries(preview_images as Record<string, { base64: string; name: string }>)) {
        const { base64, name } = info;
        if (!base64?.startsWith('data:')) continue;
        try {
          const match = base64.match(/^data:image\/(\w+);base64,(.+)$/);
          if (!match) continue;
          const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
          const buffer = Buffer.from(match[2], 'base64');
          const filePath = `cobuy-previews/${id}-${sideId}.${ext}`;
          const { error: uploadErr } = await admin.storage
            .from('user-designs')
            .upload(filePath, buffer, { contentType: `image/${match[1]}`, upsert: true });
          if (!uploadErr) {
            const { data: publicUrl } = admin.storage.from('user-designs').getPublicUrl(filePath);
            previewUrls[sideId] = { url: publicUrl.publicUrl, name };
          }
        } catch (err) {
          console.error(`Failed to upload preview for side ${sideId}:`, err);
        }
      }
      if (Object.keys(previewUrls).length > 0) {
        updateData.admin_design_preview_urls = previewUrls;
        // Set the first side as the main preview URL for backward compat
        const firstUrl = Object.values(previewUrls)[0]?.url;
        if (firstUrl) updateData.admin_design_preview_url = firstUrl;
      }
    }

    // On rejection, clean up uploaded images from storage
    if (status === 'rejected') {
      const { data: existing } = await admin
        .from('cobuy_requests')
        .select('uploaded_image_paths, freeform_preview_url')
        .eq('id', id)
        .single();

      if (existing) {
        const pathsToDelete: string[] = [...(existing.uploaded_image_paths || [])];
        // Extract storage path from preview URL
        if (existing.freeform_preview_url) {
          const match = existing.freeform_preview_url.match(/user-designs\/(.+)$/);
          if (match) pathsToDelete.push(match[1]);
        }
        if (pathsToDelete.length > 0) {
          await admin.storage.from('user-designs').remove(pathsToDelete);
        }
      }
    }

    const { data, error } = await admin
      .from('cobuy_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
