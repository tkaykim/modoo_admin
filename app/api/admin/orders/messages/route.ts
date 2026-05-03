import { NextRequest, NextResponse } from 'next/server';
import { isAdminLike, isBackofficeOperatorRole } from '@/lib/auth-helpers';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendGmailEmail } from '@/lib/gmail';
import { createHmac } from 'crypto';

async function requireAdminOrFactory() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, manufacturer_id, name')
    .eq('id', user.id)
    .single();

  if (!profile || (!isBackofficeOperatorRole(profile.role))) {
    return { error: NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 }) };
  }

  return { user, profile };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdminOrFactory();
    if ('error' in authResult && authResult.error) return authResult.error;

    const { searchParams } = new URL(request.url);
    const orderItemId = searchParams.get('orderItemId');

    if (!orderItemId) {
      return NextResponse.json({ error: 'orderItemId가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from('editor_chat_messages')
      .select('*, sender:profiles!editor_chat_messages_sender_id_fkey(name, role, email)')
      .eq('order_item_id', orderItemId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '메시지 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminOrFactory();
    if ('error' in authResult && authResult.error) return authResult.error;

    const { user, profile } = authResult as { user: { id: string }; profile: { role: string; manufacturer_id: string | null; name: string | null } };

    const payload = await request.json().catch(() => null);
    const orderItemId = payload?.orderItemId;
    const content = payload?.content;
    const attachmentUrls = payload?.attachmentUrls || [];

    if (!orderItemId || typeof orderItemId !== 'string') {
      return NextResponse.json({ error: 'orderItemId가 필요합니다.' }, { status: 400 });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: '메시지 내용이 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    if (profile.role === 'factory') {
      if (!profile.manufacturer_id) {
        return NextResponse.json({ error: '공장 정보가 필요합니다.' }, { status: 403 });
      }
      const { data: orderItem } = await adminClient
        .from('order_items')
        .select('id, assigned_manufacturer_id')
        .eq('id', orderItemId)
        .single();

      if (!orderItem || orderItem.assigned_manufacturer_id !== profile.manufacturer_id) {
        return NextResponse.json({ error: '해당 주문에 대한 권한이 없습니다.' }, { status: 403 });
      }
    }

    const { data, error } = await adminClient
      .from('editor_chat_messages')
      .insert({
        order_item_id: orderItemId,
        sender_id: user.id,
        content: content.trim(),
        attachment_urls: attachmentUrls,
      })
      .select('*, sender:profiles!editor_chat_messages_sender_id_fkey(name, role, email)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    sendCustomerNotification(adminClient, orderItemId, content.trim(), profile).catch(console.error);

    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '메시지 전송에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function generateReplyToken(orderItemId: string, orderId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret';
  const expiry = Date.now() + 72 * 60 * 60 * 1000;
  const payload = `${orderItemId}|${orderId}|${expiry}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(JSON.stringify({ oi: orderItemId, o: orderId, exp: expiry, sig })).toString('base64url');
}

function buildReplyUrl(orderItemId: string, orderId: string): string {
  const token = generateReplyToken(orderItemId, orderId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://modoouniform.com';
  return `${baseUrl}/chat/reply?token=${token}`;
}

function buildQuickReplyUrl(orderItemId: string, orderId: string, message: string): string {
  const token = generateReplyToken(orderItemId, orderId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://modoouniform.com';
  return `${baseUrl}/api/chat/quick-reply?token=${token}&msg=${encodeURIComponent(message)}`;
}

async function sendCustomerNotification(
  adminClient: ReturnType<typeof createAdminClient>,
  orderItemId: string,
  messageContent: string,
  senderProfile: { role: string; name: string | null },
) {
  try {
    const { data: orderItem } = await adminClient
      .from('order_items')
      .select('product_title, design_title, order_id')
      .eq('id', orderItemId)
      .single();

    if (!orderItem) return;

    const { data: order } = await adminClient
      .from('orders')
      .select('id, customer_email, customer_name, user_id')
      .eq('id', orderItem.order_id)
      .single();

    if (!order) return;

    let customerEmail = order.customer_email;
    if (!customerEmail && order.user_id) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('id', order.user_id)
        .single();
      customerEmail = profile?.email;
    }

    if (!customerEmail) return;

    const senderLabel = senderProfile.role === 'factory' ? '공장' : '관리자';
    const senderName = senderProfile.name || senderLabel;
    const designInfo = orderItem.design_title ? ` (디자인: ${orderItem.design_title})` : '';

    const replyUrl = buildReplyUrl(orderItemId, order.id);
    const confirmUrl = buildQuickReplyUrl(orderItemId, order.id, '확인했습니다. 감사합니다!');
    const revisionUrl = buildQuickReplyUrl(orderItemId, order.id, '수정이 필요합니다. 확인 부탁드립니다.');

    await sendGmailEmail({
      to: [{ email: customerEmail, name: order.customer_name || undefined }],
      subject: `[모두의 유니폼] 디자인 관련 새 메시지가 도착했습니다`,
      text: `${senderName}(${senderLabel})님이 주문 ${order.id}의 ${orderItem.product_title}${designInfo}에 대해 메시지를 남겼습니다.\n\n"${messageContent}"\n\n답변하기: ${replyUrl}`,
      html: `
        <div style="font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; max-width: 600px; margin: 0 auto;">
          <!-- Header -->
          <div style="background: #3B55A5; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 18px; font-weight: 600;">디자인 관련 메시지</h1>
          </div>

          <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
            <!-- Sender Info -->
            <div style="background: #f8f9fa; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
              <p style="margin: 0 0 4px; color: #666; font-size: 12px;">
                <strong style="color: #333;">${senderName}</strong> · ${senderLabel}
              </p>
              <p style="margin: 0; color: #888; font-size: 12px;">
                ${orderItem.product_title}${designInfo}
              </p>
            </div>

            <!-- Message -->
            <div style="background: #f0f4ff; border-left: 3px solid #3B55A5; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
              <p style="margin: 0; color: #1a1a1a; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${messageContent}</p>
            </div>

            <!-- Quick Reactions -->
            <p style="margin: 0 0 12px; color: #666; font-size: 13px; font-weight: 600;">빠른 답변:</p>
            <div style="margin-bottom: 20px;">
              <a href="${confirmUrl}" style="display: inline-block; background: #10b981; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-right: 8px; margin-bottom: 8px;">✓ 확인했습니다</a>
              <a href="${revisionUrl}" style="display: inline-block; background: #f59e0b; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 8px;">✎ 수정 필요</a>
            </div>

            <!-- Reply Button -->
            <a href="${replyUrl}" style="display: block; background: #3B55A5; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; text-align: center;">💬 직접 답변하기</a>
          </div>

          <!-- Footer -->
          <div style="padding: 16px 24px; text-align: center; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; background: #fafafa;">
            <p style="margin: 0; font-size: 11px; color: #999;">모두의 유니폼 · 이 링크는 72시간 동안 유효합니다</p>
          </div>
        </div>
      `,
    });
  } catch (error) {
    console.error('Failed to send customer notification:', error);
  }
}
