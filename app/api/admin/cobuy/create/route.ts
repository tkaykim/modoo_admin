import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const {
      savedDesignId,
      cobuyImageUrls,
      productId,
      pricePerItem,
      userId,
      title,
      description,
      startDate,
      endDate,
      receiveByDate,
      minQuantity,
      maxQuantity,
      pricingTiers,
      customFields,
      paymentMode,
      sizePrices,
    } = body;

    const isImageOnly = Array.isArray(cobuyImageUrls) && cobuyImageUrls.length > 0;

    // Validate required fields
    if (!isImageOnly && !savedDesignId) {
      return NextResponse.json(
        { error: 'savedDesignId or cobuyImageUrls is required' },
        { status: 400 }
      );
    }
    if (isImageOnly && !pricePerItem) {
      return NextResponse.json(
        { error: 'pricePerItem is required for image-only CoBuy' },
        { status: 400 }
      );
    }
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }
    if (!title) {
      return NextResponse.json(
        { error: 'title is required' },
        { status: 400 }
      );
    }
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Verify user exists
    const { data: userProfile, error: userError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (userError || !userProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    let screenshotId: string;

    if (isImageOnly) {
      // Image-only mode: create a stub screenshot with the first image as preview
      const screenshotData = {
        user_id: userId,
        product_id: productId || null,
        title: title,
        color_selections: {},
        canvas_state: {},
        preview_url: cobuyImageUrls[0],
        price_per_item: pricePerItem,
        image_urls: {},
        text_svg_exports: null,
        custom_fonts: [],
      };

      const { data: screenshot, error: screenshotError } = await supabase
        .from('saved_design_screenshots')
        .insert(screenshotData)
        .select()
        .single();

      if (screenshotError) {
        console.error('Error creating image screenshot:', screenshotError);
        return NextResponse.json(
          { error: 'Failed to create image snapshot' },
          { status: 500 }
        );
      }

      screenshotId = screenshot.id;
    } else {
      // Design mode: fetch saved design and create screenshot from it
      const { data: savedDesign, error: designError } = await supabase
        .from('saved_designs')
        .select('*')
        .eq('id', savedDesignId)
        .single();

      if (designError || !savedDesign) {
        return NextResponse.json(
          { error: 'Saved design not found' },
          { status: 404 }
        );
      }

      const screenshotData = {
        user_id: userId,
        product_id: savedDesign.product_id,
        title: savedDesign.title,
        color_selections: savedDesign.color_selections,
        canvas_state: savedDesign.canvas_state,
        preview_url: savedDesign.preview_url,
        price_per_item: savedDesign.price_per_item,
        image_urls: savedDesign.image_urls,
        text_svg_exports: savedDesign.text_svg_exports,
        custom_fonts: savedDesign.custom_fonts,
      };

      const { data: screenshot, error: screenshotError } = await supabase
        .from('saved_design_screenshots')
        .insert(screenshotData)
        .select()
        .single();

      if (screenshotError) {
        console.error('Error creating design screenshot:', screenshotError);
        return NextResponse.json(
          { error: 'Failed to create design snapshot' },
          { status: 500 }
        );
      }

      screenshotId = screenshot.id;
    }

    // Create cobuy session
    const sessionData: Record<string, unknown> = {
      user_id: userId,
      saved_design_screenshot_id: screenshotId,
      title,
      description: description || null,
      start_date: startDate,
      end_date: endDate,
      receive_by_date: receiveByDate || null,
      min_quantity: minQuantity || null,
      max_quantity: maxQuantity || null,
      max_participants: null,
      pricing_tiers: pricingTiers || [],
      custom_fields: customFields || [],
      delivery_settings: null,
      payment_mode: paymentMode || 'individual',
      size_prices: sizePrices || null,
      status: 'gathering',
      current_participant_count: 0,
      current_total_quantity: 0,
    };

    if (isImageOnly) {
      sessionData.cobuy_image_urls = cobuyImageUrls;
    }

    const { data: session, error: sessionError } = await supabase
      .from('cobuy_sessions')
      .insert(sessionData)
      .select(`
        *,
        profiles:user_id (
          email,
          phone_number
        ),
        saved_design_screenshots (
          preview_url
        )
      `)
      .single();

    if (sessionError) {
      console.error('Error creating cobuy session:', sessionError);
      return NextResponse.json(
        { error: 'Failed to create CoBuy session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: session });
  } catch (error) {
    console.error('Error in admin cobuy create:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
