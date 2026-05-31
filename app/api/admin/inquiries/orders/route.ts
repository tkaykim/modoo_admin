import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-api';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = 'https://modoouniform.com';

interface OrderCard {
  orderId: string;
  orderCategory: string | null;
  paymentStatus: string;
  orderStatus: string;
  totalAmount: number;
  payUrl: string | null;
  items: { productTitle: string | null; thumbnailUrl: string | null; unitPrice: number; quantity: number; keywords: string[] }[];
}

// GET /api/admin/inquiries/orders?inquiry_ids=a,b,c → { data: { [inquiryId]: OrderCard[] } }
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const many = url.searchParams.get('inquiry_ids');
  const ids = many ? many.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ data: {} });

  const db = createAdminClient();
  const { data: orders } = await db
    .from('orders')
    .select('id, inquiry_id, order_category, total_amount, payment_status, order_status, payment_link_token, created_at')
    .in('inquiry_id', ids)
    .order('created_at', { ascending: true });

  const result: Record<string, OrderCard[]> = {};
  for (const id of ids) result[id] = [];
  if (!orders || orders.length === 0) return NextResponse.json({ data: result });

  const orderIds = orders.map((o) => o.id);
  const { data: items } = await db
    .from('order_items')
    .select('order_id, product_id, product_title, thumbnail_url, price_per_item, quantity')
    .in('order_id', orderIds);

  const productIds = [...new Set((items || []).map((i) => i.product_id).filter((x): x is string => !!x))];
  const { data: products } = productIds.length
    ? await db.from('products').select('id, keywords').in('id', productIds)
    : { data: [] as { id: string; keywords: string[] | null }[] };
  const kwByProduct = new Map<string, string[]>((products || []).map((p) => [p.id, ((p.keywords as string[] | null) || []).filter((k: string) => !!k)]));

  const itemsByOrder = new Map<string, typeof items>();
  for (const it of items || []) {
    const arr = itemsByOrder.get(it.order_id) || [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }

  for (const o of orders) {
    if (!o.inquiry_id || !result[o.inquiry_id]) continue;
    result[o.inquiry_id].push({
      orderId: o.id,
      orderCategory: o.order_category,
      paymentStatus: o.payment_status,
      orderStatus: o.order_status,
      totalAmount: Number(o.total_amount) || 0,
      payUrl: o.payment_link_token ? `${SITE_URL}/order/custom/${o.payment_link_token}` : null,
      items: (itemsByOrder.get(o.id) || []).map((it) => ({
        productTitle: it.product_title,
        thumbnailUrl: it.thumbnail_url,
        unitPrice: Number(it.price_per_item) || 0,
        quantity: it.quantity,
        keywords: it.product_id ? (kwByProduct.get(it.product_id) || []) : [],
      })),
    });
  }

  return NextResponse.json({ data: result });
}
