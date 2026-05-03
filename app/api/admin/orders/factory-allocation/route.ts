import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendFactoryAssignmentEmail } from '@/lib/gmail';
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
      .select('id, assigned_manufacturer_id')
      .in('id', itemIds);

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
      .select('customer_note, share_token')
      .eq('id', orderId)
      .single();

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
        .select('id, product_id, product_title, design_title, quantity, thumbnail_url')
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
