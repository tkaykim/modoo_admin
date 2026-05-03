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

function getElapsedText(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}일 전`;
  if (hours > 0) return `${hours}시간 전`;
  if (minutes > 0) return `${minutes}분 전`;
  return '방금 전';
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin();
  if (authResult.error) return authResult.error;

  let body: { requestId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { requestId } = body;
  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: req, error } = await admin
    .from('cobuy_requests')
    .select('*, product:products (title)')
    .eq('id', requestId)
    .single();

  if (error || !req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  const recipientEmail = req.guest_email;
  const recipientName = req.guest_name || '고객';
  if (!recipientEmail) {
    return NextResponse.json({ error: 'No email for this request' }, { status: 400 });
  }

  const productName = Array.isArray(req.product) ? req.product[0]?.title : req.product?.title;
  const elapsed = getElapsedText(req.created_at);
  const baseUrl = 'https://modoouniform.com';
  const logoUrl = `${baseUrl}/icons/modoo_logo.png`;
  const resumeLink = `${baseUrl}/home/cobuy/request/create`;

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
        <p style="font-size: 17px; color: #222; line-height: 1.7; margin: 0 0 24px 0;"><strong>모두의 유니폼입니다.</strong></p>

        <p style="font-size: 14px; color: #444; line-height: 1.8; margin: 0 0 12px 0;">
          ${elapsed}에 <strong>${req.title}</strong> 공동구매 요청을 시작해주셨는데, 아직 완료되지 않은 것 같아요.
        </p>
        <p style="font-size: 14px; color: #444; line-height: 1.8; margin: 0 0 24px 0;">
          작성 중이셨던 요청을 이어서 완료하시면, 빠르게 디자인 확인 후 연락드리겠습니다.
        </p>

        ${productName ? `<p style="font-size: 13px; color: #666; margin: 0 0 20px 0;">제품: ${productName}</p>` : ''}

        <!-- CTA -->
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resumeLink}" style="display: block; width: 80%; max-width: 360px; margin: 0 auto 10px auto; padding: 14px 0; background-color: #3B55A5; color: #ffffff; border-radius: 8px; font-weight: bold; font-size: 15px; text-decoration: none; text-align: center;">요청 이어서 작성하기</a>
          <a href="http://pf.kakao.com/_xjSdYG/chat" target="_blank" rel="noopener noreferrer" style="display: block; width: 80%; max-width: 360px; margin: 0 auto 10px auto; padding: 14px 0; background-color: #FEE500; color: #191919; border-radius: 8px; font-weight: bold; font-size: 15px; text-decoration: none; text-align: center;">카카오톡 채팅 상담</a>
          <a href="tel:01081400621" style="display: block; width: 80%; max-width: 360px; margin: 0 auto 6px auto; padding: 14px 0; background-color: #ffffff; color: #333; border: 1.5px solid #ddd; border-radius: 8px; font-weight: bold; font-size: 15px; text-decoration: none; text-align: center;">전화 상담 (010-8140-0621)</a>
          <p style="margin: 0; font-size: 12px; color: #999;">모바일에서 클릭 시 바로 전화가 연결됩니다.</p>
        </div>

        <p style="font-size: 14px; color: #444; line-height: 1.8; margin: 24px 0 4px 0;">진행 중 어려운 점이 있으셨다면 편하게 문의해주세요.</p>
        <p style="font-size: 14px; color: #444; line-height: 1.8; margin: 0;">감사합니다.</p>
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

  const textPart = `안녕하세요, ${recipientName}님\n모두의 유니폼입니다.\n\n${elapsed}에 "${req.title}" 공동구매 요청을 시작해주셨는데, 아직 완료되지 않은 것 같아요.\n작성 중이셨던 요청을 이어서 완료하시면, 빠르게 디자인 확인 후 연락드리겠습니다.\n${productName ? `제품: ${productName}\n` : ''}\n요청 작성하기: ${resumeLink}\n\n진행 중 어려운 점이 있으셨다면 편하게 문의해주세요.\n카카오톡 문의: http://pf.kakao.com/_xjSdYG/chat\n전화 문의: 01081400621`;

  const sent = await sendMailjetEmail({
    to: [{ email: recipientEmail, name: recipientName }],
    subject: `[모두의 유니폼] ${recipientName}님, 요청을 이어서 완료해보세요!`,
    textPart,
    htmlPart,
    customId: `cobuy-nudge-${requestId}`,
  });

  if (!sent) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
