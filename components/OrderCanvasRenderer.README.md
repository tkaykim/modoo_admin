# OrderCanvasRenderer Component

A standalone, self-contained React component that renders Fabric.js canvas states from order items with exact dimensions and placements matching the user's original design.

## Features

✅ **Pixel-Perfect Rendering** - Exact dimensions and placements as the user sees
✅ **Self-Contained** - No external component dependencies
✅ **Portable** - Can be extracted and used in any codebase with the same database
✅ **Multi-Side Support** - Renders all product sides (front, back, sleeves, etc.)
✅ **Flexible Layouts** - Grid, horizontal, or vertical display options
✅ **Product Color Support** - Applies correct product color filters
✅ **Read-Only Mode** - Non-interactive canvas perfect for order previews
✅ **TypeScript** - Full type safety included

---

## Installation

### 1. Install Dependencies

```bash
npm install fabric @supabase/supabase-js
```

### 2. Environment Variables

Add to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Copy Component

Copy `OrderCanvasRenderer.tsx` to your project (e.g., `components/` or `app/components/`)

---

## Database Requirements

The component requires the following Supabase database structure:

### `order_items` Table

```sql
CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL,
  product_id UUID NOT NULL,
  product_title TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_per_item DECIMAL NOT NULL,
  canvas_state JSONB NOT NULL,  -- Canvas state per side: {"front": "{...}", "back": "{...}"}
  item_options JSONB,           -- {"size_id": "...", "color_hex": "#FFFFFF", ...}
  thumbnail_url TEXT
);
```

### `products` Table

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  configuration JSONB NOT NULL  -- Array of ProductSide objects
);
```

### `configuration` Column Structure

The `configuration` column should contain an array of `ProductSide` objects:

```json
[
  {
    "id": "front",
    "name": "Front",
    "imageUrl": "https://storage.supabase.co/...",
    "printArea": {
      "x": 100,
      "y": 150,
      "width": 300,
      "height": 400
    },
    "realLifeDimensions": {
      "printAreaWidthMm": 250,
      "printAreaHeightMm": 350,
      "productWidthMm": 500
    },
    "zoomScale": 1.0
  },
  {
    "id": "back",
    "name": "Back",
    "imageUrl": "https://storage.supabase.co/...",
    "printArea": {
      "x": 100,
      "y": 150,
      "width": 300,
      "height": 400
    }
  }
]
```

### `canvas_state` Column Structure

The `canvas_state` column should be a JSON object with side IDs as keys:

```json
{
  "front": "{\"version\":\"6.9.1\",\"objects\":[{\"type\":\"text\",\"text\":\"Hello\",\"left\":100,\"top\":200,...}]}",
  "back": "{\"version\":\"6.9.1\",\"objects\":[...]}"
}
```

---

## Usage Examples

### Basic Usage - By Order ID

Renders all items in an order:

```tsx
import OrderCanvasRenderer from '@/components/OrderCanvasRenderer';

export default function OrderPage() {
  return <OrderCanvasRenderer orderId="550e8400-e29b-41d4-a716-446655440000" />;
}
```

### Single Item - By Order Item ID

Renders a specific order item:

```tsx
<OrderCanvasRenderer orderItemId="123e4567-e89b-12d3-a456-426614174000" />
```

### With Pre-Fetched Data

If you already have the order items data:

```tsx
const orderItems = await fetchOrderItems();

<OrderCanvasRenderer orderItems={orderItems} />
```

### Custom Layout & Size

```tsx
<OrderCanvasRenderer
  orderId="order-123"
  layout="horizontal"
  canvasWidth={600}
  canvasHeight={600}
  showItemInfo={true}
/>
```

### Grid Layout (Default)

```tsx
<OrderCanvasRenderer
  orderId="order-123"
  layout="grid"  // Responsive grid: 1 col mobile, 2 cols tablet, 3 cols desktop
/>
```

### Horizontal Scroll Layout

```tsx
<OrderCanvasRenderer
  orderId="order-123"
  layout="horizontal"  // Side-by-side scrollable
/>
```

### Vertical Stack Layout

```tsx
<OrderCanvasRenderer
  orderId="order-123"
  layout="vertical"  // Stacked vertically
/>
```

### Without Item Info

Hide product details and show only canvases:

```tsx
<OrderCanvasRenderer
  orderId="order-123"
  showItemInfo={false}
/>
```

---

## Props

### `OrderCanvasRenderer` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `orderId` | `string` | - | Order ID to fetch all items for |
| `orderItemId` | `string` | - | Single order item ID to fetch |
| `orderItems` | `OrderItem[]` | - | Pre-fetched order items array |
| `canvasWidth` | `number` | `500` | Width of each canvas in pixels |
| `canvasHeight` | `number` | `500` | Height of each canvas in pixels |
| `layout` | `'grid' \| 'horizontal' \| 'vertical'` | `'grid'` | Display layout |
| `showItemInfo` | `boolean` | `true` | Show product title, size, color, etc. |

**Note:** You must provide either `orderId`, `orderItemId`, or `orderItems`.

### `SingleCanvasRenderer` Props

For rendering individual canvases directly:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `side` | `ProductSide` | **required** | Product side configuration |
| `canvasState` | `string` | **required** | JSON string of canvas state |
| `productColor` | `string` | `'#FFFFFF'` | Hex color for product tint |
| `width` | `number` | `500` | Canvas width in pixels |
| `height` | `number` | `500` | Canvas height in pixels |

---

## TypeScript Types

```typescript
interface ProductSide {
  id: string;
  name: string;
  imageUrl: string;
  printArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  realLifeDimensions?: {
    printAreaWidthMm: number;
    printAreaHeightMm: number;
    productWidthMm: number;
  };
  zoomScale?: number;
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_title: string;
  quantity: number;
  price_per_item: number;
  canvas_state: Record<string, string>;
  item_options?: {
    size_id?: string;
    size_name?: string;
    color_id?: string;
    color_name?: string;
    color_hex?: string;
  };
  thumbnail_url?: string | null;
}

interface Product {
  id: string;
  title: string;
  configuration: ProductSide[];
}
```

---

## Advanced Usage

### Fetching and Displaying Order Items

```tsx
'use client';

import { useEffect, useState } from 'react';
import OrderCanvasRenderer from '@/components/OrderCanvasRenderer';
import { createClient } from '@supabase/supabase-js';

export default function OrderDetailsPage({ orderId }: { orderId: string }) {
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchItems() {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      setOrderItems(data || []);
      setLoading(false);
    }

    fetchItems();
  }, [orderId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Order #{orderId}</h1>
      <OrderCanvasRenderer orderItems={orderItems} />
    </div>
  );
}
```

### Custom Styling

The component uses Tailwind CSS classes. You can customize by:

1. **Wrapping with your own styles:**

```tsx
<div className="my-custom-wrapper">
  <OrderCanvasRenderer orderId="order-123" />
</div>
```

2. **Modifying the component directly** (since it's self-contained)

---

## How It Works

### Canvas Rendering Process

1. **Fetch Data**: Retrieves order items and product configurations from Supabase
2. **Initialize Canvas**: Creates Fabric.js canvas instances for each product side
3. **Load Background**: Loads product mockup images with correct scaling
4. **Apply Color**: Applies product color using Fabric.js blend filters
5. **Position Print Area**: Calculates exact print area position relative to product image
6. **Load Objects**: Deserializes and renders saved canvas objects (text, images, shapes)
7. **Apply Clipping**: Ensures objects stay within print area boundaries
8. **Render**: Final render in read-only mode

### Dimension Calculations

The component maintains exact dimensions by:

- Using the same Fabric.js version (6.9.1)
- Applying identical scaling calculations
- Positioning print areas relative to product images
- Preserving object transforms and positions
- Respecting `zoomScale` configuration

---

## Troubleshooting

### Canvas Not Rendering

**Problem**: Blank or error state
**Solution**:
- Check that `canvas_state` is valid JSON
- Verify product `configuration` exists
- Ensure product images are accessible (check CORS)
- Check browser console for errors

### Incorrect Dimensions

**Problem**: Objects appear in wrong positions
**Solution**:
- Verify `printArea` coordinates in product configuration
- Check that `zoomScale` matches the original canvas
- Ensure canvas width/height props match original

### Missing Sides

**Problem**: Some product sides don't display
**Solution**:
- Check that `canvas_state` has entries for all sides
- Verify each side has a valid canvas state string
- Empty sides are intentionally skipped

### Color Not Applied

**Problem**: Product color is white/default
**Solution**:
- Check `item_options.color_hex` is set
- Verify color format is valid hex (e.g., `#FF0000`)
- Product image must support color blending

---

## Use Cases

### Order Confirmation Emails

Render order designs in email previews:

```tsx
<OrderCanvasRenderer
  orderId={orderId}
  canvasWidth={300}
  canvasHeight={300}
  showItemInfo={true}
  layout="vertical"
/>
```

### Admin Dashboard

Display all orders in a grid:

```tsx
<OrderCanvasRenderer
  orderItems={allOrders}
  layout="grid"
  canvasWidth={200}
  canvasHeight={200}
  showItemInfo={false}
/>
```

### Print Queue

Export canvases for production:

```tsx
const canvasRef = useRef<fabric.Canvas>();

// Access canvas via SingleCanvasRenderer
<SingleCanvasRenderer
  side={side}
  canvasState={state}
  onCanvasReady={(canvas) => {
    canvasRef.current = canvas;
    // Export: canvas.toDataURL() or canvas.toSVG()
  }}
/>
```

### Order History

Customer order history with thumbnails:

```tsx
<OrderCanvasRenderer
  orderItems={userOrders}
  layout="horizontal"
  canvasWidth={250}
  canvasHeight={250}
/>
```

---

## Exporting to Another Codebase

To use this component in a different project:

1. **Copy the file**: `OrderCanvasRenderer.tsx`
2. **Install dependencies**: `fabric` and `@supabase/supabase-js`
3. **Update Supabase credentials** in the `createSupabaseClient()` function
4. **Ensure database schema matches** (see Database Requirements)
5. **Import and use** as shown in examples

The component has ZERO external dependencies on other components, so it works out of the box.

---

## Performance

- **Lazy Loading**: Only renders visible items
- **Efficient Rendering**: Uses Fabric.js's optimized canvas engine
- **Image Caching**: Product images cached by browser
- **No Re-renders**: Canvas instances are stable

### Optimization Tips

For large orders (50+ items):

```tsx
// Use pagination
<OrderCanvasRenderer
  orderItems={paginatedItems}
  layout="grid"
/>

// Or smaller canvas size
<OrderCanvasRenderer
  orderId="order-123"
  canvasWidth={250}
  canvasHeight={250}
/>
```

---

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile: ✅ Full support

Requires:
- HTML5 Canvas support
- ES6+ JavaScript
- Modern browser (last 2 versions)

---

## License

This component is part of the Modoo App project and can be freely used within projects that share the same Supabase database structure.

---

## Support

For issues or questions:
1. Check the troubleshooting section
2. Verify database structure matches requirements
3. Check browser console for errors
4. Review the demo page: `/admin/order-preview`

---

## Version History

**v1.0.0** - Initial release
- Complete canvas state rendering
- Multi-side support
- Flexible layouts
- Product color support
- Self-contained component
