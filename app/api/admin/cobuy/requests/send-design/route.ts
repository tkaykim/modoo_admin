import { NextRequest, NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendMailjetEmail } from '@/lib/mailjet';

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

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult.error) return authResult.error;

  let body: { requestId: string; pricePerItem: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { requestId, pricePerItem } = body;
  if (!requestId || !pricePerItem || pricePerItem <= 0) {
    return NextResponse.json({ error: 'requestId and pricePerItem are required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: req, error } = await admin
    .from('cobuy_requests')
    .select('*, product:products (title, thumbnail_image_link)')
    .eq('id', requestId)
    .single();

  if (error || !req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const recipientEmail = req.guest_email;
  const recipientName = req.guest_name || '고객';
  if (!recipientEmail) {
    return NextResponse.json({ error: '고객 이메일이 없습니다.' }, { status: 400 });
  }

  const baseUrl = 'https://modoouniform.com';
  const logoUrl = `${baseUrl}/icons/modoo_logo.png`;
  const designLink = `${baseUrl}/cobuy/request/${req.share_token}`;

  // Collect per-side preview URLs
  const previewUrls: { url: string; name: string }[] = [];
  const perSidePreviews = req.admin_design_preview_urls as Record<string, { url: string; name: string }> | null;
  if (perSidePreviews && typeof perSidePreviews === 'object') {
    for (const info of Object.values(perSidePreviews)) {
      if (info?.url) previewUrls.push(info);
    }
  }
  // Fallback to single preview URL
  if (previewUrls.length === 0 && req.admin_design_preview_url) {
    previewUrls.push({ url: req.admin_design_preview_url, name: '미리보기' });
  }

  const previewHtml = previewUrls.length > 0 ? `
        <div style="margin: 0 0 24px 0; padding: 20px; background: #f8f9fc; border-radius: 12px;">
          ${previewUrls.length > 1 ? '<p style="font-size: 14px; font-weight: bold; color: #333; margin: 0 0 12px 0; text-align: center;">디자인 미리보기</p>' : ''}
          <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            ${previewUrls.map(p => `
              <td style="text-align: center; vertical-align: top; padding: 0 4px;">
                <img src="${p.url}" alt="${p.name}" style="max-width: 100%; max-height: 280px; border-radius: 8px;" />
                ${previewUrls.length > 1 ? `<p style="font-size: 12px; color: #888; margin: 6px 0 0 0;">${p.name}</p>` : ''}
              </td>
            `).join('')}
          </tr></table>
        </div>` : '';

  const htmlPart = `
    <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <!-- Header -->
      <div style="text-align: center; padding: 24px 0; background: #f8f9fc;">
        <img src="${logoUrl}" alt="모두의 유니폼" style="height: 48px;" />
      </div>
      <div style="height: 3px; background: #3B55A5;"></div>

      <!-- Body -->
      <div style="padding: 32px 28px;">
        <p style="font-size: 17px; color: #222; line-height: 1.7; margin: 0 0 8px 0;"><strong>안녕하세요, ${recipientName}님</strong></p>
        <p style="font-size: 17px; color: #222; line-height: 1.7; margin: 0 0 8px 0;"><strong>요청하신 디자인과 견적이 준비되었습니다.</strong></p>
        <p style="font-size: 14px; color: #666; line-height: 1.7; margin: 0 0 28px 0;">
          아래 버튼을 눌러 디자인을 확인하고,<br />
          마음에 드시면 확정해 주세요.
        </p>

        <!-- Design Previews -->
        ${previewHtml}

        <!-- CTA -->
        <div style="text-align: center; margin: 0 0 28px 0;">
          <a href="${designLink}" style="display: block; width: 80%; max-width: 360px; margin: 0 auto; padding: 16px 0; background-color: #3B55A5; color: #ffffff; border-radius: 10px; font-weight: bold; font-size: 15px; text-decoration: none; text-align: center;">디자인 확인하기</a>
        </div>

        <p style="font-size: 13px; color: #888; text-align: center; line-height: 1.6;">
          궁금한 점이 있으시면 페이지에서 편하게 문의해주세요.
        </p>
      </div>

      <!-- Footer -->
      <div style="border-top: 1px solid #e5e7eb; padding: 24px 28px; background: #f8f9fc;">
        <img src="${logoUrl}" alt="모두의 유니폼" style="height: 32px; margin-bottom: 12px;" />
        <p style="margin: 0 0 2px 0; font-size: 13px; font-weight: bold; color: #333;">MODOO UNIFORM | 모두의 유니폼</p>
        <p style="margin: 0 0 2px 0; font-size: 12px; color: #888;">대표이사 김현준</p>
        <p style="margin: 0 0 2px 0; font-size: 12px; color: #888;">서울특별시 마포구 성지3길 55, 4층</p>
        <p style="margin: 0; font-size: 12px; color: #888;">T. 010-8140-0621 | W. <a href="https://www.modoouniform.com" style="color: #3B55A5; text-decoration: none;">www.modoouniform.com</a></p>
      </div>
    </div>
  `;

  const textPart = `안녕하세요, ${recipientName}님\n모두의 유니폼입니다.\n\n요청하신 디자인과 견적이 준비되었습니다.\n디자인 확인하기: ${designLink}`;

  // Update request status and price
  await admin
    .from('cobuy_requests')
    .update({
      status: 'design_shared',
      confirmed_price: pricePerItem,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  const sent = await sendMailjetEmail({
    to: [{ email: recipientEmail, name: recipientName }],
    subject: `[모두의 유니폼] ${req.title} 디자인 및 견적 안내`,
    textPart,
    htmlPart,
    customId: `cobuy-design-${requestId}`,
  });

  if (!sent) {
    return NextResponse.json({ error: '이메일 발송에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
