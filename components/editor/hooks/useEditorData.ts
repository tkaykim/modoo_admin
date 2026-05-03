'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';
import {
  Product,
  ProductColor,
  ProductSide,
  OrderItem,
  DesignTemplate,
  SavedDesign,
  CanvasState,
  CustomFont,
} from '@/types/types';
import { EditorMode } from './useEditorMode';
import { parseCanvasState, coerceCustomFonts } from '@/lib/downloadUtils';

interface UseEditorDataParams {
  productId: string;
  mode: EditorMode;
  orderId?: string;
  orderItemId?: string;
  templateId?: string;
  designId?: string;
}

interface EditorData {
  product: Product | null;
  productColors: ProductColor[];
  orderItem: OrderItem | null;
  savedDesign: SavedDesign | null;
  templates: DesignTemplate[];
  selectedTemplate: DesignTemplate | null;
  canvasStates: Record<string, CanvasState | string | null>;
  productColor: string;
  customFonts: CustomFont[];
  loading: boolean;
  error: string | null;
  refetchTemplates: () => Promise<void>;
  setSelectedTemplate: (template: DesignTemplate | null) => void;
  updateOrderItemCanvasState: (canvasState: Record<string, unknown>) => void;
}

export function useEditorData({
  productId,
  mode,
  orderId,
  orderItemId,
  templateId,
  designId,
}: UseEditorDataParams): EditorData {
  const [product, setProduct] = useState<Product | null>(null);
  const [productColors, setProductColors] = useState<ProductColor[]>([]);
  const [orderItem, setOrderItem] = useState<OrderItem | null>(null);
  const [savedDesign, setSavedDesign] = useState<SavedDesign | null>(null);
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DesignTemplate | null>(null);
  const [canvasStates, setCanvasStates] = useState<Record<string, CanvasState | string | null>>({});
  const [productColor, setProductColor] = useState('#FFFFFF');
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch product
  const fetchProduct = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('products')
      .select('*, manufacturers(id, name)')
      .eq('id', productId)
      .single();

    if (error) throw new Error(`제품을 불러올 수 없습니다: ${error.message}`);
    return data as Product;
  }, [productId]);

  // Fetch product colors
  const fetchProductColors = useCallback(async (prodId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('product_colors')
      .select(`
        *,
        manufacturer_colors (
          id, name, hex, color_code, label
        )
      `)
      .eq('product_id', prodId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching product colors:', error);
      return [];
    }
    return (data || []) as ProductColor[];
  }, []);

  // Fetch order item
  const fetchOrderItem = useCallback(async (itemId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('order_items')
      .select('*, products(product_code)')
      .eq('id', itemId)
      .single();

    if (error) throw new Error(`주문 항목을 불러올 수 없습니다: ${error.message}`);
    return data as OrderItem;
  }, []);

  // Fetch templates
  const fetchTemplates = useCallback(async (prodId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('design_templates')
      .select('*')
      .eq('product_id', prodId)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
    return (data || []) as DesignTemplate[];
  }, []);

  // Fetch saved design
  const fetchSavedDesign = useCallback(async (id: string) => {
    const response = await fetch(`/api/admin/designs/${id}`);
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload?.error || '디자인을 불러올 수 없습니다.');
    }
    const payload = await response.json();
    return payload?.data as SavedDesign;
  }, []);

  const refetchTemplates = useCallback(async () => {
    const t = await fetchTemplates(productId);
    setTemplates(t);
  }, [fetchTemplates, productId]);

  // Initial data load
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Always fetch product
        const prod = await fetchProduct();
        if (cancelled) return;
        setProduct(prod);

        // Fetch product colors
        const colors = await fetchProductColors(prod.id);
        if (cancelled) return;
        setProductColors(colors);

        // Mode-specific data loading
        if (mode === 'order' && orderItemId) {
          const item = await fetchOrderItem(orderItemId);
          if (cancelled) return;
          setOrderItem(item);
          setCanvasStates(item.canvas_state || {});
          setCustomFonts(coerceCustomFonts(item.custom_fonts));

          // Extract product color: order data (color_selections / variants) takes
          // priority over canvas_state because a previous admin save may have
          // persisted a stale default (#FFFFFF) into canvas_state.productColor.
          let extractedColor = '#FFFFFF';
          const colorSelections = item.color_selections as { productColor?: string } | undefined;
          if (typeof colorSelections?.productColor === 'string' && colorSelections.productColor.startsWith('#')) {
            extractedColor = colorSelections.productColor;
          } else {
            const variants = item.item_options?.variants;
            if (Array.isArray(variants) && variants.length > 0 && variants[0]?.color_hex) {
              extractedColor = variants[0].color_hex;
            } else if (item.item_options?.color_hex) {
              extractedColor = item.item_options.color_hex;
            } else {
              // Last resort: check canvas_state
              for (const stateRaw of Object.values(item.canvas_state || {})) {
                const state = parseCanvasState(stateRaw);
                if (typeof state?.productColor === 'string' && state.productColor.startsWith('#')) {
                  extractedColor = state.productColor;
                  break;
                }
              }
            }
          }
          setProductColor(extractedColor);
        } else if (mode === 'template') {
          const t = await fetchTemplates(prod.id);
          if (cancelled) return;
          setTemplates(t);

          if (templateId) {
            const selected = t.find((tmpl) => tmpl.id === templateId) || null;
            setSelectedTemplate(selected);
            if (selected) {
              setCanvasStates(selected.canvas_state as Record<string, CanvasState | string | null>);
            }
          }
        } else if (mode === 'design' && designId) {
          // Load saved design for viewing/editing
          const design = await fetchSavedDesign(designId);
          if (cancelled) return;
          setSavedDesign(design);
          setCanvasStates(design.canvas_state || {});
          setCustomFonts(coerceCustomFonts(design.custom_fonts));

          // Extract product color from canvas state or color_selections
          const colorSelections = design.color_selections as { productColor?: string } | undefined;
          if (typeof colorSelections?.productColor === 'string' && colorSelections.productColor.startsWith('#')) {
            setProductColor(colorSelections.productColor);
          } else {
            const states = Object.values(design.canvas_state || {});
            for (const stateRaw of states) {
              const state = parseCanvasState(stateRaw);
              if (typeof state?.productColor === 'string' && state.productColor.startsWith('#')) {
                setProductColor(state.productColor);
                break;
              }
            }
          }
        }
        // design mode without designId: no canvas state to load (fresh canvas)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '데이터를 불러오는 중 오류가 발생했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [productId, mode, orderItemId, templateId, designId, fetchProduct, fetchProductColors, fetchOrderItem, fetchTemplates, fetchSavedDesign]);

  const updateOrderItemCanvasState = useCallback((canvasState: Record<string, unknown>) => {
    setOrderItem((prev) => prev ? { ...prev, canvas_state: canvasState as Record<string, CanvasState> } : prev);
  }, []);

  return {
    product,
    productColors,
    orderItem,
    savedDesign,
    templates,
    selectedTemplate,
    canvasStates,
    productColor,
    customFonts,
    loading,
    error,
    refetchTemplates,
    setSelectedTemplate,
    updateOrderItemCanvasState,
  };
}
