import { createClient } from './supabase-client';
import { saveDesign, updateDesign, SaveDesignData } from './designService';

export interface CartItemData {
  id?: string;
  user_id?: string;
  product_id: string;
  saved_design_id?: string;
  product_title: string;
  product_color: string;
  product_color_name: string;
  // size_id and size_name are the same value now (just the size string like "S", "M", "L")
  size_id: string;
  size_name: string;
  quantity: number;
  price_per_item: number;
  thumbnail_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AddToCartParams {
  productId: string;
  productTitle: string;
  productColor: string;
  productColorName: string;
  size: string; // Size option (e.g., "S", "M", "L", "XL")
  quantity: number;
  pricePerItem: number;
  canvasState: Record<string, string>;
  thumbnailUrl?: string;
  savedDesignId?: string; // Optional: reuse existing design instead of creating new one
  designName?: string; // Optional: custom name for the design
  previewImage?: string; // Optional: preview image for the design (base64 data URL)
}

/**
 * Add item to cart in Supabase
 * Saves the design first (or reuses existing design), then creates a cart item referencing that design
 */
export async function addToCartDB(params: AddToCartParams): Promise<CartItemData | null> {
  const supabase = createClient();

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('User not authenticated:', userError);
      throw new Error('User must be authenticated to add items to cart');
    }

    let designId: string;

    // If savedDesignId is provided, reuse it; otherwise create a new design
    if (params.savedDesignId) {
      designId = params.savedDesignId;
    } else {
      // First, save the design to get a design ID
      const designData: SaveDesignData = {
        productId: params.productId,
        title: params.designName || `${params.productTitle} - Cart Item`,
        productColor: params.productColor,
        canvasState: params.canvasState,
        previewImage: params.previewImage,
        pricePerItem: params.pricePerItem,
      };

      const savedDesign = await saveDesign(designData);

      if (!savedDesign) {
        throw new Error('Failed to save design');
      }

      designId = savedDesign.id;
    }

    // Then, create the cart item with the design reference
    // size_id and size_name are the same value now (just the size string)
    const cartItemData = {
      user_id: user.id,
      product_id: params.productId,
      saved_design_id: designId,
      product_title: params.productTitle,
      product_color: params.productColor,
      product_color_name: params.productColorName,
      size_id: params.size,
      size_name: params.size,
      quantity: params.quantity,
      price_per_item: params.pricePerItem,
      thumbnail_url: params.thumbnailUrl,
    };

    const { data: cartItem, error: insertError } = await supabase
      .from('cart_items')
      .insert(cartItemData)
      .select()
      .single();

    if (insertError) {
      console.error('Error adding to cart:', insertError);
      throw insertError;
    }

    return cartItem;
  } catch (error) {
    console.error('Failed to add to cart:', error);
    return null;
  }
}

/**
 * Get all cart items for the current user
 */
export async function getCartItems(): Promise<CartItemData[]> {
  const supabase = createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('User not authenticated:', userError);
      return [];
    }

    const { data: cartItems, error } = await supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching cart items:', error);
      throw error;
    }

    return cartItems || [];
  } catch (error) {
    console.error('Failed to fetch cart items:', error);
    return [];
  }
}

export interface CartItemWithDesign extends CartItemData {
  designName?: string;
  canvasState?: Record<string, string>;
}

/**
 * Get all cart items with their associated design data for the current user
 */
export async function getCartItemsWithDesigns(): Promise<CartItemWithDesign[]> {
  const supabase = createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('User not authenticated:', userError);
      return [];
    }

    const { data: cartItems, error } = await supabase
      .from('cart_items')
      .select(`
        *,
        saved_designs:saved_design_id (
          id,
          title,
          canvas_state
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching cart items:', error);
      throw error;
    }

    // Transform the data to include design information
    const itemsWithDesigns: CartItemWithDesign[] = (cartItems || []).map((item) => ({
      ...item,
      designName: (item as { saved_designs?: { title?: string } }).saved_designs?.title,
      canvasState: (item as { saved_designs?: { canvas_state?: Record<string, string> } }).saved_designs?.canvas_state,
    }));

    return itemsWithDesigns;
  } catch (error) {
    console.error('Failed to fetch cart items with designs:', error);
    return [];
  }
}

/**
 * Update cart item quantity
 */
export async function updateCartItemQuantity(
  cartItemId: string,
  quantity: number
): Promise<CartItemData | null> {
  const supabase = createClient();

  try {
    const { data: cartItem, error } = await supabase
      .from('cart_items')
      .update({
        quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', cartItemId)
      .select()
      .single();

    if (error) {
      console.error('Error updating cart item:', error);
      throw error;
    }

    return cartItem;
  } catch (error) {
    console.error('Failed to update cart item:', error);
    return null;
  }
}

/**
 * Update cart item design
 * This updates the saved_design that the cart item references
 */
export async function updateCartItemDesign(
  cartItemId: string,
  designData: {
    productColor: string;
    productColorName: string;
    canvasState: Record<string, string>;
    thumbnailUrl?: string;
    previewImage?: string;
  }
): Promise<boolean> {
  const supabase = createClient();

  try {
    // First, get the cart item to find the design ID
    const { data: cartItem, error: fetchError } = await supabase
      .from('cart_items')
      .select('saved_design_id, product_id')
      .eq('id', cartItemId)
      .single();

    if (fetchError || !cartItem || !cartItem.saved_design_id) {
      console.error('Error fetching cart item:', fetchError);
      throw new Error('Cart item not found');
    }

    // Update the design
    const updatedDesign = await updateDesign(cartItem.saved_design_id, {
      productId: cartItem.product_id,
      productColor: designData.productColor,
      canvasState: designData.canvasState,
      previewImage: designData.previewImage,
    });

    if (!updatedDesign) {
      throw new Error('Failed to update design');
    }

    // Update the cart item metadata
    const { error: updateError } = await supabase
      .from('cart_items')
      .update({
        product_color: designData.productColor,
        product_color_name: designData.productColorName,
        thumbnail_url: designData.thumbnailUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cartItemId);

    if (updateError) {
      console.error('Error updating cart item metadata:', updateError);
      throw updateError;
    }

    return true;
  } catch (error) {
    console.error('Failed to update cart item design:', error);
    return false;
  }
}

/**
 * Remove cart item
 */
export async function removeCartItem(cartItemId: string): Promise<boolean> {
  const supabase = createClient();

  try {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', cartItemId);

    if (error) {
      console.error('Error removing cart item:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Failed to remove cart item:', error);
    return false;
  }
}

/**
 * Clear all cart items for the current user
 */
export async function clearCart(): Promise<boolean> {
  const supabase = createClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('User not authenticated:', userError);
      return false;
    }

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('Error clearing cart:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Failed to clear cart:', error);
    return false;
  }
}

/**
 * Get cart item by ID with full design data
 */
export async function getCartItemWithDesign(cartItemId: string): Promise<{
  cartItem: CartItemData;
  design: any;
} | null> {
  const supabase = createClient();

  try {
    // Get the cart item
    const { data: cartItem, error: cartError } = await supabase
      .from('cart_items')
      .select('*')
      .eq('id', cartItemId)
      .single();

    if (cartError || !cartItem) {
      console.error('Error fetching cart item:', cartError);
      throw new Error('Cart item not found');
    }

    // Get the design
    const { data: design, error: designError } = await supabase
      .from('saved_designs')
      .select('*')
      .eq('id', cartItem.saved_design_id)
      .single();

    if (designError || !design) {
      console.error('Error fetching design:', designError);
      throw new Error('Design not found');
    }

    return {
      cartItem,
      design,
    };
  } catch (error) {
    console.error('Failed to get cart item with design:', error);
    return null;
  }
}