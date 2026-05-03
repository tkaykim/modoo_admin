# Order File Downloads Guide

## Overview

All files associated with an order item (uploaded images and generated SVGs) are now automatically tracked and can be easily downloaded. This guide shows you how to access and download all files for production purposes.

---

## What Gets Tracked

When an order is created, the system automatically tracks:

### 1. **Uploaded Images** (`order_items.image_urls`)
- All user-uploaded images from the canvas
- Stored with metadata (URL, path, upload timestamp)
- Organized by product side (front, back, etc.)

### 2. **Generated SVGs** (`order_items.text_svg_exports`)
- SVG files containing all text objects
- Generated only at order creation
- One SVG per product side

---

## Database Schema

### `order_items.image_urls` (JSONB)

```json
{
  "front": [
    {
      "url": "https://supabase.co/storage/.../user-designs/images/123.jpg",
      "path": "user-designs/images/123.jpg",
      "uploadedAt": "2025-01-01T12:00:00Z"
    },
    {
      "url": "https://supabase.co/storage/.../user-designs/images/456.png",
      "path": "user-designs/images/456.png",
      "uploadedAt": "2025-01-01T12:05:00Z"
    }
  ],
  "back": [
    {
      "url": "https://supabase.co/storage/.../user-designs/images/789.jpg",
      "path": "user-designs/images/789.jpg",
      "uploadedAt": "2025-01-01T12:10:00Z"
    }
  ]
}
```

### `order_items.text_svg_exports` (JSONB)

```json
{
  "front": "https://supabase.co/storage/.../text-exports/svg/order-abc-front.svg",
  "back": "https://supabase.co/storage/.../text-exports/svg/order-abc-back.svg",
  "__objects": {
    "front": {
      "front-...objectId...": "https://supabase.co/storage/.../text-exports/svg/order-abc-front-front-...objectId....svg"
    }
  }
}
```

Notes:
- Side keys (`front`, `back`, ...) store the **combined** SVG URL per side.
- `__objects` (optional) stores **per-object** SVG URLs: `__objects[sideId][objectId] -> url`.

---

## Usage Examples

### 1. Using the API Endpoint

**GET `/api/orders/[orderId]/files`**

Returns all files for all items in an order:

```typescript
// Fetch all files for an order
const response = await fetch('/api/orders/ORDER-123456/files');
const data = await response.json();

console.log(data);
// {
//   success: true,
//   order: {
//     id: "ORDER-123456",
//     customerName: "John Doe",
//     orderStatus: "pending",
//     createdAt: "2025-01-01T12:00:00Z"
//   },
//   items: [
//     {
//       itemId: "item-abc-123",
//       productTitle: "Custom T-Shirt",
//       quantity: 2,
//       thumbnailUrl: "https://...",
//       files: {
//         images: [
//           { type: "image", side: "front", url: "https://...", path: "..." },
//           { type: "image", side: "back", url: "https://...", path: "..." }
//         ],
//         svgs: [
//           { type: "svg", side: "front", url: "https://..." },
//           { type: "svg", side: "back", url: "https://..." }
//         ],
//         allFiles: [...],
//         count: { images: 2, svgs: 2, total: 4 }
//       }
//     }
//   ],
//   totalFiles: 4
// }
```

### 2. Using the Component

Import and use the `OrderFilesDownload` component:

```tsx
import OrderFilesDownload from '@/app/components/OrderFilesDownload';

function OrderDetailsPage({ orderId }) {
  const [order, setOrder] = useState(null);

  useEffect(() => {
    async function fetchOrder() {
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            id,
            product_title,
            text_svg_exports,
            image_urls
          )
        `)
        .eq('id', orderId)
        .single();

      setOrder(data);
    }

    fetchOrder();
  }, [orderId]);

  return (
    <div>
      <h1>Order {orderId}</h1>

      {order?.order_items.map(item => (
        <OrderFilesDownload key={item.id} orderItem={item} />
      ))}
    </div>
  );
}
```

### 3. Using the Utility Functions

```typescript
import {
  getOrderItemFiles,
  downloadFile,
  downloadAllOrderItemFiles,
  getOrderItemFileCount
} from '@/lib/order-files';

// Get file information
const files = getOrderItemFiles(orderItem);
console.log(files.images);   // Array of images
console.log(files.svgs);      // Array of SVGs
console.log(files.allFiles);  // All files combined

// Get file count
const count = getOrderItemFileCount(orderItem);
console.log(count);  // { images: 2, svgs: 2, total: 4 }

// Download a single file
await downloadFile(
  'https://supabase.co/storage/.../image.jpg',
  'custom-tshirt-front.jpg'
);

// Download all files for an order item
await downloadAllOrderItemFiles(orderItem, 'order-123-item-1');
// Downloads:
// - order-123-item-1-front-image-1.jpg
// - order-123-item-1-back-image-1.png
// - order-123-item-1-front-text.svg
// - order-123-item-1-back-text.svg
```

### 4. Direct Database Query

```typescript
import { createClient } from '@/lib/supabase-client';

const supabase = createClient();

// Get order with all files
const { data: order } = await supabase
  .from('orders')
  .select(`
    id,
    customer_name,
    order_items (
      id,
      product_title,
      text_svg_exports,
      image_urls,
      thumbnail_url
    )
  `)
  .eq('id', orderId)
  .single();

// Access files
order.order_items.forEach(item => {
  // Access images
  if (item.image_urls?.front) {
    item.image_urls.front.forEach(img => {
      console.log('Front image:', img.url);
    });
  }

  // Access SVGs
  if (item.text_svg_exports?.front) {
    console.log('Front SVG:', item.text_svg_exports.front);
  }
});
```

---

## Production Workflows

### Manufacturing Download Flow

```typescript
// 1. Fetch order for production
async function prepareOrderForProduction(orderId: string) {
  const response = await fetch(`/api/orders/${orderId}/files`);
  const { items } = await response.json();

  // 2. Download all files for each item
  for (const item of items) {
    console.log(`Processing: ${item.productTitle}`);

    // Download images for printing
    for (const image of item.files.images) {
      const response = await fetch(image.url);
      const blob = await response.blob();
      // Send to printing system
      await sendToPrinter(blob, item.productTitle, image.side);
    }

    // Download SVGs for text guidance
    for (const svg of item.files.svgs) {
      const response = await fetch(svg.url);
      const svgContent = await response.text();
      // Use for production reference
      await saveProductionGuide(svgContent, item.productTitle, svg.side);
    }
  }
}
```

### Bulk Export Script

```typescript
// Export all files for multiple orders
async function bulkExportOrders(orderIds: string[]) {
  for (const orderId of orderIds) {
    const response = await fetch(`/api/orders/${orderId}/files`);
    const data = await response.json();

    const zipFiles: Array<{ name: string; url: string }> = [];

    // Collect all file URLs
    data.items.forEach((item: any, itemIndex: number) => {
      item.files.images.forEach((img: any, imgIndex: number) => {
        zipFiles.push({
          name: `${orderId}-item${itemIndex}-${img.side}-img${imgIndex}.jpg`,
          url: img.url
        });
      });

      item.files.svgs.forEach((svg: any) => {
        zipFiles.push({
          name: `${orderId}-item${itemIndex}-${svg.side}-text.svg`,
          url: svg.url
        });
      });
    });

    // Create ZIP archive (use a library like JSZip)
    await createZipArchive(zipFiles, `order-${orderId}.zip`);
  }
}
```

---

## Querying Files

### Get Orders with Files

```sql
-- Orders that have files
SELECT
  o.id,
  o.customer_name,
  oi.product_title,
  jsonb_object_keys(oi.text_svg_exports) as svg_sides,
  jsonb_object_keys(oi.image_urls) as image_sides
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
WHERE oi.text_svg_exports != '{}'::jsonb
   OR oi.image_urls != '{}'::jsonb;
```

### Count Files Per Order

```sql
-- File count per order
SELECT
  o.id,
  o.customer_name,
  COUNT(DISTINCT jsonb_object_keys(oi.text_svg_exports)) as svg_count,
  (
    SELECT SUM(jsonb_array_length(value))
    FROM jsonb_each(oi.image_urls)
  ) as image_count
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, o.customer_name, oi.image_urls;
```

### Find Orders Missing Files

```sql
-- Orders with canvas state but no exported files
SELECT
  o.id,
  oi.product_title,
  oi.canvas_state
FROM orders o
JOIN order_items oi ON o.id = oi.order_id
WHERE oi.canvas_state != '{}'::jsonb
  AND (
    oi.text_svg_exports = '{}'::jsonb
    OR oi.image_urls = '{}'::jsonb
  );
```

---

## File Types Reference

### Images
- **Storage**: `user-designs/images/`
- **Format**: JPG, PNG, etc. (as uploaded)
- **When Added**: During design creation in canvas
- **Access**: Direct URL from `image_urls`

### SVGs
- **Storage**: `text-exports/svg/`
- **Format**: SVG (XML)
- **When Generated**: At order creation only
- **Access**: Direct URL from `text_svg_exports`
- **Contents**: All text objects with styling and positioning

---

## File Naming Conventions

### Uploaded Images
```
{timestamp}-{random}.{ext}
Example: 1735718400000-abc123.jpg
```

### Generated SVGs
```
order-{order_item_id}-{side}.svg
Example: order-550e8400-e29b-41d4-a716-446655440000-front.svg
```

### Downloaded Files (via utility)
```
{prefix}-{side}-image-{index}.{ext}
{prefix}-{side}-text.svg

Examples:
- order-123-item-1-front-image-1.jpg
- order-123-item-1-back-text.svg
```

---

## Component Props

### `OrderFilesDownload`

```tsx
interface OrderFilesDownloadProps {
  orderItem: {
    id: string;
    product_title: string;
    text_svg_exports?: Record<string, unknown>;
    image_urls?: Record<string, Array<{
      url: string;
      path?: string;
      uploadedAt?: string;
    }>>;
  };
}
```

**Features**:
- Displays all images and SVGs
- Shows thumbnails for images
- Individual file download buttons
- "Download All" button for batch download
- Shows file count

---

## Troubleshooting

### No files found for order item

**Check**:
1. Does the order item have `canvas_state`?
2. Were images uploaded during design?
3. Was text added to the canvas?
4. Check database: `SELECT text_svg_exports, image_urls FROM order_items WHERE id = '...'`

### Files not downloading

**Check**:
1. Are the URLs accessible (try opening in browser)?
2. Check CORS settings on Supabase Storage
3. Verify buckets are public
4. Check browser console for errors

### Missing images in `image_urls`

**Possible Causes**:
- Images added before the image tracking was implemented
- Images loaded from external URLs (not uploaded to Supabase)
- Canvas objects missing `supabaseUrl` in their `data` property

---

## Summary

✅ **Uploaded images** are tracked in `order_items.image_urls`
✅ **Generated SVGs** are stored in `order_items.text_svg_exports`
✅ **API endpoint** `/api/orders/[orderId]/files` for easy access
✅ **Utility functions** in `lib/order-files.ts` for downloads
✅ **React component** `OrderFilesDownload` for UI
✅ **All files** linked to order items automatically at order creation

Now you can easily download all files for any order item! 🎉
