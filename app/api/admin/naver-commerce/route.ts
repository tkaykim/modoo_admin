import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { isNaverCommerceConfigured } from '@/lib/naver-commerce/client';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const admin = createAdminClient();
    const [products, orders, shipments, settlements, qnas, runs, localProducts] = await Promise.all([
      admin.from('naver_product_mappings').select('*').order('last_synced_at', { ascending: false }).limit(100),
      admin.from('naver_product_orders').select('product_order_id,naver_order_id,product_order_status,claim_status,last_changed_type,last_changed_at,order_date,payment_date,origin_product_no,channel_product_no,local_product_id,product_name,option_name,option_manage_code,quantity,unit_price,total_payment_amount,buyer_name,receiver_name,receiver_tel1,receiver_tel2,receiver_zip_code,receiver_base_address,receiver_detail_address,shipping_memo,delivery_company_code,tracking_number,logen_registered_at,naver_dispatched_at').order('last_changed_at', { ascending: false, nullsFirst: false }).limit(200),
      admin.from('naver_shipments').select('id,naver_order_id,fix_take_no,product_order_ids,box_qty,status,logen_registered_at,tracking_number,extra_tracking_numbers,naver_dispatched_at,error_message,updated_at').order('updated_at', { ascending: false }).limit(100),
      admin.from('naver_settlement_daily').select('settlement_key,settlement_date,settlement_type,merchant_name,payment_method,sale_amount,settlement_amount,commission_amount').order('settlement_date', { ascending: false }).limit(200),
      admin.from('naver_qnas').select('question_id,product_id,product_name,question,answer,answered,writer_id_masked,question_created_at').order('question_created_at', { ascending: false }).limit(100),
      admin.from('naver_sync_runs').select('*').order('started_at', { ascending: false }).limit(20),
      admin.from('products').select('id,title,base_price,thumbnail_image_link,is_active').eq('is_active', true).order('title').limit(500),
    ]);
    for (const result of [products, orders, shipments, settlements, qnas, runs, localProducts]) if (result.error) throw result.error;
    const settlementSummary = (settlements.data || []).reduce((summary, row) => ({
      sale: summary.sale + Number(row.sale_amount || 0),
      settlement: summary.settlement + Number(row.settlement_amount || 0),
      commission: summary.commission + Number(row.commission_amount || 0),
    }), { sale: 0, settlement: 0, commission: 0 });
    return NextResponse.json({
      data: {
        configured: isNaverCommerceConfigured(),
        products: products.data || [],
        orders: orders.data || [],
        shipments: shipments.data || [],
        settlements: settlements.data || [],
        settlementSummary,
        qnas: qnas.data || [],
        syncRuns: runs.data || [],
        localProducts: localProducts.data || [],
        reviewApiAvailable: false,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '네이버 운영 데이터를 불러오지 못했습니다.' }, { status: 500 });
  }
}
