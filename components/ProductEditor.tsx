'use client';

import { useEffect, useState, useRef } from 'react';
import { Product, ProductColor, ProductLayer, ProductSide, SizeOption, Manufacturer, ManufacturerColor, LogoPlacement, PartnerMallPreset, PrintMethodRecord, ProductPrintMethod } from '@/types/types';
import { createClient } from '@/lib/supabase-client';
import type { CategoryConfig } from '@/lib/categories';
import { useRouter } from 'next/navigation';
import { Save, X, Plus, Trash2, Upload, ChevronLeft, ChevronRight, ChevronDown, Image as ImageIcon, Check, Loader2, Layers, GripVertical } from 'lucide-react';
import LogoPlacementPreview from './LogoPlacementPreview';
import KeywordsInput from './KeywordsInput';

interface ProductEditorProps {
  product?: Product | null;
  onSave: (product: Product) => void;
  onCancel: () => void;
}

const buildPrintArea = (printArea?: ProductSide['printArea']) => ({
  x: Math.max(0, Math.round(printArea?.x ?? 0)),
  y: Math.max(0, Math.round(printArea?.y ?? 0)),
  width: Math.max(0, Math.round(printArea?.width ?? 200)),
  height: Math.max(0, Math.round(printArea?.height ?? 200)),
});

const buildRealLifeDimensions = (dimensions?: ProductSide['realLifeDimensions']) => ({
  productWidthMm: Math.max(0, Math.round(dimensions?.productWidthMm ?? 0)),
});

const normalizeLayer = (layer: Partial<ProductLayer>, index: number): ProductLayer => ({
  id: layer.id || `layer-${Date.now()}-${index}`,
  name: layer.name || `Layer ${index + 1}`,
  imageUrl: typeof layer.imageUrl === 'string' ? layer.imageUrl : '',
  colorOptions: Array.isArray(layer.colorOptions)
    ? layer.colorOptions.map((option) => ({
        hex: typeof option?.hex === 'string' ? option.hex : '#FFFFFF',
        colorCode: typeof option?.colorCode === 'string' ? option.colorCode : '',
      }))
    : [],
  zIndex: typeof layer.zIndex === 'number' ? layer.zIndex : index,
});

const normalizeSide = (side: Partial<ProductSide>, index: number): ProductSide => ({
  id: side.id || `side-${Date.now()}-${index}`,
  name: side.name || `면 ${index + 1}`,
  imageUrl: typeof side.imageUrl === 'string' ? side.imageUrl : '',
  printArea: buildPrintArea(side.printArea),
  layers: Array.isArray(side.layers) ? side.layers.map((layer, layerIndex) => normalizeLayer(layer, layerIndex)) : [],
  realLifeDimensions: buildRealLifeDimensions(side.realLifeDimensions),
});

const normalizeSides = (rawSides: ProductSide[] | null | undefined) =>
  (rawSides || []).map((side, index) => normalizeSide(side, index));

const isLayeredSide = (side: ProductSide): side is ProductSide & { layers: ProductLayer[] } =>
  Array.isArray(side.layers) && side.layers.length > 0;

const getSidePreviewUrl = (side: ProductSide) => {
  if (isLayeredSide(side)) {
    const sortedLayers = [...side.layers].sort((a, b) => a.zIndex - b.zIndex);
    return sortedLayers.find((layer) => layer.imageUrl)?.imageUrl || '';
  }
  return side.imageUrl;
};

export default function ProductEditor({ product, onSave, onCancel }: ProductEditorProps) {
  const router = useRouter();
  const isNewProduct = !product;

  // Basic product fields
  const [title, setTitle] = useState(product?.title || '');
  const [basePrice, setBasePrice] = useState(product?.base_price || 0);
  const [category, setCategory] = useState(product?.category || '');
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [thumbnailImages, setThumbnailImages] = useState<string[]>(product?.thumbnail_image_link ?? []);
  const [descriptionImages, setDescriptionImages] = useState<string[]>(product?.description_image ?? []);
  const [sizingChartImage, setSizingChartImage] = useState(product?.sizing_chart_image ?? '');
  const [productCode, setProductCode] = useState(product?.product_code ?? '');
  const [discountRates, setDiscountRates] = useState<Array<{ min_quantity: number; discount_rate: number }>>(
    Array.isArray(product?.discount_rates) ? product.discount_rates : []
  );
  const [keywords, setKeywords] = useState<string[]>(
    Array.isArray(product?.keywords) ? product.keywords : []
  );

  // Product sides
  const [sides, setSides] = useState<ProductSide[]>(() => normalizeSides(product?.configuration || []));
  const [currentSideIndex, setCurrentSideIndex] = useState(0);

  // Size options - now objects with label and size_code
  const [sizeOptions, setSizeOptions] = useState<SizeOption[]>(
    (product?.size_options || []).map((opt) =>
      typeof opt === 'string'
        ? { label: opt, size_code: '' }
        : opt
    )
  );

  // Product colors (single image products)
  const [productColors, setProductColors] = useState<ProductColor[]>([]);
  const [colorsLoading, setColorsLoading] = useState(false);
  const [deletingColorId, setDeletingColorId] = useState<string | null>(null);

  // Linked manufacturer (saved to product)
  const [linkedManufacturerId, setLinkedManufacturerId] = useState<string>(product?.manufacturer_id || '');

  // Manufacturer and manufacturer colors
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [manufacturersLoading, setManufacturersLoading] = useState(false);
  const [manufacturerColors, setManufacturerColors] = useState<ManufacturerColor[]>([]);
  const [manufacturerColorsLoading, setManufacturerColorsLoading] = useState(false);
  const [togglingColorId, setTogglingColorId] = useState<string | null>(null);
  const [colorSearch, setColorSearch] = useState('');

  // Layer-specific manufacturer selection (for layered products - per side/layer index)
  // Key format: `${sideIndex}-${layerIndex}`, value: manufacturerId
  const [layerManufacturerIds, setLayerManufacturerIds] = useState<Record<string, string>>({});
  const [layerManufacturerColors, setLayerManufacturerColors] = useState<Record<string, ManufacturerColor[]>>({});
  const [layerColorsLoading, setLayerColorsLoading] = useState<Record<string, boolean>>({});

  // Layer-ID-based manufacturer selection (for "사이즈 & 색상" tab - shared across sides)
  // Key: layer.id, value: manufacturerId
  const [layerIdManufacturerIds, setLayerIdManufacturerIds] = useState<Record<string, string>>({});
  const [layerIdManufacturerColors, setLayerIdManufacturerColors] = useState<Record<string, ManufacturerColor[]>>({});
  const [layerIdColorsLoading, setLayerIdColorsLoading] = useState<Record<string, boolean>>({});
  const [layerIdColorSearch, setLayerIdColorSearch] = useState<Record<string, string>>({});

  // Custom color picker state (layer colors)
  const [layerCustomColorHex, setLayerCustomColorHex] = useState<Record<string, string>>({});
  const [layerCustomColorName, setLayerCustomColorName] = useState<Record<string, string>>({});

  // Custom color picker state (single-image product colors)
  const [customColorHex, setCustomColorHex] = useState('#000000');
  const [customColorName, setCustomColorName] = useState('');
  const [addingCustomColor, setAddingCustomColor] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  type UploadTarget =
    | { kind: 'side'; sideIndex: number; layerIndex?: number }
    | { kind: 'product'; field: 'thumbnail_image_link' | 'description_image' | 'sizing_chart_image' };
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);

  // Partner mall presets
  const [presets, setPresets] = useState<PartnerMallPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PartnerMallPreset | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [showNewPresetInput, setShowNewPresetInput] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);

  // Print methods
  const [allPrintMethods, setAllPrintMethods] = useState<PrintMethodRecord[]>([]);
  const [productPrintMethods, setProductPrintMethods] = useState<ProductPrintMethod[]>([]);
  const [togglingPrintMethodId, setTogglingPrintMethodId] = useState<string | null>(null);

  // Categories
  const [categories, setCategories] = useState<CategoryConfig[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  // Tab state
  type EditorTab = 'basic' | 'sides' | 'size-color' | 'partner-mall' | 'print-area' | 'template';
  const [activeTab, setActiveTab] = useState<EditorTab>('basic');
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['settings']));
  const toggleSection = (key: string) => setOpenSections(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const tabs: { id: EditorTab; label: string }[] = [
    { id: 'basic', label: '기본 정보' },
    { id: 'sides', label: '면 설정' },
    { id: 'size-color', label: '사이즈 & 색상' },
    ...(!isNewProduct ? [
      // { id: 'print-area' as const, label: '인쇄 영역' },
      { id: 'template' as const, label: '템플릿' },
    ] : []),
    { id: 'partner-mall', label: '파트너몰 설정' },
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSide = sides[currentSideIndex];
  const isCurrentSideLayered = currentSide ? isLayeredSide(currentSide) : false;
  const currentSideLayers = currentSide?.layers ?? [];
  const hasLayeredItem = sides.some((side) => isLayeredSide(side));

  const fetchProductColors = async (productId: string) => {
    setColorsLoading(true);
    try {
      const response = await fetch(`/api/admin/product-colors?productId=${productId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '색상 데이터를 불러오지 못했습니다.');
      }
      const payload = await response.json();
      setProductColors(payload?.data || []);
    } catch (error) {
      console.error('Error fetching product colors:', error);
    } finally {
      setColorsLoading(false);
    }
  };

  useEffect(() => {
    if (!product?.id) return;
    if (hasLayeredItem) return;
    void fetchProductColors(product.id);
  }, [product?.id, hasLayeredItem]);

  // Fetch partner mall presets
  const fetchPresets = async (productId: string) => {
    setPresetsLoading(true);
    try {
      const response = await fetch(`/api/admin/partner-mall-presets?product_id=${productId}`);
      if (!response.ok) throw new Error('프리셋을 불러오지 못했습니다.');
      const result = await response.json();
      setPresets(result.data || []);
    } catch (error) {
      console.error('Error fetching presets:', error);
    } finally {
      setPresetsLoading(false);
    }
  };

  useEffect(() => {
    if (product?.id && activeTab === 'partner-mall') {
      void fetchPresets(product.id);
    }
  }, [product?.id, activeTab]);

  // Fetch all print methods + product's linked print methods
  useEffect(() => {
    const fetchPrintMethods = async () => {
      try {
        const res = await fetch('/api/admin/print-methods');
        if (res.ok) {
          const payload = await res.json();
          setAllPrintMethods(payload?.data || []);
        }
      } catch {}
    };
    void fetchPrintMethods();
  }, []);

  useEffect(() => {
    if (!product?.id) return;
    const fetchProductPrintMethods = async () => {
      try {
        const res = await fetch(`/api/admin/product-print-methods?productId=${product.id}`);
        if (res.ok) {
          const payload = await res.json();
          setProductPrintMethods(payload?.data || []);
        }
      } catch {}
    };
    void fetchProductPrintMethods();
  }, [product?.id]);

  const handleTogglePrintMethod = async (printMethod: PrintMethodRecord) => {
    if (!product?.id || togglingPrintMethodId) return;
    setTogglingPrintMethodId(printMethod.id);
    try {
      const existing = productPrintMethods.find((pm) => pm.print_method_id === printMethod.id);
      if (existing) {
        // Unlink
        const res = await fetch(`/api/admin/product-print-methods?id=${existing.id}`, { method: 'DELETE' });
        if (res.ok) {
          setProductPrintMethods((prev) => prev.filter((pm) => pm.id !== existing.id));
        }
      } else {
        // Link
        const res = await fetch('/api/admin/product-print-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: product.id, print_method_id: printMethod.id }),
        });
        if (res.ok) {
          const payload = await res.json();
          if (payload?.data) {
            setProductPrintMethods((prev) => [...prev, payload.data]);
          }
        }
      }
    } catch {}
    setTogglingPrintMethodId(null);
  };

  const handleCreatePreset = async () => {
    if (!product?.id || !newPresetName.trim()) return;
    setSavingPreset(true);
    try {
      const response = await fetch('/api/admin/partner-mall-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          name: newPresetName.trim(),
          placement: { x: 50, y: 50, width: 100, height: 100 },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error || '프리셋 생성에 실패했습니다.');
      }
      const result = await response.json();
      setPresets((prev) => [...prev, result.data]);
      setNewPresetName('');
      setShowNewPresetInput(false);
      setEditingPreset(result.data);
    } catch (error) {
      alert(error instanceof Error ? error.message : '프리셋 생성에 실패했습니다.');
    } finally {
      setSavingPreset(false);
    }
  };

  const handleUpdatePresetPlacement = async (presetId: string, placement: LogoPlacement) => {
    try {
      const response = await fetch('/api/admin/partner-mall-presets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: presetId, placement }),
      });
      if (!response.ok) throw new Error('프리셋 업데이트에 실패했습니다.');
      const result = await response.json();
      setPresets((prev) => prev.map((p) => (p.id === presetId ? result.data : p)));
      setEditingPreset(result.data);
    } catch (error) {
      console.error('Error updating preset:', error);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm('이 프리셋을 삭제하시겠습니까?')) return;
    try {
      const response = await fetch(`/api/admin/partner-mall-presets?id=${presetId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('프리셋 삭제에 실패했습니다.');
      setPresets((prev) => prev.filter((p) => p.id !== presetId));
      if (editingPreset?.id === presetId) setEditingPreset(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '프리셋 삭제에 실패했습니다.');
    }
  };

  // Fetch manufacturers and categories when component mounts
  useEffect(() => {
    void fetchManufacturers();
    void fetchCategories();
  }, []);

  // Load manufacturer colors if product already has a linked manufacturer
  useEffect(() => {
    if (linkedManufacturerId && !hasLayeredItem) {
      void fetchManufacturerColors(linkedManufacturerId);
    }
  }, [linkedManufacturerId, hasLayeredItem]);

  const fetchManufacturers = async () => {
    setManufacturersLoading(true);
    try {
      const response = await fetch('/api/admin/manufacturers');
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '제조사 데이터를 불러오지 못했습니다.');
      }
      const payload = await response.json();
      setManufacturers(payload?.data || []);
    } catch (error) {
      console.error('Error fetching manufacturers:', error);
    } finally {
      setManufacturersLoading(false);
    }
  };

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const response = await fetch('/api/admin/categories');
      if (!response.ok) throw new Error('카테고리 데이터를 불러오지 못했습니다.');
      const payload = await response.json();
      setCategories((payload?.data || []).map((c: { key: string; name: string; icon?: string }) => ({
        key: c.key,
        name: c.name,
        icon: c.icon || '',
      })));
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddingCategory(true);
    try {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '카테고리 생성에 실패했습니다.');
      }
      const payload = await response.json();
      const created = payload?.data;
      if (created) {
        setCategories((prev) => [...prev, { key: created.key, name: created.name, icon: created.icon || '' }]);
        setCategory(created.key);
      }
      setNewCategoryName('');
      setShowNewCategoryInput(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : '카테고리 생성에 실패했습니다.');
    } finally {
      setAddingCategory(false);
    }
  };

  const handleDeleteCategory = async (key: string) => {
    const cat = categories.find((c) => c.key === key);
    if (!cat || !confirm(`"${cat.name}" 카테고리를 삭제하시겠습니까?`)) return;
    try {
      const response = await fetch(`/api/admin/categories?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '카테고리 삭제에 실패했습니다.');
      }
      setCategories((prev) => prev.filter((c) => c.key !== key));
      if (category === key) setCategory('');
    } catch (error) {
      alert(error instanceof Error ? error.message : '카테고리 삭제에 실패했습니다.');
    }
  };

  const fetchManufacturerColors = async (manufacturerId: string) => {
    setManufacturerColorsLoading(true);
    try {
      const response = await fetch(`/api/admin/manufacturer-colors?manufacturerId=${manufacturerId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '색상 데이터를 불러오지 못했습니다.');
      }
      const payload = await response.json();
      setManufacturerColors(payload?.data || []);
    } catch (error) {
      console.error('Error fetching manufacturer colors:', error);
    } finally {
      setManufacturerColorsLoading(false);
    }
  };


  const isColorSelected = (manufacturerColorId: string) => {
    return productColors.some((pc) => pc.manufacturer_color_id === manufacturerColorId);
  };

  const handleToggleColor = async (manufacturerColor: ManufacturerColor) => {
    if (!product?.id) {
      alert('제품을 먼저 저장해주세요.');
      return;
    }

    const existingProductColor = productColors.find(
      (pc) => pc.manufacturer_color_id === manufacturerColor.id
    );

    setTogglingColorId(manufacturerColor.id);
    try {
      if (existingProductColor) {
        // Remove the color
        const response = await fetch(`/api/admin/product-colors?id=${existingProductColor.id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || '색상 삭제에 실패했습니다.');
        }
        setProductColors((prev) => prev.filter((pc) => pc.id !== existingProductColor.id));
      } else {
        // Add the color
        const response = await fetch('/api/admin/product-colors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: product.id,
            manufacturer_color_id: manufacturerColor.id,
            is_active: true,
            sort_order: productColors.length,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error || '색상 추가에 실패했습니다.');
        }
        const payload = await response.json();
        const created = payload?.data as ProductColor;
        setProductColors((prev) => [...prev, created].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
      }
    } catch (error) {
      console.error('Error toggling product color:', error);
      alert(error instanceof Error ? error.message : '색상 변경에 실패했습니다.');
    } finally {
      setTogglingColorId(null);
    }
  };

  // Layer-specific manufacturer handling
  const getLayerKey = (sideIndex: number, layerIndex: number) => `${sideIndex}-${layerIndex}`;

  const fetchLayerManufacturerColors = async (sideIndex: number, layerIndex: number, manufacturerId: string) => {
    const key = getLayerKey(sideIndex, layerIndex);
    setLayerColorsLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/api/admin/manufacturer-colors?manufacturerId=${manufacturerId}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '색상 데이터를 불러오지 못했습니다.');
      }
      const payload = await response.json();
      setLayerManufacturerColors((prev) => ({ ...prev, [key]: payload?.data || [] }));
    } catch (error) {
      console.error('Error fetching layer manufacturer colors:', error);
    } finally {
      setLayerColorsLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleLayerManufacturerChange = (sideIndex: number, layerIndex: number, manufacturerId: string) => {
    const key = getLayerKey(sideIndex, layerIndex);
    setLayerManufacturerIds((prev) => ({ ...prev, [key]: manufacturerId }));
    if (manufacturerId) {
      void fetchLayerManufacturerColors(sideIndex, layerIndex, manufacturerId);
    } else {
      setLayerManufacturerColors((prev) => ({ ...prev, [key]: [] }));
    }
  };

  const isLayerColorSelected = (sideIndex: number, layerIndex: number, hex: string, colorCode: string) => {
    const side = sides[sideIndex];
    const layer = side?.layers?.[layerIndex];
    if (!layer) return false;
    return layer.colorOptions.some(
      (opt) => opt.hex.toLowerCase() === hex.toLowerCase() && opt.colorCode === colorCode
    );
  };

  const handleToggleLayerColor = (sideIndex: number, layerIndex: number, mColor: ManufacturerColor) => {
    const newSides = [...sides];
    const side = newSides[sideIndex];
    const layers = Array.isArray(side.layers) ? [...side.layers] : [];
    const layer = layers[layerIndex];
    if (!layer) return;

    const colorOptions = Array.isArray(layer.colorOptions) ? [...layer.colorOptions] : [];
    const existingIndex = colorOptions.findIndex(
      (opt) => opt.hex.toLowerCase() === mColor.hex.toLowerCase() && opt.colorCode === mColor.color_code
    );

    if (existingIndex >= 0) {
      // Remove the color
      colorOptions.splice(existingIndex, 1);
    } else {
      // Add the color
      colorOptions.push({ hex: mColor.hex, colorCode: mColor.color_code });
    }

    layers[layerIndex] = { ...layer, colorOptions };
    newSides[sideIndex] = { ...side, layers };
    setSides(newSides);
  };

  const handleDeleteProductColor = async (id: string) => {
    const confirmed = window.confirm('이 색상을 삭제할까요?');
    if (!confirmed) return;

    setDeletingColorId(id);
    try {
      const response = await fetch(`/api/admin/product-colors?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '색상 삭제에 실패했습니다.');
      }
      setProductColors((prev) => prev.filter((color) => color.id !== id));
    } catch (error) {
      console.error('Error deleting product color:', error);
      alert(error instanceof Error ? error.message : '색상 삭제에 실패했습니다.');
    } finally {
      setDeletingColorId(null);
    }
  };

  // Add new side
  const handleAddSide = () => {
    const sideOptionsList = [
      { id: 'front', name: '앞면' },
      { id: 'back', name: '뒷면' },
      { id: 'left', name: '왼쪽' },
      { id: 'right', name: '오른쪽' },
    ];
    const usedIds = new Set(sides.map(s => s.id));
    const nextSide = sideOptionsList.find(s => !usedIds.has(s.id)) || sideOptionsList[0];
    const newSide: ProductSide = {
      id: nextSide.id,
      name: nextSide.name,
      imageUrl: '',
      printArea: buildPrintArea(),
      layers: [],
      realLifeDimensions: buildRealLifeDimensions(),
    };
    setSides([...sides, newSide]);
  };

  // Remove side
  const handleRemoveSide = (index: number) => {
    if (sides.length <= 1) {
      alert('최소 1개의 면이 필요합니다.');
      return;
    }
    const newSides = sides.filter((_, i) => i !== index);
    setSides(newSides);
    if (currentSideIndex >= newSides.length) {
      setCurrentSideIndex(newSides.length - 1);
    }
  };

  // Update side field
  const updateSideField = (index: number, field: keyof ProductSide, value: any) => {
    const newSides = [...sides];
    newSides[index] = {
      ...newSides[index],
      [field]: value,
    };
    setSides(newSides);
  };

  const updateRealLifeDimensions = (index: number, field: keyof NonNullable<ProductSide['realLifeDimensions']>, value: number) => {
    const newSides = [...sides];
    newSides[index] = {
      ...newSides[index],
      realLifeDimensions: {
        ...buildRealLifeDimensions(newSides[index].realLifeDimensions),
        [field]: Math.max(0, Math.round(value)),
      },
    };
    setSides(newSides);
  };

  const setSideMode = (index: number, mode: 'single' | 'layered') => {
    const newSides = [...sides];
    const currentSide = newSides[index];
    if (mode === 'layered') {
      newSides[index] = {
        ...currentSide,
        layers: currentSide.layers && currentSide.layers.length > 0
          ? currentSide.layers
          : [
              {
                id: `layer-${Date.now()}`,
                name: 'Layer 1',
                imageUrl: '',
                colorOptions: [],
                zIndex: 0,
              },
            ],
        imageUrl: currentSide.imageUrl || '',
      };
    } else {
      newSides[index] = {
        ...currentSide,
        layers: [],
      };
    }
    setSides(newSides);
  };

  const addLayer = (sideIndex: number) => {
    const newSides = [...sides];
    const side = newSides[sideIndex];
    const layers = Array.isArray(side.layers) ? [...side.layers] : [];
    layers.push({
      id: `layer-${Date.now()}`,
      name: `Layer ${layers.length + 1}`,
      imageUrl: '',
      colorOptions: [],
      zIndex: layers.length,
    });
    newSides[sideIndex] = {
      ...side,
      layers,
    };
    setSides(newSides);
  };

  const removeLayer = (sideIndex: number, layerIndex: number) => {
    const newSides = [...sides];
    const side = newSides[sideIndex];
    const layers = Array.isArray(side.layers) ? [...side.layers] : [];
    if (layers.length <= 1) {
      alert('최소 1개의 레이어가 필요합니다.');
      return;
    }
    layers.splice(layerIndex, 1);
    newSides[sideIndex] = {
      ...side,
      layers,
    };
    setSides(newSides);
  };

  const updateLayerField = (
    sideIndex: number,
    layerIndex: number,
    field: keyof ProductLayer,
    value: string | number
  ) => {
    const newSides = [...sides];
    const side = newSides[sideIndex];
    const layers = Array.isArray(side.layers) ? [...side.layers] : [];
    if (!layers[layerIndex]) return;
    layers[layerIndex] = {
      ...layers[layerIndex],
      [field]: value,
    };
    newSides[sideIndex] = {
      ...side,
      layers,
    };
    setSides(newSides);
  };

  const addLayerColorOption = (sideIndex: number, layerIndex: number) => {
    const newSides = [...sides];
    const side = newSides[sideIndex];
    const layers = Array.isArray(side.layers) ? [...side.layers] : [];
    const layer = layers[layerIndex];
    if (!layer) return;
    const colorOptions = Array.isArray(layer.colorOptions) ? [...layer.colorOptions] : [];
    colorOptions.push({ hex: '#FFFFFF', colorCode: '' });
    layers[layerIndex] = {
      ...layer,
      colorOptions,
    };
    newSides[sideIndex] = {
      ...side,
      layers,
    };
    setSides(newSides);
  };

  const updateLayerColorOption = (
    sideIndex: number,
    layerIndex: number,
    optionIndex: number,
    field: 'hex' | 'colorCode',
    value: string
  ) => {
    const newSides = [...sides];
    const side = newSides[sideIndex];
    const layers = Array.isArray(side.layers) ? [...side.layers] : [];
    const layer = layers[layerIndex];
    if (!layer) return;
    const colorOptions = Array.isArray(layer.colorOptions) ? [...layer.colorOptions] : [];
    if (!colorOptions[optionIndex]) return;
    colorOptions[optionIndex] = {
      ...colorOptions[optionIndex],
      [field]: value,
    };
    layers[layerIndex] = {
      ...layer,
      colorOptions,
    };
    newSides[sideIndex] = {
      ...side,
      layers,
    };
    setSides(newSides);
  };

  const removeLayerColorOption = (sideIndex: number, layerIndex: number, optionIndex: number) => {
    const newSides = [...sides];
    const side = newSides[sideIndex];
    const layers = Array.isArray(side.layers) ? [...side.layers] : [];
    const layer = layers[layerIndex];
    if (!layer) return;
    const colorOptions = Array.isArray(layer.colorOptions) ? [...layer.colorOptions] : [];
    colorOptions.splice(optionIndex, 1);
    layers[layerIndex] = {
      ...layer,
      colorOptions,
    };
    newSides[sideIndex] = {
      ...side,
      layers,
    };
    setSides(newSides);
  };

  // ── Layer-ID-based color management (shared across sides) ──

  // Collect unique layers by ID across all sides
  const uniqueLayers = (() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const side of sides) {
      if (!side.layers) continue;
      for (const layer of side.layers) {
        if (!map.has(layer.id)) {
          map.set(layer.id, { id: layer.id, name: layer.name });
        }
      }
    }
    return Array.from(map.values());
  })();

  // Get current colorOptions for a layer ID (from the first occurrence)
  const getLayerIdColorOptions = (layerId: string): Array<{ hex: string; colorCode: string }> => {
    for (const side of sides) {
      if (!side.layers) continue;
      const layer = side.layers.find(l => l.id === layerId);
      if (layer) return layer.colorOptions || [];
    }
    return [];
  };

  const fetchLayerIdManufacturerColors = async (layerId: string, manufacturerId: string) => {
    setLayerIdColorsLoading(prev => ({ ...prev, [layerId]: true }));
    try {
      const response = await fetch(`/api/admin/manufacturer-colors?manufacturerId=${manufacturerId}`);
      if (!response.ok) throw new Error('Failed to fetch colors');
      const payload = await response.json();
      setLayerIdManufacturerColors(prev => ({ ...prev, [layerId]: payload?.data || [] }));
    } catch (error) {
      console.error('Error fetching layer manufacturer colors:', error);
    } finally {
      setLayerIdColorsLoading(prev => ({ ...prev, [layerId]: false }));
    }
  };

  const handleLayerIdManufacturerChange = (layerId: string, manufacturerId: string) => {
    setLayerIdManufacturerIds(prev => ({ ...prev, [layerId]: manufacturerId }));
    if (manufacturerId) {
      void fetchLayerIdManufacturerColors(layerId, manufacturerId);
    } else {
      setLayerIdManufacturerColors(prev => ({ ...prev, [layerId]: [] }));
    }
  };

  const isLayerIdColorSelected = (layerId: string, hex: string, colorCode: string) => {
    const options = getLayerIdColorOptions(layerId);
    return options.some(opt => opt.hex.toLowerCase() === hex.toLowerCase() && opt.colorCode === colorCode);
  };

  // Toggle a color for a layer ID — applies to ALL layers with that ID across all sides
  const handleToggleLayerIdColor = (layerId: string, mColor: ManufacturerColor) => {
    const newSides = sides.map(side => {
      if (!side.layers) return side;
      const hasLayer = side.layers.some(l => l.id === layerId);
      if (!hasLayer) return side;
      return {
        ...side,
        layers: side.layers.map(layer => {
          if (layer.id !== layerId) return layer;
          const colorOptions = [...(layer.colorOptions || [])];
          const existingIndex = colorOptions.findIndex(
            opt => opt.hex.toLowerCase() === mColor.hex.toLowerCase() && opt.colorCode === mColor.color_code
          );
          if (existingIndex >= 0) {
            colorOptions.splice(existingIndex, 1);
          } else {
            colorOptions.push({ hex: mColor.hex, colorCode: mColor.color_code });
          }
          return { ...layer, colorOptions };
        }),
      };
    });
    setSides(newSides);
  };

  // Remove a color option from all layers with a given ID
  const removeLayerIdColorOption = (layerId: string, hex: string, colorCode: string) => {
    const newSides = sides.map(side => {
      if (!side.layers) return side;
      const hasLayer = side.layers.some(l => l.id === layerId);
      if (!hasLayer) return side;
      return {
        ...side,
        layers: side.layers.map(layer => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            colorOptions: (layer.colorOptions || []).filter(
              opt => !(opt.hex.toLowerCase() === hex.toLowerCase() && opt.colorCode === colorCode)
            ),
          };
        }),
      };
    });
    setSides(newSides);
  };

  // Add a custom color to all layers with a given ID
  const addCustomLayerIdColor = (layerId: string) => {
    const hex = layerCustomColorHex[layerId] || '#000000';
    const colorCode = layerCustomColorName[layerId]?.trim();
    if (!colorCode) {
      alert('색상 이름을 입력해주세요.');
      return;
    }
    // Check for duplicate
    const existing = getLayerIdColorOptions(layerId);
    if (existing.some(opt => opt.hex.toLowerCase() === hex.toLowerCase() && opt.colorCode === colorCode)) {
      alert('이미 동일한 색상이 등록되어 있습니다.');
      return;
    }
    const newSides = sides.map(side => {
      if (!side.layers) return side;
      const hasLayer = side.layers.some(l => l.id === layerId);
      if (!hasLayer) return side;
      return {
        ...side,
        layers: side.layers.map(layer => {
          if (layer.id !== layerId) return layer;
          return {
            ...layer,
            colorOptions: [...(layer.colorOptions || []), { hex, colorCode }],
          };
        }),
      };
    });
    setSides(newSides);
    setLayerCustomColorHex(prev => ({ ...prev, [layerId]: '#000000' }));
    setLayerCustomColorName(prev => ({ ...prev, [layerId]: '' }));
  };

  // Add a custom color for single-image products (creates manufacturer_color then product_color)
  const handleAddCustomProductColor = async () => {
    if (!product?.id) {
      alert('제품을 먼저 저장해주세요.');
      return;
    }
    if (!linkedManufacturerId) {
      alert('제조사를 먼저 연결해주세요.');
      return;
    }
    const name = customColorName.trim();
    if (!name) {
      alert('색상 이름을 입력해주세요.');
      return;
    }
    setAddingCustomColor(true);
    try {
      // Create manufacturer color
      const mcRes = await fetch('/api/admin/manufacturer-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer_id: linkedManufacturerId,
          name,
          hex: customColorHex,
          color_code: name,
          is_active: true,
          sort_order: 0,
        }),
      });
      if (!mcRes.ok) {
        const payload = await mcRes.json().catch(() => ({}));
        throw new Error(payload?.error || '제조사 색상 생성에 실패했습니다.');
      }
      const mcPayload = await mcRes.json();
      const newMC = mcPayload?.data as ManufacturerColor;

      // Link to product
      const pcRes = await fetch('/api/admin/product-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          manufacturer_color_id: newMC.id,
          is_active: true,
          sort_order: productColors.length,
        }),
      });
      if (!pcRes.ok) {
        const payload = await pcRes.json().catch(() => ({}));
        throw new Error(payload?.error || '제품 색상 추가에 실패했습니다.');
      }
      const pcPayload = await pcRes.json();
      const created = pcPayload?.data as ProductColor;
      setProductColors(prev => [...prev, created].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));

      // Also refresh manufacturer colors list
      setManufacturerColors(prev => [...prev, newMC]);
      setCustomColorHex('#000000');
      setCustomColorName('');
    } catch (error) {
      console.error('Error adding custom color:', error);
      alert(error instanceof Error ? error.message : '커스텀 색상 추가에 실패했습니다.');
    } finally {
      setAddingCustomColor(false);
    }
  };

  const persistProductImageField = async (
    field: 'thumbnail_image_link' | 'description_image' | 'sizing_chart_image',
    value: string | string[] | null
  ) => {
    if (!product?.id) return;
    try {
      const response = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, [field]: value }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '이미지 링크 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error persisting product image:', error);
      alert(error instanceof Error ? error.message : '이미지 링크 저장 중 오류가 발생했습니다.');
    }
  };

  // Handle image upload
  const handleImageUpload = async (target: UploadTarget, file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();

      // Create unique file name
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath =
        target.kind === 'product'
          ? `product-images/product-meta/${product?.id ?? 'new'}/${target.field}/${fileName}`
          : `product-images/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('products')
        .getPublicUrl(filePath);

      if (target.kind === 'side') {
        if (typeof target.layerIndex === 'number') {
          updateLayerField(target.sideIndex, target.layerIndex, 'imageUrl', publicUrl);
        } else {
          updateSideField(target.sideIndex, 'imageUrl', publicUrl);
        }
      } else if (target.field === 'thumbnail_image_link') {
        const updated = [...thumbnailImages, publicUrl];
        setThumbnailImages(updated);
        await persistProductImageField('thumbnail_image_link', updated);
      } else if (target.field === 'description_image') {
        const updated = [...descriptionImages, publicUrl];
        setDescriptionImages(updated);
        await persistProductImageField('description_image', updated);
      } else {
        setSizingChartImage(publicUrl);
        await persistProductImageField('sizing_chart_image', publicUrl);
      }

      alert('이미지가 업로드되었습니다.');
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  // Trigger file input
  const triggerFileInput = (sideIndex: number, layerIndex?: number) => {
    setUploadTarget({ kind: 'side', sideIndex, layerIndex });
    fileInputRef.current?.click();
  };

  const triggerProductFileInput = (field: 'thumbnail_image_link' | 'description_image' | 'sizing_chart_image') => {
    setUploadTarget({ kind: 'product', field });
    fileInputRef.current?.click();
  };

  const clearProductImage = (field: 'thumbnail_image_link' | 'description_image' | 'sizing_chart_image') => {
    if (field === 'thumbnail_image_link') {
      setThumbnailImages([]);
    } else if (field === 'description_image') {
      setDescriptionImages([]);
    } else {
      setSizingChartImage('');
    }
    void persistProductImageField(field, field === 'description_image' || field === 'thumbnail_image_link' ? [] : null);
  };

  const removeThumbnailImage = (index: number) => {
    const updated = thumbnailImages.filter((_, i) => i !== index);
    setThumbnailImages(updated);
    void persistProductImageField('thumbnail_image_link', updated.length > 0 ? updated : null);
  };

  const removeDescriptionImage = (index: number) => {
    const updated = descriptionImages.filter((_, i) => i !== index);
    setDescriptionImages(updated);
    void persistProductImageField('description_image', updated.length > 0 ? updated : null);
  };

  const reorderThumbnailImages = (fromIndex: number, toIndex: number) => {
    const updated = [...thumbnailImages];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setThumbnailImages(updated);
    void persistProductImageField('thumbnail_image_link', updated);
  };

  const reorderDescriptionImages = (fromIndex: number, toIndex: number) => {
    const updated = [...descriptionImages];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setDescriptionImages(updated);
    void persistProductImageField('description_image', updated);
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && uploadTarget) {
      const target = uploadTarget;
      setUploadTarget(null);
      for (let i = 0; i < files.length; i++) {
        void handleImageUpload(target, files[i]);
      }
    }
    e.target.value = ''; // Reset input
  };

  // Add size option
  const handleAddSizeOption = () => {
    setSizeOptions([...sizeOptions, { label: '', size_code: '' }]);
  };

  // Remove size option
  const handleRemoveSizeOption = (index: number) => {
    setSizeOptions(sizeOptions.filter((_, i) => i !== index));
  };

  // Update size option field (label or size_code)
  const updateSizeOption = (index: number, field: 'label' | 'size_code', value: string) => {
    const newSizeOptions = [...sizeOptions];
    newSizeOptions[index] = { ...newSizeOptions[index], [field]: value };
    setSizeOptions(newSizeOptions);
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!title.trim()) {
      alert('제품명을 입력해주세요.');
      return false;
    }
    if (basePrice <= 0) {
      alert('기본 가격을 입력해주세요.');
      return false;
    }
    if (sides.length === 0) {
      alert('최소 1개의 면을 추가해주세요.');
      return false;
    }
    for (let i = 0; i < sides.length; i++) {
      if (!sides[i].name.trim()) {
        alert(`면 ${i + 1}의 이름을 입력해주세요.`);
        return false;
      }
      const hasLayers = isLayeredSide(sides[i]);
      if (hasLayers) {
        const layers = sides[i].layers || [];
        if (layers.length === 0) {
          alert(`면 ${i + 1}에 최소 1개의 레이어가 필요합니다.`);
          return false;
        }
        for (let j = 0; j < layers.length; j++) {
          if (!layers[j].name.trim()) {
            alert(`면 ${i + 1}의 레이어 ${j + 1} 이름을 입력해주세요.`);
            return false;
          }
          if (!layers[j].imageUrl.trim()) {
            alert(`면 ${i + 1}의 레이어 ${j + 1} 이미지를 업로드해주세요.`);
            return false;
          }
        }
      } else if (!sides[i].imageUrl.trim()) {
        alert(`면 ${i + 1}의 이미지를 업로드해주세요.`);
        return false;
      }
    }
    return true;
  };

  // Save product
  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      const configuration = sides.map((side) => {
        const hasLayers = isLayeredSide(side);
        const { defaultLogoPlacement: _, ...sideData } = side;
        return {
          ...sideData,
          imageUrl: hasLayers ? '' : side.imageUrl,
          layers: hasLayers ? side.layers : [],
          printArea: buildPrintArea(side.printArea),
          realLifeDimensions: buildRealLifeDimensions(side.realLifeDimensions),
        };
      });

      const productData = {
        title,
        base_price: basePrice,
        category: category || null,
        is_active: isActive,
        configuration,
        size_options: sizeOptions.length > 0 ? sizeOptions : null,
        thumbnail_image_link: thumbnailImages.length > 0 ? thumbnailImages : null,
        description_image: descriptionImages.length > 0 ? descriptionImages : null,
        sizing_chart_image: sizingChartImage.trim() ? sizingChartImage.trim() : null,
        product_code: productCode.trim() ? productCode.trim() : null,
        discount_rates: discountRates.length > 0 ? discountRates : null,
        manufacturer_id: linkedManufacturerId || null,
        keywords,
      };

      if (!isNewProduct && !product?.id) {
        throw new Error('제품 ID가 필요합니다.');
      }

      const response = await fetch('/api/admin/products', {
        method: isNewProduct ? 'POST' : 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          isNewProduct ? productData : { id: product?.id, ...productData }
        ),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '제품 저장에 실패했습니다.');
      }

      const responsePayload = await response.json();
      const savedProduct = responsePayload?.data as Product;
      onSave(savedProduct);
    } catch (error) {
      console.error('Error saving product:', error);
      alert('제품 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {isNewProduct ? '새 제품 추가' : '제품 편집'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isNewProduct ? '제품 정보를 입력하고 면을 추가하세요.' : `${product.title} 편집 중`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-5 h-5" />
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'basic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Panel - Basic Info */}
        <div className="space-y-4">
          {/* Basic Information */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">기본 정보</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  제품명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                  placeholder="예: 베이직 티셔츠"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  기본 가격 (원) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={basePrice}
                  onChange={(e) => setBasePrice(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                <div className="flex gap-2">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    disabled={categoriesLoading}
                  >
                    <option value="">-- 카테고리 선택 --</option>
                    {categories.map((cat) => (
                      <option key={cat.key} value={cat.key}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {category && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteCategory(category)}
                      className="px-2 py-2 border border-red-200 rounded-md hover:bg-red-50 text-red-500"
                      title="카테고리 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowNewCategoryInput(!showNewCategoryInput)}
                    className="px-2 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600"
                    title="카테고리 추가"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {showNewCategoryInput && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                      placeholder="새 카테고리 이름"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleAddCategory(); } }}
                      disabled={addingCategory}
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddCategory()}
                      disabled={addingCategory || !newCategoryName.trim()}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addingCategory ? <Loader2 className="w-3 h-3 animate-spin" /> : '추가'}
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">제품 코드 (product_code)</label>
                <input
                  type="text"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                  placeholder="예: TSHIRT-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">키워드 (해시태그)</label>
                <KeywordsInput value={keywords} onChange={setKeywords} />
                <p className="text-xs text-gray-500 mt-1">
                  Enter 또는 쉼표로 추가, 백스페이스로 마지막 칩 삭제. 기존 키워드는 자동완성됩니다.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">연결된 제조사</label>
                <select
                  value={linkedManufacturerId}
                  onChange={(e) => {
                    const newManufacturerId = e.target.value;
                    setLinkedManufacturerId(newManufacturerId);
                    // Fetch colors for the new manufacturer
                    if (newManufacturerId) {
                      void fetchManufacturerColors(newManufacturerId);
                    } else {
                      setManufacturerColors([]);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                  disabled={manufacturersLoading}
                >
                  <option value="">-- 제조사 선택 --</option>
                  {manufacturers.map((manufacturer) => (
                    <option key={manufacturer.id} value={manufacturer.id}>
                      {manufacturer.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">제품에 연결할 제조사를 선택하세요. 색상 옵션은 연결된 제조사의 색상에서 선택됩니다.</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="is-active" className="text-sm font-medium text-gray-700">
                  활성 상태
                </label>
              </div>
            </div>
          </div>

          {/* Discount Rates */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">수량별 할인율</h3>
                <p className="text-xs text-gray-500 mt-0.5">discount_rates (주문 수량에 따른 할인율)</p>
              </div>
              <button
                onClick={() => setDiscountRates([...discountRates, { min_quantity: 0, discount_rate: 0 }])}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                추가
              </button>
            </div>
            <div className="space-y-2">
              {discountRates.map((rate, index) => (
                <div key={`discount-rate-${index}`} className="flex gap-2 items-center">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">최소 수량</label>
                    <input
                      type="number"
                      value={rate.min_quantity}
                      onChange={(e) => {
                        const newRates = [...discountRates];
                        newRates[index] = { ...newRates[index], min_quantity: parseInt(e.target.value) || 0 };
                        setDiscountRates(newRates);
                      }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      placeholder="예: 10"
                      min="0"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">할인율 (%)</label>
                    <input
                      type="number"
                      value={rate.discount_rate}
                      onChange={(e) => {
                        const newRates = [...discountRates];
                        newRates[index] = { ...newRates[index], discount_rate: parseFloat(e.target.value) || 0 };
                        setDiscountRates(newRates);
                      }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      placeholder="예: 5"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </div>
                  <button
                    onClick={() => setDiscountRates(discountRates.filter((_, i) => i !== index))}
                    className="p-1 text-red-600 hover:bg-red-50 rounded mt-5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {discountRates.length === 0 && (
                <p className="text-sm text-gray-500">할인율이 없습니다.</p>
              )}
              {discountRates.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  예: 최소 수량 10, 할인율 5% → 10개 이상 주문 시 5% 할인
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Images */}
        <div className="space-y-4">
          {/* Product Images */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">제품 이미지</h3>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">제품 썸네일 (thumbnail_image_link)</label>
                {thumbnailImages.length > 0 && (
                  <div className="space-y-1">
                    {thumbnailImages.map((url, idx) => (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = Number(e.dataTransfer.getData('text/plain'));
                          if (!isNaN(from) && from !== idx) reorderThumbnailImages(from, idx);
                        }}
                        className="flex items-center gap-2 p-1.5 bg-gray-50 rounded border border-gray-200 group"
                      >
                        <GripVertical className="w-4 h-4 text-gray-400 cursor-grab shrink-0" />
                        <img src={url} alt={`썸네일 ${idx + 1}`} className="w-14 h-14 object-cover rounded border border-gray-200" />
                        <span className="text-xs text-gray-500 truncate flex-1 min-w-0">{url.split('/').pop()}</span>
                        <button
                          onClick={() => removeThumbnailImage(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => triggerProductFileInput('thumbnail_image_link')}
                    disabled={uploading}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    이미지 추가
                  </button>
                  {thumbnailImages.length > 0 && (
                    <button
                      onClick={() => clearProductImage('thumbnail_image_link')}
                      disabled={uploading}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      전체 삭제
                    </button>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem('thumbImgUrl') as HTMLInputElement;
                    const url = input.value.trim();
                    if (!url) return;
                    const updated = [...thumbnailImages, url];
                    setThumbnailImages(updated);
                    void persistProductImageField('thumbnail_image_link', updated);
                    input.value = '';
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    name="thumbImgUrl"
                    type="text"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    placeholder="이미지 링크 입력 (https://...)"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    추가
                  </button>
                </form>
                {!product?.id && (
                  <p className="text-xs text-gray-500">새 제품은 저장 후 링크가 DB에 저장됩니다.</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">상세 이미지 (description_image)</label>
                {descriptionImages.length > 0 && (
                  <div className="space-y-1">
                    {descriptionImages.map((url, idx) => (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(idx)); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = Number(e.dataTransfer.getData('text/plain'));
                          if (!isNaN(from) && from !== idx) reorderDescriptionImages(from, idx);
                        }}
                        className="flex items-center gap-2 p-1.5 bg-gray-50 rounded border border-gray-200 group"
                      >
                        <GripVertical className="w-4 h-4 text-gray-400 cursor-grab shrink-0" />
                        <img src={url} alt={`상세 ${idx + 1}`} className="w-14 h-14 object-cover rounded border border-gray-200" />
                        <span className="text-xs text-gray-500 truncate flex-1 min-w-0">{url.split('/').pop()}</span>
                        <button
                          onClick={() => removeDescriptionImage(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => triggerProductFileInput('description_image')}
                    disabled={uploading}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    업로드
                  </button>
                  {descriptionImages.length > 0 && (
                    <button
                      onClick={() => clearProductImage('description_image')}
                      disabled={uploading}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      전체 삭제
                    </button>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem('descImgUrl') as HTMLInputElement;
                    const url = input.value.trim();
                    if (!url) return;
                    const updated = [...descriptionImages, url];
                    setDescriptionImages(updated);
                    void persistProductImageField('description_image', updated);
                    input.value = '';
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    name="descImgUrl"
                    type="text"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    placeholder="이미지 링크 입력 (https://...)"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    추가
                  </button>
                </form>
                {!product?.id && (
                  <p className="text-xs text-gray-500">새 제품은 저장 후 링크가 DB에 저장됩니다.</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">사이즈 차트 이미지 (sizing_chart_image)</label>
                <div className="flex items-start gap-3">
                  {sizingChartImage ? (
                    <img
                      src={sizingChartImage}
                      alt="사이즈 차트"
                      className="w-20 h-20 object-cover rounded border border-gray-200"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={sizingChartImage}
                      onChange={(e) => setSizingChartImage(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                      placeholder="https://..."
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => triggerProductFileInput('sizing_chart_image')}
                        disabled={uploading}
                        className="inline-flex items-center gap-1 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        업로드
                      </button>
                      {!!sizingChartImage && (
                        <button
                          onClick={() => clearProductImage('sizing_chart_image')}
                          disabled={uploading}
                          className="inline-flex items-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          지우기
                        </button>
                      )}
                    </div>
                    {!product?.id && (
                      <p className="text-xs text-gray-500">새 제품은 저장 후 링크가 DB에 저장됩니다.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Size & Color Tab */}
      {activeTab === 'size-color' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
          {/* Size Options */}
          <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">사이즈 옵션</h3>
                <p className="text-xs text-gray-500 mt-0.5">라벨(표시용)과 사이즈 코드(관리용)를 입력하세요</p>
              </div>
              <button
                onClick={handleAddSizeOption}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                추가
              </button>
            </div>
            <div className="space-y-2">
              {sizeOptions.map((size, index) => (
                <div key={`size-${index}`} className="flex gap-2 w-full items-center">
                  <input
                    type="text"
                    value={size.label}
                    onChange={(e) => updateSizeOption(index, 'label', e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                    placeholder="라벨 (예: S, M, L)"
                  />
                  <input
                    type="text"
                    value={size.size_code}
                    onChange={(e) => updateSizeOption(index, 'size_code', e.target.value)}
                    className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                    placeholder="코드 (예: 001)"
                  />
                  <button
                    onClick={() => handleRemoveSizeOption(index)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {sizeOptions.length === 0 && (
                <p className="text-sm text-gray-500">사이즈 옵션이 없습니다.</p>
              )}
            </div>
          </div>
          </div>

          <div className="space-y-4">
          {/* Product Colors (Single Image Products) */}
          {!hasLayeredItem && (
            <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">색상 옵션</h3>
                  <p className="text-xs text-gray-500 mt-0.5">연결된 제조사의 색상에서 선택합니다. (product_colors)</p>
                </div>
              </div>

              {!product?.id ? (
                <p className="text-sm text-gray-600">제품을 저장한 후 색상을 추가할 수 있습니다.</p>
              ) : !linkedManufacturerId ? (
                <p className="text-sm text-gray-600">기본 정보에서 제조사를 먼저 선택해주세요.</p>
              ) : (
                <>
                  {/* Show linked manufacturer name */}
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                    <span className="text-sm text-blue-700">
                      연결된 제조사: <strong>{manufacturers.find(m => m.id === linkedManufacturerId)?.name || '로딩 중...'}</strong>
                    </span>
                  </div>

                  {/* Manufacturer Colors Selection */}
                  {linkedManufacturerId && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">제조사 색상</p>
                        {manufacturerColorsLoading && (
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            로딩 중...
                          </p>
                        )}
                      </div>
                      <input
                        type="text"
                        value={colorSearch}
                        onChange={(e) => setColorSearch(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        placeholder="색상 코드 검색..."
                      />
                      {!manufacturerColorsLoading && manufacturerColors.length === 0 && (
                        <p className="text-sm text-gray-500">등록된 색상이 없습니다.</p>
                      )}
                      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                        {[...manufacturerColors]
                          .filter((c) => !colorSearch || c.color_code.toLowerCase().includes(colorSearch.toLowerCase()) || c.name.toLowerCase().includes(colorSearch.toLowerCase()))
                          .sort((a, b) => a.color_code.localeCompare(b.color_code))
                          .map((mColor) => {
                          const selected = isColorSelected(mColor.id);
                          const isToggling = togglingColorId === mColor.id;
                          return (
                            <button
                              key={mColor.id}
                              onClick={() => handleToggleColor(mColor)}
                              disabled={isToggling}
                              className={`flex items-center gap-2 p-2 border rounded-md text-left transition-all ${
                                selected
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300'
                              } ${isToggling ? 'opacity-50' : ''}`}
                            >
                              <div className="relative shrink-0">
                                <div
                                  className="w-6 h-6 rounded border border-gray-300"
                                  style={{ backgroundColor: mColor.hex }}
                                />
                                {selected && (
                                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-gray-900 truncate">{mColor.name}</p>
                                <p className="text-xs text-gray-500 truncate">{mColor.color_code}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Custom Color Picker */}
                  <div className="space-y-2 border-t border-gray-200 pt-4">
                    <p className="text-sm font-medium text-gray-900">커스텀 색상 추가</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customColorHex}
                        onChange={(e) => setCustomColorHex(e.target.value)}
                        className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={customColorName}
                        onChange={(e) => setCustomColorName(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                        placeholder="색상 이름 (예: SKY BLUE)"
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomProductColor(); }}
                      />
                      <button
                        onClick={handleAddCustomProductColor}
                        disabled={addingCustomColor}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
                      >
                        {addingCustomColor && <Loader2 className="w-3 h-3 animate-spin" />}
                        추가
                      </button>
                    </div>
                  </div>

                  {/* Currently Selected Colors */}
                  <div className="space-y-2 border-t border-gray-200 pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">선택된 색상 ({productColors.length})</p>
                      {colorsLoading && <p className="text-xs text-gray-500">불러오는 중...</p>}
                    </div>
                    {productColors.length === 0 && !colorsLoading && (
                      <p className="text-sm text-gray-500">선택된 색상이 없습니다.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {[...productColors].sort((a, b) => (a.manufacturer_colors?.color_code || '').localeCompare(b.manufacturer_colors?.color_code || '')).map((color) => {
                        const mColor = color.manufacturer_colors;
                        return (
                          <div
                            key={color.id}
                            className="flex items-center gap-2 border border-gray-200 rounded-md px-2 py-1.5 bg-gray-50"
                          >
                            <div
                              className="w-4 h-4 rounded border border-gray-300 shrink-0"
                              style={{ backgroundColor: mColor?.hex || '#ccc' }}
                              title={mColor?.hex}
                            />
                            <span className="text-sm text-gray-700">{mColor?.name || '알 수 없음'}</span>
                            <button
                              onClick={() => handleDeleteProductColor(color.id)}
                              disabled={deletingColorId === color.id}
                              className="p-0.5 text-gray-400 hover:text-red-600 rounded disabled:opacity-50"
                              title="삭제"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Layer Colors (Layered Products) */}
          {hasLayeredItem && (
            <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900">레이어 색상 옵션</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  각 레이어별로 색상을 설정합니다. 같은 ID의 레이어는 색상을 공유합니다.
                </p>
              </div>

              {uniqueLayers.length === 0 ? (
                <p className="text-sm text-gray-500">레이어가 없습니다. 면 편집에서 레이어를 추가해주세요.</p>
              ) : (
                <div className="space-y-4">
                  {uniqueLayers.map(uLayer => {
                    const colorOptions = getLayerIdColorOptions(uLayer.id);
                    const selectedManufacturerId = layerIdManufacturerIds[uLayer.id] || '';
                    const availableColors = layerIdManufacturerColors[uLayer.id] || [];
                    const isLoading = layerIdColorsLoading[uLayer.id] || false;
                    const search = layerIdColorSearch[uLayer.id] || '';

                    return (
                      <div key={uLayer.id} className="border border-gray-200 rounded-md p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">{uLayer.name}</span>
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">ID: {uLayer.id}</span>
                          </div>
                          <span className="text-xs text-gray-500">{colorOptions.length}개 색상</span>
                        </div>

                        {/* Manufacturer Dropdown */}
                        <select
                          value={selectedManufacturerId}
                          onChange={(e) => handleLayerIdManufacturerChange(uLayer.id, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          disabled={manufacturersLoading}
                        >
                          <option value="">-- 제조사 선택 --</option>
                          {manufacturers.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>

                        {/* Color Grid */}
                        {selectedManufacturerId && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={search}
                              onChange={(e) => setLayerIdColorSearch(prev => ({ ...prev, [uLayer.id]: e.target.value }))}
                              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                              placeholder="색상 코드 검색..."
                            />
                            {isLoading ? (
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> 색상 로딩 중...
                              </p>
                            ) : (
                              <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                                {[...availableColors]
                                  .filter(c => !search || c.color_code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()))
                                  .sort((a, b) => a.color_code.localeCompare(b.color_code))
                                  .map(mColor => {
                                    const selected = isLayerIdColorSelected(uLayer.id, mColor.hex, mColor.color_code);
                                    return (
                                      <button
                                        key={mColor.id}
                                        onClick={() => handleToggleLayerIdColor(uLayer.id, mColor)}
                                        className={`flex items-center gap-1.5 p-1.5 border rounded text-left transition-all ${
                                          selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                        title={`${mColor.name} (${mColor.color_code})`}
                                      >
                                        <div className="relative shrink-0">
                                          <div className="w-4 h-4 rounded border border-gray-300" style={{ backgroundColor: mColor.hex }} />
                                          {selected && (
                                            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                                              <Check className="w-2 h-2 text-white" />
                                            </div>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-gray-700 truncate">{mColor.color_code}</span>
                                      </button>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Custom Color Picker */}
                        <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
                          <input
                            type="color"
                            value={layerCustomColorHex[uLayer.id] || '#000000'}
                            onChange={(e) => setLayerCustomColorHex(prev => ({ ...prev, [uLayer.id]: e.target.value }))}
                            className="w-7 h-7 rounded border border-gray-300 cursor-pointer p-0.5"
                          />
                          <input
                            type="text"
                            value={layerCustomColorName[uLayer.id] || ''}
                            onChange={(e) => setLayerCustomColorName(prev => ({ ...prev, [uLayer.id]: e.target.value }))}
                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            placeholder="색상 이름 (예: SKY BLUE)"
                            onKeyDown={(e) => { if (e.key === 'Enter') addCustomLayerIdColor(uLayer.id); }}
                          />
                          <button
                            onClick={() => addCustomLayerIdColor(uLayer.id)}
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors whitespace-nowrap"
                          >
                            추가
                          </button>
                        </div>

                        {/* Selected Colors */}
                        <div className="space-y-1">
                          <p className="text-[10px] text-gray-500">선택된 색상 ({colorOptions.length})</p>
                          {colorOptions.length === 0 ? (
                            <p className="text-xs text-gray-400">등록된 컬러 옵션이 없습니다.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {[...colorOptions].sort((a, b) => a.colorCode.localeCompare(b.colorCode)).map(option => (
                                <div
                                  key={`${uLayer.id}-${option.colorCode}-${option.hex}`}
                                  className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-[10px]"
                                >
                                  <div className="w-3 h-3 rounded border border-gray-300" style={{ backgroundColor: option.hex }} />
                                  <span className="text-gray-600">{option.colorCode || option.hex}</span>
                                  <button
                                    onClick={() => removeLayerIdColorOption(uLayer.id, option.hex, option.colorCode)}
                                    className="p-0.5 text-gray-400 hover:text-red-600 rounded"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          </div>

        </div>
      )}

      {/* Sides & Print Area Tab */}
      {activeTab === 'sides' && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        {/* Left - Sides List */}
        <div className="lg:self-start lg:sticky lg:top-20">
          <div className="bg-white border border-gray-200/60 rounded-md p-3 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">면 ({sides.length})</h3>
              <button
                onClick={handleAddSide}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                추가
              </button>
            </div>

            <div className="space-y-2">
              {sides.map((side, index) => {
                const previewUrl = getSidePreviewUrl(side);
                const layered = isLayeredSide(side);
                const layerCount = side.layers?.length ?? 0;
                return (
                  <div
                    key={`${side.id}-${index}`}
                    className={`border rounded-md p-2 cursor-pointer transition-all ${
                      currentSideIndex === index
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setCurrentSideIndex(index)}
                  >
                    <div className="flex items-center gap-2">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt={side.name}
                          className="w-10 h-10 object-cover rounded border border-gray-200"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">{side.name}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span
                            className={`px-1.5 py-0 text-[10px] rounded-full ${
                              layered ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {layered ? `레이어 ${layerCount}` : '단일'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {sides.length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  <p className="text-xs">면을 추가해주세요.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Side Configuration */}
        <div className="space-y-4">
          {currentSide ? (
            <>
              {/* Side Navigation */}
              <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setCurrentSideIndex(Math.max(0, currentSideIndex - 1))}
                    disabled={currentSideIndex === 0}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div className="text-center">
                    <h3 className="font-semibold text-gray-900">{currentSide.name}</h3>
                    <p className="text-sm text-gray-500">
                      {currentSideIndex + 1} / {sides.length}
                    </p>
                  </div>

                  <button
                    onClick={() => setCurrentSideIndex(Math.min(sides.length - 1, currentSideIndex + 1))}
                    disabled={currentSideIndex === sides.length - 1}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Image Preview */}
              <div className="bg-white border border-gray-200/60 rounded-md p-3 shadow-sm">
                <h3 className="text-xs font-medium text-gray-500 mb-2">미리보기</h3>
                {isCurrentSideLayered ? (
                  currentSideLayers.filter(l => l.imageUrl).length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto py-1">
                      {currentSideLayers.filter(l => l.imageUrl).map((layer, idx) => (
                        <div key={idx} className="shrink-0 text-center">
                          <img src={layer.imageUrl} alt={layer.name} className="h-28 object-contain rounded border border-gray-200" />
                          <p className="text-[10px] text-gray-500 mt-1">{layer.name} (z:{layer.zIndex})</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-6 text-gray-300">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                  )
                ) : currentSide.imageUrl ? (
                  <img src={currentSide.imageUrl} alt={currentSide.name} className="h-36 object-contain rounded border border-gray-200 mx-auto" />
                ) : (
                  <div className="flex items-center justify-center py-6 text-gray-300">
                    <ImageIcon className="w-10 h-10" />
                  </div>
                )}
              </div>

              {/* Side Settings */}
              <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleSection('settings')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <h3 className="text-sm font-semibold text-gray-900">면 설정</h3>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openSections.has('settings') ? 'rotate-180' : ''}`} />
                </button>
                {openSections.has('settings') && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">면 종류</label>
                    <select
                      value={currentSide.id}
                      onChange={(e) => {
                        const sideOptions: Record<string, string> = { front: '앞면', back: '뒷면', left: '왼쪽', right: '오른쪽' };
                        const id = e.target.value;
                        const newSides = [...sides];
                        newSides[currentSideIndex] = { ...newSides[currentSideIndex], id, name: sideOptions[id] || id };
                        setSides(newSides);
                      }}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    >
                      {!['front', 'back', 'left', 'right'].includes(currentSide.id) && (
                        <option value={currentSide.id}>{currentSide.name || '면을 선택하세요'}</option>
                      )}
                      <option value="front">앞면</option>
                      <option value="back">뒷면</option>
                      <option value="left">왼쪽</option>
                      <option value="right">오른쪽</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">렌더링 모드</label>
                    <select
                      value={isCurrentSideLayered ? 'layered' : 'single'}
                      onChange={(e) => setSideMode(currentSideIndex, e.target.value as 'single' | 'layered')}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    >
                      <option value="single">단일 이미지</option>
                      <option value="layered">레이어</option>
                    </select>
                  </div>
                  {!isCurrentSideLayered && (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-gray-700">이미지 URL</label>
                      <input
                        type="text"
                        value={currentSide.imageUrl}
                        onChange={(e) => updateSideField(currentSideIndex, 'imageUrl', e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                        placeholder="https://..."
                      />
                      <button
                        onClick={() => triggerFileInput(currentSideIndex)}
                        disabled={uploading}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        이미지 업로드
                      </button>
                      <p className="text-xs text-gray-500">
                        단일 이미지 제품의 색상은 product_colors 테이블에서 관리됩니다.
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => handleRemoveSide(currentSideIndex)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      면 삭제
                    </button>
                  </div>
                </div>
                )}
              </div>

              {/* Real Life Dimensions */}
              <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleSection('dimensions')}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <h3 className="text-sm font-semibold text-gray-900">실제 치수 (mm)</h3>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openSections.has('dimensions') ? 'rotate-180' : ''}`} />
                </button>
                {openSections.has('dimensions') && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">제품 너비</label>
                    <input
                      type="number"
                      value={currentSide.realLifeDimensions?.productWidthMm || 0}
                      onChange={(e) => updateRealLifeDimensions(currentSideIndex, 'productWidthMm', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    />
                  </div>
                </div>
                )}
              </div>

              {/* Layer Configuration */}
              {isCurrentSideLayered && (
                <div className="bg-white border border-gray-200/60 rounded-md shadow-sm overflow-hidden">
                  <button
                    onClick={() => toggleSection('layers')}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <h3 className="text-sm font-semibold text-gray-900">레이어 설정</h3>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openSections.has('layers') ? 'rotate-180' : ''}`} />
                  </button>
                  {openSections.has('layers') && (
                  <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => addLayer(currentSideIndex)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      레이어 추가
                    </button>
                  </div>

                  {currentSideLayers.map((layer, layerIndex) => (
                    <div key={layerIndex} className="border border-gray-200 rounded-md p-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">레이어 ID</label>
                              <input
                                type="text"
                                value={layer.id}
                                onChange={(e) => updateLayerField(currentSideIndex, layerIndex, 'id', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">이름</label>
                              <input
                                type="text"
                                value={layer.name}
                                onChange={(e) => updateLayerField(currentSideIndex, layerIndex, 'name', e.target.value)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Z-Index</label>
                              <input
                                type="number"
                                value={layer.zIndex}
                                onChange={(e) => updateLayerField(currentSideIndex, layerIndex, 'zIndex', parseInt(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              />
                            </div>
                            <div className="flex items-end">
                              <button
                                onClick={() => triggerFileInput(currentSideIndex, layerIndex)}
                                disabled={uploading}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                              >
                                <Upload className="w-3 h-3" />
                                이미지 업로드
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">이미지 URL</label>
                            <input
                              type="text"
                              value={layer.imageUrl}
                              onChange={(e) => updateLayerField(currentSideIndex, layerIndex, 'imageUrl', e.target.value)}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeLayer(currentSideIndex, layerIndex)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Layer Color Options - Manufacturer Selection */}
                      <div className="space-y-3 border-t border-gray-100 pt-3">
                        <p className="text-xs font-medium text-gray-600">컬러 옵션 (제조사 선택)</p>

                        {/* Manufacturer Dropdown for Layer */}
                        <select
                          value={layerManufacturerIds[getLayerKey(currentSideIndex, layerIndex)] || ''}
                          onChange={(e) => handleLayerManufacturerChange(currentSideIndex, layerIndex, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          disabled={manufacturersLoading}
                        >
                          <option value="">-- 제조사 선택 --</option>
                          {manufacturers.map((manufacturer) => (
                            <option key={manufacturer.id} value={manufacturer.id}>
                              {manufacturer.name}
                            </option>
                          ))}
                        </select>

                        {/* Manufacturer Colors for Layer */}
                        {layerManufacturerIds[getLayerKey(currentSideIndex, layerIndex)] && (
                          <div className="space-y-2">
                            {layerColorsLoading[getLayerKey(currentSideIndex, layerIndex)] ? (
                              <p className="text-xs text-gray-500 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                색상 로딩 중...
                              </p>
                            ) : (
                              <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto">
                                {[...(layerManufacturerColors[getLayerKey(currentSideIndex, layerIndex)] || [])].sort((a, b) => a.color_code.localeCompare(b.color_code)).map((mColor) => {
                                  const selected = isLayerColorSelected(currentSideIndex, layerIndex, mColor.hex, mColor.color_code);
                                  return (
                                    <button
                                      key={mColor.id}
                                      onClick={() => handleToggleLayerColor(currentSideIndex, layerIndex, mColor)}
                                      className={`flex items-center gap-1.5 p-1.5 border rounded text-left transition-all ${
                                        selected
                                          ? 'border-blue-500 bg-blue-50'
                                          : 'border-gray-200 hover:border-gray-300'
                                      }`}
                                      title={`${mColor.name} (${mColor.color_code})`}
                                    >
                                      <div className="relative shrink-0">
                                        <div
                                          className="w-4 h-4 rounded border border-gray-300"
                                          style={{ backgroundColor: mColor.hex }}
                                        />
                                        {selected && (
                                          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                                            <Check className="w-2 h-2 text-white" />
                                          </div>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-gray-700 truncate">{mColor.name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Currently Selected Colors for Layer */}
                        <div className="space-y-1">
                          <p className="text-[10px] text-gray-500">선택된 색상 ({layer.colorOptions.length})</p>
                          {layer.colorOptions.length === 0 ? (
                            <p className="text-xs text-gray-400">등록된 컬러 옵션이 없습니다.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {[...layer.colorOptions].sort((a, b) => a.colorCode.localeCompare(b.colorCode)).map((option) => (
                                <div
                                  key={`${layer.id}-color-${option.colorCode}`}
                                  className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-[10px]"
                                >
                                  <div
                                    className="w-3 h-3 rounded border border-gray-300"
                                    style={{ backgroundColor: option.hex }}
                                  />
                                  <span className="text-gray-600">{option.colorCode || option.hex}</span>
                                  <button
                                    onClick={() => {
                                      const originalIndex = layer.colorOptions.findIndex((o) => o.colorCode === option.colorCode && o.hex === option.hex);
                                      if (originalIndex !== -1) removeLayerColorOption(currentSideIndex, layerIndex, originalIndex);
                                    }}
                                    className="p-0.5 text-gray-400 hover:text-red-600 rounded"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Manual Add Option (fallback) */}
                        <button
                          onClick={() => addLayerColorOption(currentSideIndex, layerIndex)}
                          className="text-[10px] text-gray-500 hover:text-blue-600"
                        >
                          + 수동으로 색상 추가
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
              )}
            </>
          ) : (
            <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center">
              <p className="text-gray-500">면을 선택하거나 추가해주세요.</p>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Partner Mall Settings Tab */}
      {activeTab === 'partner-mall' && (
        <div className="max-w-2xl">
          {!product?.id ? (
            <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center shadow-sm">
              <p className="text-gray-500">제품을 먼저 저장해주세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preset list header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">
                  로고 배치 프리셋 {!presetsLoading && `(${presets.length})`}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNewPresetInput(true)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  새 프리셋
                </button>
              </div>

              {/* New preset input */}
              {showNewPresetInput && (
                <div className="bg-white border border-gray-200/60 rounded-md p-3 shadow-sm flex items-center gap-2">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="프리셋 이름 (예: 왼쪽 가슴, 중앙)"
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleCreatePreset(); }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreatePreset()}
                    disabled={savingPreset || !newPresetName.trim()}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingPreset ? <Loader2 className="w-4 h-4 animate-spin" /> : '추가'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNewPresetInput(false); setNewPresetName(''); }}
                    className="p-1.5 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Preset list */}
              {presetsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : presets.length === 0 ? (
                <div className="bg-white border border-gray-200/60 rounded-md p-6 text-center shadow-sm">
                  <p className="text-gray-500 text-sm">프리셋이 없습니다. 새 프리셋을 추가해주세요.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className={`bg-white border rounded-md p-3 shadow-sm cursor-pointer transition-colors ${
                        editingPreset?.id === preset.id
                          ? 'border-blue-400 ring-1 ring-blue-400/30'
                          : 'border-gray-200/60 hover:border-gray-300'
                      }`}
                      onClick={() => setEditingPreset(editingPreset?.id === preset.id ? null : preset)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{preset.name}</span>
                          <span className="ml-2 text-xs text-gray-400">
                            x:{preset.placement.x} y:{preset.placement.y} {preset.placement.width}×{preset.placement.height}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void handleDeletePreset(preset.id); }}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Editing canvas */}
              {editingPreset && (
                <div className="bg-white border border-gray-200/60 rounded-md p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">
                      편집 중: <span className="text-blue-600">{editingPreset.name}</span>
                    </h4>
                  </div>
                  <LogoPlacementPreview
                    key={editingPreset.id}
                    sides={sides}
                    placement={editingPreset.placement}
                    onPlacementChange={(placement) => {
                      void handleUpdatePresetPlacement(editingPreset.id, placement);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* {activeTab === 'print-area' && product && (
        <PrintAreaEditor
          product={product}
          onSave={onSave}
          onCancel={onCancel}
        />
      )} */}

      {activeTab === 'template' && product && (
        <div className="bg-white border border-gray-200 rounded-md shadow-sm p-6">
          <div className="text-center space-y-4">
            <Layers className="w-16 h-16 text-gray-400 mx-auto" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">템플릿 편집기로 이동</h3>
              <p className="text-xs text-gray-500 mb-4">
                템플릿 편집은 전용 에디터에서 진행됩니다.
              </p>
              <button
                onClick={() => router.push(`/editor/${product.id}?mode=template`)}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors text-sm font-medium"
              >
                템플릿 편집기 열기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
}
