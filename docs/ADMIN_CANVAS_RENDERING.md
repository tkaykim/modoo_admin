# Admin Canvas Rendering Guide

## Overview

This document provides a comprehensive guide for the admin domain to extract canvas information from the `order_items` table and render customized product designs. The `order_items` table contains all necessary attributes from `saved_designs`, allowing the admin domain to function independently without querying the `saved_designs` table.

---

## Table of Contents

1. [Order Items Table Structure](#order-items-table-structure)
2. [Available Data Attributes](#available-data-attributes)
3. [Step-by-Step Rendering Guide](#step-by-step-rendering-guide)
4. [Code Examples](#code-examples)
5. [Handling Edge Cases](#handling-edge-cases)
6. [Best Practices](#best-practices)

---

## Order Items Table Structure

### Database Schema

```sql
order_items (
  id                  uuid PRIMARY KEY,
  order_id            text NOT NULL,
  product_id          uuid NOT NULL,
  product_title       text NOT NULL,
  quantity            integer NOT NULL,
  price_per_item      numeric NOT NULL,
  design_id           uuid NULL,
  design_title        text NULL,
  product_variant_id  uuid NULL,
  canvas_state        jsonb NOT NULL DEFAULT '{}',
  color_selections    jsonb NOT NULL DEFAULT '{}',
  item_options        jsonb NOT NULL DEFAULT '{}',
  thumbnail_url       text NULL,
  text_svg_exports    jsonb NULL DEFAULT '{}',
  image_urls          jsonb NULL DEFAULT '{}',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
)
```

### TypeScript Interface

```typescript
interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_title: string;
  quantity: number;
  price_per_item: number;
  design_id: string | null;
  design_title: string | null;
  product_variant_id: string | null;
  canvas_state: Record<string, unknown>;
  color_selections: Record<string, unknown>;
  item_options: {
    variants: Array<{
      size_id: string;
      size_name: string;
      color_id: string;
      color_name: string;
      color_hex: string;
      quantity: number;
    }>;
  };
  thumbnail_url: string | null;
  text_svg_exports: Record<string, string> | null;
  image_urls: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
```

---

## Available Data Attributes

### 1. `canvas_state` (JSONB)

**Purpose**: Complete Fabric.js canvas state for rendering all design elements.

**Structure**:
```json
{
  "front": {
    "version": "6.9.1",
    "objects": [
      {
        "type": "i-text",
        "text": "Custom Text",
        "left": 150,
        "top": 200,
        "fill": "#000000",
        "fontFamily": "Arial",
        "fontSize": 24,
        "data": {
          "objectId": "front-1234567890-abc",
          "printMethod": "embroidery"
        }
      },
      {
        "type": "image",
        "src": "https://...",
        "left": 100,
        "top": 100,
        "width": 200,
        "height": 200,
        "data": {
          "objectId": "front-9876543210-xyz"
        }
      }
    ]
  },
  "back": {
    "version": "6.9.1",
    "objects": [...]
  }
}
```

**Key Points**:
- Each key represents a product side (e.g., "front", "back", "sleeve_left", "sleeve_right")
- Contains all canvas objects with their properties (position, size, colors, fonts, etc.)
- Excludes system objects (background images, guides) via `excludeFromExport: true`
- Each object has a `data.objectId` for unique identification
- Text and shape objects may have `data.printMethod` ("embroidery" or "printing")

---

### 2. `color_selections` (JSONB)

**Purpose**: Product color choices per side and part.

**Structure**:
```json
{
  "front": {
    "body": "#FFFFFF",
    "sleeves": "#000000"
  },
  "back": {
    "body": "#FFFFFF"
  }
}
```

**Key Points**:
- Maps product sides to color hex codes
- Used to apply product mockup colors during rendering
- May have multiple parts per side (e.g., body, sleeves) for multi-layer products

---

### 3. `image_urls` (JSONB)

**Purpose**: Metadata for user-uploaded images used in the design.

**Structure**:
```json
{
  "front": [
    {
      "url": "https://supabase.co/storage/v1/object/public/user-designs/images/123.jpg",
      "path": "user-designs/images/123.jpg",
      "uploadedAt": "2025-01-02T12:00:00Z"
    }
  ],
  "back": [
    {
      "url": "https://supabase.co/storage/v1/object/public/user-designs/images/456.png",
      "path": "user-designs/images/456.png",
      "uploadedAt": "2025-01-02T12:05:00Z"
    }
  ]
}
```

**Key Points**:
- Each key is a side ID
- Array of image metadata objects per side
- `url`: Direct accessible URL for the image
- `path`: Supabase storage path (for reference)
- `uploadedAt`: ISO timestamp of when the image was uploaded

---

### 4. `text_svg_exports` (JSONB)

**Purpose**: SVG file URLs for text objects, generated at order creation for production.

**Structure**:
```json
{
  "front": "https://supabase.co/storage/v1/object/public/order-svgs/text-front-uuid.svg",
  "back": "https://supabase.co/storage/v1/object/public/order-svgs/text-back-uuid.svg"
}
```

**Key Points**:
- Each key corresponds to a product side
- Contains merged SVG of all text objects from that side
- Useful for production reference and high-quality text rendering
- Generated during order creation (not at design save)

---

### 5. `design_title` (Text)

**Purpose**: Human-readable name of the design for identification.

**Example**: `"My Awesome T-Shirt Design"` or `"Company Logo Hoodie"`

**Key Points**:
- Helps admins identify what the customer intended
- Displayed in order management UI
- May be null for designs created without a custom title

---

### 6. `thumbnail_url` (Text)

**Purpose**: Preview image of the complete design.

**Example**: `"https://supabase.co/storage/v1/object/public/designs/preview-123.png"`

**Key Points**:
- Quick visual reference for admins
- May be null if no preview was generated
- Fallback: Generate from `canvas_state` if needed

---

### 7. `item_options` (JSONB)

**Purpose**: Product variant details (sizes, colors, quantities).

**Structure**:
```json
{
  "variants": [
    {
      "size_id": "m",
      "size_name": "M",
      "color_id": "white",
      "color_name": "화이트",
      "color_hex": "#FFFFFF",
      "quantity": 2
    },
    {
      "size_id": "l",
      "size_name": "L",
      "color_id": "white",
      "color_name": "화이트",
      "color_hex": "#FFFFFF",
      "quantity": 1
    }
  ]
}
```

**Key Points**:
- List of all size/color variants ordered
- Total `quantity` in order_item matches sum of all variant quantities
- Used for production fulfillment

---

## Step-by-Step Rendering Guide

### Step 1: Fetch Order Item Data

```typescript
import { createClient } from '@/lib/supabase';

async function getOrderItem(orderItemId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('id', orderItemId)
    .single();

  if (error) {
    console.error('Error fetching order item:', error);
    throw error;
  }

  return data;
}
```

### Step 2: Fetch Product Configuration

You'll need the product configuration to get print areas and product mockup images.

```typescript
async function getProductConfig(productId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('products')
    .select('id, title, configuration')
    .eq('id', productId)
    .single();

  if (error) {
    console.error('Error fetching product:', error);
    throw error;
  }

  return data;
}
```

### Step 3: Initialize Canvas per Side

For each side in the product configuration, create a Fabric.js canvas instance.

```typescript
import { fabric } from 'fabric';

function initializeCanvas(
  canvasElement: HTMLCanvasElement,
  productSide: ProductSide
): fabric.Canvas {
  const canvas = new fabric.Canvas(canvasElement, {
    width: 800, // Adjust based on your UI
    height: 1000,
    backgroundColor: '#f0f0f0',
  });

  return canvas;
}
```

### Step 4: Load Product Mockup Image

Apply the product background image with the selected color.

```typescript
async function loadProductMockup(
  canvas: fabric.Canvas,
  productSide: ProductSide,
  colorHex: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(
      productSide.imageUrl,
      (img) => {
        if (!img) {
          reject(new Error('Failed to load product image'));
          return;
        }

        // Apply color filter if needed
        if (colorHex && colorHex !== '#FFFFFF') {
          img.filters = [
            new fabric.Image.filters.BlendColor({
              color: colorHex,
              mode: 'multiply',
              alpha: 0.8
            })
          ];
          img.applyFilters();
        }

        // Set as background
        img.set({
          selectable: false,
          evented: false,
          excludeFromExport: true,
        });

        canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
        resolve();
      },
      { crossOrigin: 'anonymous' }
    );
  });
}
```

### Step 5: Load Canvas State

Deserialize the saved canvas state for each side.

```typescript
async function loadCanvasState(
  canvas: fabric.Canvas,
  sideId: string,
  canvasStateMap: Record<string, any>
): Promise<void> {
  const sideState = canvasStateMap[sideId];

  if (!sideState || !sideState.objects) {
    console.log(`No canvas state for side: ${sideId}`);
    return;
  }

  return new Promise((resolve, reject) => {
    canvas.loadFromJSON(sideState, () => {
      // Make all objects non-interactive in admin view
      canvas.getObjects().forEach((obj) => {
        obj.set({
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
        });
      });

      canvas.renderAll();
      resolve();
    }, (o: any, object: fabric.Object) => {
      // Custom object reviver if needed
      console.log('Loaded object:', object.type);
    });
  });
}
```

### Step 6: Apply Print Area Clipping (Optional)

If you want to show only the printable area:

```typescript
function applyPrintAreaClipping(
  canvas: fabric.Canvas,
  printArea: { x: number; y: number; width: number; height: number }
): void {
  const clipPath = new fabric.Rect({
    left: printArea.x,
    top: printArea.y,
    width: printArea.width,
    height: printArea.height,
    absolutePositioned: true,
    fill: 'transparent',
    stroke: 'red',
    strokeWidth: 2,
    strokeDashArray: [5, 5],
    selectable: false,
    evented: false,
  });

  canvas.clipPath = clipPath;
  canvas.renderAll();
}
```

### Step 7: Complete Rendering Function

Put it all together:

```typescript
async function renderOrderItemCanvas(
  orderItemId: string,
  containerElement: HTMLElement
): Promise<void> {
  try {
    // 1. Fetch order item data
    const orderItem = await getOrderItem(orderItemId);

    // 2. Fetch product configuration
    const product = await getProductConfig(orderItem.product_id);

    // 3. Get canvas state and color selections
    const canvasStateMap = orderItem.canvas_state as Record<string, any>;
    const colorSelections = orderItem.color_selections as Record<string, any>;

    // 4. Render each side
    for (const side of product.configuration) {
      // Create canvas element
      const canvasElement = document.createElement('canvas');
      canvasElement.id = `canvas-${side.id}`;
      containerElement.appendChild(canvasElement);

      // Initialize Fabric canvas
      const fabricCanvas = initializeCanvas(canvasElement, side);

      // Get color for this side (default to white if not specified)
      const sideColor = colorSelections[side.id]?.body || '#FFFFFF';

      // Load product mockup with color
      await loadProductMockup(fabricCanvas, side, sideColor);

      // Load canvas objects
      await loadCanvasState(fabricCanvas, side.id, canvasStateMap);

      // Optional: Apply print area clipping
      if (side.printArea) {
        applyPrintAreaClipping(fabricCanvas, side.printArea);
      }

      console.log(`Rendered side: ${side.name}`);
    }

    console.log('All sides rendered successfully');
  } catch (error) {
    console.error('Error rendering order item canvas:', error);
    throw error;
  }
}
```

---

## Code Examples

### Example 1: Fetching Order Items for an Order

```typescript
async function getOrderItemsForOrder(orderId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return data;
}
```

### Example 2: Displaying Order Item Summary

```tsx
function OrderItemSummary({ orderItem }: { orderItem: OrderItem }) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-4">
        {/* Thumbnail */}
        {orderItem.thumbnail_url && (
          <img
            src={orderItem.thumbnail_url}
            alt={orderItem.design_title || orderItem.product_title}
            className="w-20 h-20 object-cover rounded"
          />
        )}

        {/* Details */}
        <div className="flex-1">
          <h3 className="font-semibold">
            {orderItem.design_title || orderItem.product_title}
          </h3>
          <p className="text-sm text-gray-600">
            Product: {orderItem.product_title}
          </p>
          <p className="text-sm text-gray-600">
            Quantity: {orderItem.quantity}
          </p>

          {/* Variants */}
          <div className="mt-2 space-y-1">
            {orderItem.item_options.variants.map((variant, idx) => (
              <div key={idx} className="text-xs text-gray-500">
                {variant.color_name} / {variant.size_name} - {variant.quantity}개
              </div>
            ))}
          </div>
        </div>

        {/* Price */}
        <div className="text-right">
          <p className="font-bold">
            {(orderItem.price_per_item * orderItem.quantity).toLocaleString()}원
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Example 3: Extracting Text Objects for Production

```typescript
function extractTextObjects(canvasState: Record<string, any>) {
  const textObjectsBySide: Record<string, Array<{
    text: string;
    fontFamily: string;
    fontSize: number;
    fill: string;
    printMethod?: string;
  }>> = {};

  for (const [sideId, state] of Object.entries(canvasState)) {
    if (!state.objects) continue;

    textObjectsBySide[sideId] = state.objects
      .filter((obj: any) => obj.type === 'i-text' || obj.type === 'text')
      .map((obj: any) => ({
        text: obj.text,
        fontFamily: obj.fontFamily,
        fontSize: obj.fontSize,
        fill: obj.fill,
        printMethod: obj.data?.printMethod,
      }));
  }

  return textObjectsBySide;
}

// Usage
const orderItem = await getOrderItem('some-uuid');
const textObjects = extractTextObjects(orderItem.canvas_state);
console.log('Text objects for production:', textObjects);
```

### Example 4: Checking for Images in Design

```typescript
function hasUserImages(orderItem: OrderItem): boolean {
  const imageUrls = orderItem.image_urls;

  if (!imageUrls) return false;

  // Check if any side has images
  for (const images of Object.values(imageUrls)) {
    if (Array.isArray(images) && images.length > 0) {
      return true;
    }
  }

  return false;
}

// Usage
if (hasUserImages(orderItem)) {
  console.log('This order contains user-uploaded images');
  // Download images for production
  const imageUrls = orderItem.image_urls;
  // Process images...
}
```

### Example 5: Admin Order Details Component

```tsx
'use client';

import { useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { OrderItem } from '@/types/types';

export default function AdminOrderItemViewer({
  orderItemId
}: {
  orderItemId: string
}) {
  const [orderItem, setOrderItem] = useState<OrderItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrderItem() {
      try {
        setLoading(true);
        const data = await getOrderItem(orderItemId);
        setOrderItem(data);

        // Render canvas after component mounts
        if (data) {
          await renderOrderItemCanvas(orderItemId,
            document.getElementById('canvas-container')!
          );
        }
      } catch (error) {
        console.error('Failed to load order item:', error);
      } finally {
        setLoading(false);
      }
    }

    loadOrderItem();
  }, [orderItemId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!orderItem) {
    return <div>Order item not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-white rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold mb-4">
          {orderItem.design_title || orderItem.product_title}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Product</p>
            <p className="font-medium">{orderItem.product_title}</p>
          </div>

          <div>
            <p className="text-sm text-gray-600">Total Quantity</p>
            <p className="font-medium">{orderItem.quantity}</p>
          </div>

          <div>
            <p className="text-sm text-gray-600">Price per Item</p>
            <p className="font-medium">
              {orderItem.price_per_item.toLocaleString()}원
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-600">Total Price</p>
            <p className="font-medium">
              {(orderItem.price_per_item * orderItem.quantity).toLocaleString()}원
            </p>
          </div>
        </div>

        {/* Variants */}
        <div className="mt-4">
          <p className="text-sm text-gray-600 mb-2">Variants</p>
          <div className="space-y-2">
            {orderItem.item_options.variants.map((variant, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-gray-50 p-2 rounded"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border"
                    style={{ backgroundColor: variant.color_hex }}
                  />
                  <span>{variant.color_name} / {variant.size_name}</span>
                </div>
                <span className="font-medium">×{variant.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Canvas Viewer */}
      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="text-lg font-bold mb-4">Design Preview</h3>
        <div id="canvas-container" className="space-y-4">
          {/* Canvases will be inserted here */}
        </div>
      </div>

      {/* Production Files */}
      {orderItem.text_svg_exports &&
        Object.keys(orderItem.text_svg_exports).length > 0 && (
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-lg font-bold mb-4">Production Files</h3>
          <div className="space-y-2">
            {Object.entries(orderItem.text_svg_exports).map(([side, url]) => (
              <a
                key={side}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 bg-blue-50 rounded hover:bg-blue-100 transition"
              >
                <span className="font-medium">{side}</span> - Text SVG Export
              </a>
            ))}
          </div>
        </div>
      )}

      {/* User Images */}
      {hasUserImages(orderItem) && (
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-lg font-bold mb-4">User Images</h3>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(orderItem.image_urls || {}).map(([side, images]) => (
              <div key={side}>
                <p className="font-medium mb-2 capitalize">{side}</p>
                {Array.isArray(images) && images.map((img: any, idx: number) => (
                  <a
                    key={idx}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mb-2"
                  >
                    <img
                      src={img.url}
                      alt={`${side} image ${idx + 1}`}
                      className="w-full rounded border"
                    />
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Handling Edge Cases

### Case 1: Missing Canvas State

```typescript
function hasCanvasContent(orderItem: OrderItem): boolean {
  const canvasState = orderItem.canvas_state;

  if (!canvasState || Object.keys(canvasState).length === 0) {
    return false;
  }

  // Check if any side has objects
  for (const state of Object.values(canvasState)) {
    if (state && typeof state === 'object' && 'objects' in state) {
      const objects = (state as any).objects;
      if (Array.isArray(objects) && objects.length > 0) {
        return true;
      }
    }
  }

  return false;
}

// Usage
if (!hasCanvasContent(orderItem)) {
  console.log('No custom design - standard product order');
  // Display product without customization
}
```

### Case 2: Null or Missing Design Title

```typescript
function getDisplayTitle(orderItem: OrderItem): string {
  return orderItem.design_title ||
         orderItem.product_title ||
         'Untitled Design';
}
```

### Case 3: Handling Font Loading

```typescript
async function loadRequiredFonts(canvasState: Record<string, any>): Promise<void> {
  const fontsToLoad = new Set<string>();

  // Extract all unique fonts from canvas state
  for (const state of Object.values(canvasState)) {
    if (!state || !state.objects) continue;

    state.objects.forEach((obj: any) => {
      if ((obj.type === 'i-text' || obj.type === 'text') && obj.fontFamily) {
        fontsToLoad.add(obj.fontFamily);
      }
    });
  }

  // Load fonts using Web Font Loader or similar
  if (fontsToLoad.size > 0) {
    await Promise.all(
      Array.from(fontsToLoad).map(font => loadFont(font))
    );
  }
}

async function loadFont(fontFamily: string): Promise<void> {
  // Implementation depends on your font loading strategy
  // Example using Google Fonts
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily}`;
    link.rel = 'stylesheet';
    link.onload = () => resolve();
    document.head.appendChild(link);
  });
}
```

### Case 4: Image Loading Errors

```typescript
async function loadCanvasStateWithErrorHandling(
  canvas: fabric.Canvas,
  sideId: string,
  canvasStateMap: Record<string, any>
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  const sideState = canvasStateMap[sideId];

  if (!sideState || !sideState.objects) {
    return { success: true, errors: [] };
  }

  return new Promise((resolve) => {
    canvas.loadFromJSON(sideState, () => {
      canvas.renderAll();
      resolve({ success: true, errors });
    }, (o: any, object: fabric.Object, error?: Error) => {
      if (error) {
        errors.push(`Failed to load object: ${error.message}`);
        console.error('Object load error:', error);
      }
    });
  });
}
```

---

## Best Practices

### 1. Performance Optimization

**Cache Product Configurations**
```typescript
const productConfigCache = new Map<string, Product>();

async function getProductConfigCached(productId: string) {
  if (productConfigCache.has(productId)) {
    return productConfigCache.get(productId)!;
  }

  const config = await getProductConfig(productId);
  productConfigCache.set(productId, config);
  return config;
}
```

**Lazy Load Canvases**
```typescript
// Only render canvases when they come into viewport
import { useInView } from 'react-intersection-observer';

function LazyCanvas({ orderItemId }: { orderItemId: string }) {
  const { ref, inView } = useInView({ triggerOnce: true });

  useEffect(() => {
    if (inView) {
      renderOrderItemCanvas(orderItemId, ref.current);
    }
  }, [inView, orderItemId]);

  return <div ref={ref} className="min-h-[400px]" />;
}
```

### 2. Error Handling

Always wrap canvas operations in try-catch blocks and provide fallbacks:

```typescript
async function safeRenderCanvas(orderItemId: string) {
  try {
    await renderOrderItemCanvas(orderItemId, container);
  } catch (error) {
    console.error('Canvas rendering failed:', error);

    // Fallback: Show thumbnail if available
    const orderItem = await getOrderItem(orderItemId);
    if (orderItem.thumbnail_url) {
      showThumbnailFallback(orderItem.thumbnail_url);
    } else {
      showErrorMessage('Unable to render design preview');
    }
  }
}
```

### 3. Data Validation

Validate data before rendering:

```typescript
function validateOrderItem(orderItem: OrderItem): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!orderItem.product_id) {
    issues.push('Missing product_id');
  }

  if (!orderItem.canvas_state || Object.keys(orderItem.canvas_state).length === 0) {
    issues.push('Empty canvas_state');
  }

  if (!orderItem.item_options?.variants?.length) {
    issues.push('No variants specified');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
```

### 4. Responsive Canvas Sizing

```typescript
function calculateCanvasSize(
  containerWidth: number,
  productSide: ProductSide
): { width: number; height: number } {
  const aspectRatio = productSide.printArea
    ? productSide.printArea.height / productSide.printArea.width
    : 1.25;

  const width = Math.min(containerWidth, 800);
  const height = width * aspectRatio;

  return { width, height };
}
```

### 5. Memory Management

```typescript
// Dispose canvases when component unmounts
useEffect(() => {
  const canvases: fabric.Canvas[] = [];

  // Render canvases...
  // Store references in canvases array

  return () => {
    // Cleanup
    canvases.forEach(canvas => {
      canvas.dispose();
    });
  };
}, []);
```

### 6. Production File Downloads

```typescript
async function downloadProductionFiles(orderItem: OrderItem) {
  const files: { name: string; url: string }[] = [];

  // Add SVG exports
  if (orderItem.text_svg_exports) {
    Object.entries(orderItem.text_svg_exports).forEach(([side, url]) => {
      files.push({
        name: `text-${side}-${orderItem.id}.svg`,
        url: url
      });
    });
  }

  // Add user images
  if (orderItem.image_urls) {
    Object.entries(orderItem.image_urls).forEach(([side, images]) => {
      if (Array.isArray(images)) {
        images.forEach((img: any, idx: number) => {
          files.push({
            name: `image-${side}-${idx + 1}-${orderItem.id}.${getExtension(img.url)}`,
            url: img.url
          });
        });
      }
    });
  }

  // Download all files
  for (const file of files) {
    await downloadFile(file.url, file.name);
  }
}

async function downloadFile(url: string, filename: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
```

---

## Summary

The `order_items` table contains all necessary data for the admin domain to:

✅ **Render complete canvas designs** using `canvas_state`
✅ **Apply product colors** using `color_selections`
✅ **Access user images** via `image_urls`
✅ **Download production files** from `text_svg_exports`
✅ **Identify designs** with `design_title`
✅ **View previews** using `thumbnail_url`
✅ **Track variants** through `item_options`

The admin domain operates **completely independently** without needing to query the `saved_designs` table, ensuring data isolation and simplifying the architecture.
