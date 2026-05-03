# Admin Canvas Rendering - Quick Reference

## Quick Start

### 1. Fetch Order Item

```typescript
const { data: orderItem } = await supabase
  .from('order_items')
  .select('*')
  .eq('id', orderItemId)
  .single();
```

### 2. Key Data Fields

| Field | Type | Purpose |
|-------|------|---------|
| `canvas_state` | JSONB | Complete Fabric.js state per side |
| `color_selections` | JSONB | Product colors per side |
| `image_urls` | JSONB | User-uploaded image URLs |
| `text_svg_exports` | JSONB | Production SVG files |
| `design_title` | Text | Design name |
| `thumbnail_url` | Text | Preview image |
| `item_options` | JSONB | Size/color variants |

### 3. Render Canvas (Basic)

```typescript
import { fabric } from 'fabric';

// 1. Get canvas state for a side
const sideState = orderItem.canvas_state['front'];

// 2. Create Fabric canvas
const canvas = new fabric.Canvas('canvas-id');

// 3. Load state
canvas.loadFromJSON(sideState, () => {
  canvas.renderAll();
});
```

### 4. Apply Product Color

```typescript
// Get color for side
const color = orderItem.color_selections['front']?.body || '#FFFFFF';

// Apply to product image
fabric.Image.fromURL(productImageUrl, (img) => {
  img.filters = [
    new fabric.Image.filters.BlendColor({
      color: color,
      mode: 'multiply',
      alpha: 0.8
    })
  ];
  img.applyFilters();
  canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
});
```

### 5. Access User Images

```typescript
// Get all images for 'front' side
const frontImages = orderItem.image_urls?.front || [];

frontImages.forEach(img => {
  console.log(`Image URL: ${img.url}`);
  console.log(`Uploaded: ${img.uploadedAt}`);
});
```

### 6. Download Production Files

```typescript
// Get SVG for 'front' side
const svgUrl = orderItem.text_svg_exports?.front;

if (svgUrl) {
  // Download or display SVG
  window.open(svgUrl, '_blank');
}
```

## Data Structure Examples

### canvas_state
```json
{
  "front": {
    "objects": [
      { "type": "i-text", "text": "Hello", ... },
      { "type": "image", "src": "https://...", ... }
    ]
  }
}
```

### color_selections
```json
{
  "front": { "body": "#FFFFFF" },
  "back": { "body": "#000000" }
}
```

### image_urls
```json
{
  "front": [
    {
      "url": "https://storage/.../image.jpg",
      "path": "user-designs/images/123.jpg",
      "uploadedAt": "2025-01-02T12:00:00Z"
    }
  ]
}
```

### item_options
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
    }
  ]
}
```

## Common Queries

### Get all order items for an order
```sql
SELECT * FROM order_items WHERE order_id = 'ORDER-123';
```

### Check if design has images
```sql
SELECT id, design_title,
  jsonb_object_keys(image_urls) as sides_with_images
FROM order_items
WHERE order_id = 'ORDER-123'
  AND image_urls != '{}'::jsonb;
```

### Get production summary
```sql
SELECT
  id,
  design_title,
  quantity,
  item_options->'variants' as variants,
  jsonb_object_keys(text_svg_exports) as sides_with_text
FROM order_items
WHERE order_id = 'ORDER-123';
```

## TypeScript Types

```typescript
import { OrderItem } from '@/types/types';

// Full type definition available in types/types.ts
const orderItem: OrderItem = {
  id: 'uuid',
  order_id: 'ORDER-123',
  product_id: 'uuid',
  product_title: 'T-Shirt',
  quantity: 3,
  price_per_item: 25000,
  design_id: 'uuid',
  design_title: 'My Design',
  canvas_state: { ... },
  color_selections: { ... },
  image_urls: { ... },
  text_svg_exports: { ... },
  item_options: { variants: [...] },
  // ...
};
```

## See Full Documentation

For complete details, see [ADMIN_CANVAS_RENDERING.md](./ADMIN_CANVAS_RENDERING.md)