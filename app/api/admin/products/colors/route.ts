import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();

  // Get productId from query params
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');

  if (!productId) {
    return NextResponse.json(
      { error: 'productId is required' },
      { status: 400 }
    );
  }

  try {
    // Fetch product colors with manufacturer color details
    const { data, error } = await supabase
      .from('product_colors')
      .select(`
        *,
        manufacturer_colors (
          id,
          name,
          hex,
          color_code,
          label
        )
      `)
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error fetching product colors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product colors' },
      { status: 500 }
    );
  }
}
