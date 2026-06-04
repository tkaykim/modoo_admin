import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendFactoryAssignmentEmail } from '@/lib/gmail';
import { ensureWorkFolderForOrderItem } from '@/lib/google-drive';
import { randomBytes } from 'crypto';
import { isAdminLike } from '@/lib/auth-helpers';

interface ItemAllocation {
  orderItemId: string;
  assigned_manufacturer_id: string;
  factory_amount?: number | null;
  deadline?: string | null;
  factory_payment_date?: string | null;
  factory_payment_status?: string | null;
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!isAdminLike(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, items } = body as { orderId: string; items: ItemAllocation[] };

    if (!orderId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Order ID and items array are required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Group items by manufacturer for email notifications
    const manufacturerItemsMap = new Map<string, ItemAllocation[]>();
    for (const item of items) {
      if (!item.orderItemId || !item.assigned_manufacturer_id) continue;
      const existing = manufacturerItemsMap.get(item.assigned_manufacturer_id) || [];
      existing.push(item);
      manufacturerItemsMap.set(item.assigned_manufacturer_id, existing);
    }

    // Fetch current assignments to detect new assignments
    const itemIds = items.map((i) => i.orderItemId);
    const { data: existingItems } = await adminClient
      .from('order_items')
      .select('id, assigned_manufacturer_id, production_ready')
      .in('id', itemIds);

    // 간이주문 가드: 제작 사양(목업·면별 아트워크) 미완성(production_ready=false) 품목은 공장배정 차단.
    // 기존/일반 주문 품목은 production_ready=true(기본)이라 이 분기에 진입하지 않음 → 동작 무변경.
    const notReady = (existingItems || []).filter((ei) => ei.production_ready === false);
    if (notReady.length > 0) {
      return NextResponse.json(
        {
          error: '아직 제작 사양(목업·면별 아트워크)이 입력되지 않은 간이주문 품목이 있습니다. 에디터에서 디자인 작업을 완료한 뒤 배정해 주세요.',
        },
        { status: 400 }
      );
    }

    const previousAssignments = new Map<string, string | null>();
    for (const ei of existingItems || []) {
      previousAssignments.set(ei.id, ei.assigned_manufacturer_id);
    }

    // Update each item
    for (const item of items) {
      const updateData: Record<string, unknown> = {
        assigned_manufacturer_id: item.assigned_manufacturer_id,
        factory_status: 'assigned',
        updated_at: new Date().toISOString(),
      };

      if (item.factory_amount !== undefined) {
        updateData.factory_amount = item.factory_amount;
      }
      if (item.deadline !== undefined) {
        updateData.deadline = item.deadline;
      }
      if (item.factory_payment_date !== undefined) {
        updateData.factory_payment_date = item.factory_payment_date;
      }
      if (item.factory_payment_status !== undefined) {
        updateData.factory_payment_status = item.factory_payment_status || 'pending';
      }

      await adminClient
        .from('order_items')
        .update(updateData)
        .eq('id', item.orderItemId);
    }

    // Also update order status to in_production if not already
    await adminClient
      .from('orders')
      .update({ order_status: 'in_production', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .in('order_status', ['payment_completed']);

    // Send email notifications per manufacturer (only for new assignments)
    const { data: orderData } = await adminClient
      .from('orders')
      .select('customer_note, share_token, customer_name, guest_name')
      .eq('id', orderId)
      .single();

    // 거래처별 Drive 상위 폴더 ID + 신규로 배정된 order_item마다 작업사진 폴더 자동 생성
    const newlyAssignedItemIds = new Set<string>();
    for (const item of items) {
      if (previousAssignments.get(item.orderItemId) !== item.assigned_manufacturer_id) {
        newlyAssignedItemIds.add(item.orderItemId);
      }
    }
    const driveFolderUrlByItemId = new Map<string, string>();

    if (newlyAssignedItemIds.size > 0) {
      const manufacturerIds = Array.from(manufacturerItemsMap.keys());
      const { data: manufacturerDrive } = await adminClient
        .from('manufacturers')
        .select('id, drive_folder_id')
        .in('id', manufacturerIds);
      const driveFolderByMfgId = new Map<string, string>();
      for (const m of manufacturerDrive || []) {
        if (m.drive_folder_id) driveFolderByMfgId.set(m.id, m.drive_folder_id);
      }

      const { data: itemDetailsForDrive } = await adminClient
        .from('order_items')
        .select('id, design_title, created_at, work_drive_folder_url')
        .in('id', Array.from(newlyAssignedItemIds));
      const itemDetailById = new Map<string, { design_title: string | null; created_at: string; work_drive_folder_url: string | null }>();
      for (const it of itemDetailsForDrive || []) {
        itemDetailById.set(it.id, {
          design_title: it.design_title,
          created_at: it.created_at,
          work_drive_folder_url: it.work_drive_folder_url,
        });
      }

      const customerLabel = orderData?.customer_name || orderData?.guest_name || null;

      for (const item of items) {
        if (!newlyAssignedItemIds.has(item.orderItemId)) continue;
        const parent = driveFolderByMfgId.get(item.assigned_manufacturer_id);
        if (!parent) continue; // 거래처에 drive_folder_id 미설정 — 조용히 skip

        const detail = itemDetailById.get(item.orderItemId);
        if (!detail) continue;

        // 이미 폴더가 있으면 url만 재사용
        if (detail.work_drive_folder_url) {
          driveFolderUrlByItemId.set(item.orderItemId, detail.work_drive_folder_url);
          continue;
        }

        const result = await ensureWorkFolderForOrderItem({
          parentDriveFolderId: parent,
          designTitle: detail.design_title,
          customerName: customerLabel,
          orderItemId: item.orderItemId,
          createdAtIso: detail.created_at,
        });
        if (result) {
          driveFolderUrlByItemId.set(item.orderItemId, result.webViewLink);
          await adminClient
            .from('order_items')
            .update({
              work_drive_folder_id: result.folderId,
              work_drive_folder_url: result.webViewLink,
            })
            .eq('id', item.orderItemId);
        }
      }
    }

    for (const [manufacturerId, allocItems] of manufacturerItemsMap.entries()) {
      const hasNewAssignment = allocItems.some(
        (ai) => previousAssignments.get(ai.orderItemId) !== manufacturerId
      );
      if (!hasNewAssignment) continue;

      const { data: manufacturer } = await adminClient
        .from('manufacturers')
        .select('id, name, email')
        .eq('id', manufacturerId)
        .single();

      if (!manufacturer?.email) continue;

      const assignedItemIds = allocItems.map((ai) => ai.orderItemId);
      const { data: itemDetails } = await adminClient
        .from('order_items')
        .select('id, product_id, product_title, design_title, quantity, thumbnail_url, work_drive_folder_url')
        .in('id', assignedItemIds)
        .order('created_at', { ascending: true });

      let finalShareToken = orderData?.share_token ?? null;
      if (!finalShareToken) {
        finalShareToken = randomBytes(16).toString('hex');
        await adminClient.from('orders').update({ share_token: finalShareToken }).eq('id', orderId);
      }

      const emailItems = await Promise.all(
        (itemDetails || []).map(async (item) => {
          let publicUrl = item.thumbnail_url;
          if (publicUrl && publicUrl.startsWith('data:')) {
            try {
              const res = await fetch(publicUrl);
              const blob = await res.blob();
              const ext = blob.type.split('/')[1] || 'png';
              const fileName = `email-thumbnails/${orderId}/${item.id}.${ext}`;
              const { error: upErr } = await adminClient.storage
                .from('user-designs')
                .upload(fileName, blob, { contentType: blob.type, upsert: true });
              if (!upErr) {
                const { data: urlData } = adminClient.storage.from('user-designs').getPublicUrl(fileName);
                publicUrl = urlData.publicUrl;
              }
            } catch { /* keep original */ }
          }
          return {
            id: item.id,
            productId: item.product_id,
            productTitle: item.product_title,
            designTitle: item.design_title,
            quantity: item.quantity,
            thumbnailUrl: publicUrl,
            workDriveFolderUrl:
              driveFolderUrlByItemId.get(item.id) ?? item.work_drive_folder_url ?? null,
          };
        })
      );

      const firstAlloc = allocItems[0];
      const reqOrigin = new URL(request.url).origin;
      const emailAppUrl = process.env.NEXT_PUBLIC_APP_URL || reqOrigin;

      sendFactoryAssignmentEmail({
        factoryName: manufacturer.name,
        factoryEmail: manufacturer.email,
        orderId,
        deadline: firstAlloc.deadline ?? null,
        factoryAmount: firstAlloc.factory_amount ?? null,
        customerNote: orderData?.customer_note ?? null,
        shareToken: finalShareToken,
        factoryId: manufacturerId,
        appUrl: emailAppUrl,
        orderItems: emailItems,
      }).catch((err) => console.error('Factory assignment email failed:', err));
    }

    // Fetch updated items to return
    const { data: updatedItems } = await adminClient
      .from('order_items')
      .select('id, assigned_manufacturer_id, factory_status, factory_amount, deadline, factory_payment_date, factory_payment_status')
      .eq('order_id', orderId);

    return NextResponse.json({ data: updatedItems });
  } catch (error) {
    console.error('Factory allocation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
