# Unified Editor Documentation

## Overview

The Unified Editor is a reusable, multi-mode fabric.js-based canvas editor for designing and editing product customizations. It supports three distinct modes: **Design**, **Order**, and **Template**, each with specific behaviors and use cases.

**Location:** `/modoo_admin/app/editor/[productId]/page.tsx` → `UnifiedEditor.tsx`

---

## Table of Contents

1. [Editor Modes](#editor-modes)
2. [Component Architecture](#component-architecture)
3. [Usage Examples](#usage-examples)
4. [Props & Parameters](#props--parameters)
5. [Product Side Configuration](#product-side-configuration)
6. [Hooks](#hooks)
7. [Mobile Responsiveness](#mobile-responsiveness)
8. [Canvas State Management](#canvas-state-management)

---

## Editor Modes

The editor operates in three distinct modes, each with different behavior and UI:

### 1. Design Mode (`mode="design"`)

**Purpose:** Create and edit user designs that can be saved and later used to create orders.

**Features:**
- ✅ Editable by default
- ✅ Shows toolbar (left sidebar with tools)
- ✅ Shows pricing information
- ✅ Can save designs with a title
- ✅ Blank canvas by default (unless `designId` is provided)
- ✅ When `designId` is provided, loads existing design for editing

**URL Pattern:**
```
/editor/[productId]?mode=design
/editor/[productId]?mode=design&designId=[designId]  // Edit existing
```

**Back URL:** `/designs` (default)

---

### 2. Order Mode (`mode="order"`)

**Purpose:** View and edit designs associated with actual orders.

**Features:**
- ❌ **Not** editable by default (read-only)
- ✅ Toggle edit mode with "편집 모드" button
- ✅ Shows order details in wide panel when not editing
- ✅ Shows download button for exporting all assets
- ✅ Loads canvas state from order item
- ✅ Cancel editing restores original canvas state

**URL Pattern:**
```
/editor/[productId]?mode=order&orderItemId=[orderItemId]
```

**Back URL:** `/orders` (default)

**Editing Workflow:**
1. Opens in read-only mode with order details visible
2. Click "편집 모드" to enable editing
3. Make changes using toolbar
4. Click "저장" to save changes
5. Click "편집 취소" to revert and exit edit mode

---

### 3. Template Mode (`mode="template"`)

**Purpose:** Create and manage reusable design templates that users can select as starting points.

**Features:**
- ✅ Editable by default
- ✅ Shows toolbar
- ✅ Template selection sidebar
- ✅ Create new templates or edit existing ones
- ✅ Template metadata: title, description, sort order, active status
- ❌ No pricing shown

**URL Pattern:**
```
/editor/[productId]?mode=template
/editor/[productId]?mode=template&templateId=[templateId]  // Edit specific
```

**Back URL:** `/products` (default)

---

## Component Architecture

```
UnifiedEditor (main component)
├── EditorHeader (top navigation bar)
├── EditorCanvas (full-screen canvas workspace)
│   └── SingleSideCanvas (for each product side)
├── Toolbar (left sidebar - hidden on mobile)
│   └── Various tools (text, image, shapes, etc.)
└── EditorRightPanel (right panel / mobile slide-up)
    ├── DesignModePanel (design mode)
    ├── OrderModePanel (order view mode)
    ├── OrderEditPanel (order edit mode)
    └── TemplateModePanel (template mode)
```

---

## Usage Examples

### 1. Create New Design

```tsx
// Navigate to:
/editor/product-123?mode=design

// Or programmatically:
<Link href={`/editor/${productId}?mode=design`}>
  Create New Design
</Link>
```

### 2. Edit Existing Design

```tsx
// Navigate to:
/editor/product-123?mode=design&designId=design-456

// From DesignsTab component:
<Link href={`/editor/${design.product_id}?mode=design&designId=${design.id}`}>
  Edit Design
</Link>
```

### 3. View Order Design

```tsx
// Navigate to:
/editor/product-123?mode=order&orderItemId=order-item-789

// Or:
<Link href={`/editor/${productId}?mode=order&orderItemId=${orderItemId}`}>
  View Order
</Link>
```

### 4. Edit Template

```tsx
// Navigate to:
/editor/product-123?mode=template&templateId=template-101

// Or:
<Link href={`/editor/${productId}?mode=template`}>
  Manage Templates
</Link>
```

---

## Props & Parameters

### UnifiedEditor Component

```tsx
interface UnifiedEditorProps {
  productId: string;      // Required: Product ID to load configuration
  mode: EditorMode;       // Required: 'design' | 'order' | 'template'
  orderId?: string;       // Optional: Order ID (for context)
  orderItemId?: string;   // Required for order mode
  templateId?: string;    // Optional: Pre-select template in template mode
  designId?: string;      // Optional: Load existing design in design mode
  returnUrl?: string;     // Optional: Custom back URL (overrides default)
  cobuyRequestId?: string; // Optional: CoBuy request ID — shows freeform sketch reference panel
}
```

### EditorCanvas Component

```tsx
interface EditorCanvasProps {
  sides: ProductSide[];              // Product sides to render
  isEditing: boolean;                // Enable/disable editing
  canvasStates?: Record<string, CanvasState | string | null>;  // Pre-load states
  productColor?: string;             // Product color hex (e.g., '#FFFFFF')
  customFonts?: CustomFont[];        // Custom fonts to load
  onCanvasReady?: (canvas: fabric.Canvas, sideId: string, scale: number) => void;
  rightPanelWidth?: number;          // Desktop: right panel width in px
  leftToolbarWidth?: number;         // Desktop: left toolbar width in px
}
```

### EditorRightPanel Component

```tsx
interface EditorRightPanelProps {
  children: React.ReactNode;  // Panel content
  wide?: boolean;             // Use wide panel (480px vs 288px) - order mode
}
```

**Behavior:**
- **Desktop (≥768px):** Fixed side panel on the right
- **Mobile (<768px):** Slide-up bottom sheet with drag handle

---

## Product Side Configuration

Each product has a `configuration` array defining the sides (surfaces) that can be customized.

### ProductSide Interface

```tsx
interface ProductSide {
  id: string;                    // Unique identifier (e.g., 'front', 'back')
  name: string;                  // Display name (e.g., '앞면', '뒷면')
  imageUrl: string;              // Background product image URL
  printArea: {                   // Customizable area coordinates
    x: number;                   // X offset from top-left
    y: number;                   // Y offset from top-left
    width: number;               // Print area width
    height: number;              // Print area height
  };
  layers?: ProductLayer[];       // Optional overlay layers (e.g., color variants)
  realLifeDimensions?: {         // Physical dimensions for printing
    printAreaWidthMm: number;
    printAreaHeightMm: number;
    productWidthMm: number;
  };
  zoomScale?: number;            // Initial zoom level
}
```

### Example Configuration

```json
{
  "configuration": [
    {
      "id": "front",
      "name": "앞면",
      "imageUrl": "/products/tshirt-front.png",
      "printArea": {
        "x": 100,
        "y": 120,
        "width": 200,
        "height": 280
      },
      "realLifeDimensions": {
        "printAreaWidthMm": 250,
        "printAreaHeightMm": 350,
        "productWidthMm": 500
      }
    },
    {
      "id": "back",
      "name": "뒷면",
      "imageUrl": "/products/tshirt-back.png",
      "printArea": {
        "x": 100,
        "y": 120,
        "width": 200,
        "height": 280
      }
    }
  ]
}
```

**Canvas Rendering:**
- Multiple sides are displayed in a **grid layout** (2 columns)
- Canvas size: **400px × 500px** per side
- Active side is highlighted with a blue ring
- Click a side to make it active

---

## Hooks

### 1. useEditorMode

Returns configuration for the current editor mode.

```tsx
const modeConfig = useEditorMode({ mode, returnUrl });

// Returns:
interface EditorModeConfig {
  mode: EditorMode;
  label: string;              // Header label
  initiallyEditable: boolean; // Start in edit mode?
  showToolbar: boolean;       // Show left toolbar?
  showPricing: boolean;       // Show pricing info?
  showDownload: boolean;      // Show download button?
  backUrl: string;            // Back navigation URL
}
```

### 2. useEditorData

Fetches and manages all data needed for the editor.

```tsx
const editorData = useEditorData({
  productId,
  mode,
  orderId,
  orderItemId,
  templateId,
  designId
});

// Returns:
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
}
```

**Data Loading Logic:**
- **Design Mode + designId:** Loads saved design canvas states
- **Design Mode (no designId):** Blank canvas
- **Order Mode:** Loads order item canvas states
- **Template Mode:** Loads templates, optionally selects one

### 3. useEditorSave

Handles saving logic for each mode.

```tsx
const { handleSave } = useEditorSave({
  mode,
  product,
  orderItem,
  savedDesign,
  selectedTemplate,
  designTitle,
  templateTitle,
  templateDescription,
  templateSortOrder,
  templateIsActive,
});

// Usage:
const result = await handleSave();
// Returns: { success: boolean; error?: string; id?: string }
```

**Save Behavior:**
- **Design Mode:** Creates/updates saved design, returns designId
- **Order Mode:** Updates order item canvas state
- **Template Mode:** Creates/updates template

---

## Mobile Responsiveness

The editor is fully optimized for mobile devices (< 768px width).

### Desktop Layout

```
┌──────────────────────────────────────────────────────┐
│ Header                                               │
├────┬────────────────────────────────────────┬────────┤
│    │                                        │ Right  │
│ T  │        Canvas Workspace                │ Panel  │
│ o  │                                        │ (288px │
│ o  │                                        │ or     │
│ l  │                                        │ 480px) │
│ b  │                                        │        │
│ a  │                                        │        │
│ r  │                                        │        │
│    │                                        │        │
└────┴────────────────────────────────────────┴────────┘
```

### Mobile Layout

```
┌──────────────────────────────────────┐
│ Header                               │
├──────────────────────────────────────┤
│                                      │
│                                      │
│         Canvas (Full Screen)         │
│                                      │
│                                      │
│                                      │
├──────────────────────────────────────┤
│ ━━━━  (Drag Handle)                  │
│                                      │
│  Slide-up Panel                      │
│  (Initial: 120px peek height)        │
└──────────────────────────────────────┘
```

### Mobile Features

1. **Canvas Gestures:**
   - 🤏 **Pinch-to-zoom:** Two fingers pinch/spread
   - 👆 **Two-finger pan:** Move canvas around with two fingers
   - Desktop gestures still work: mouse wheel zoom, Space+drag

2. **Slide-up Panel:**
   - Initial peek height: **120px** (shows panel exists)
   - Drag handle at top
   - Snap points: Peek (120px), Half-screen (50%), Full-screen (height - 60px)
   - Touch and mouse drag supported

3. **Hidden Elements:**
   - Left toolbar hidden on mobile (too crowded)
   - Panel widths set to 0 for canvas centering calculations

---

## Canvas State Management

### Canvas State Structure

Each side has its own canvas state stored as a fabric.js JSON object:

```tsx
type CanvasState = {
  version: string;
  objects: FabricObject[];
  background?: string;
  productColor?: string;  // Hex color
  // ... other fabric.js properties
};

// Stored as:
Record<string, CanvasState | string | null>
// Example: { "front": {...}, "back": {...} }
```

### Loading Canvas States

Canvas states are loaded differently per mode:

```tsx
// Design Mode (new):
canvasStates={undefined}  // Blank canvas

// Design Mode (existing):
canvasStates={design.canvas_state}  // Load saved design

// Order Mode:
canvasStates={orderItem.canvas_state}  // Load order design

// Template Mode:
canvasStates={template.canvas_state}  // Load template
```

### Saving Canvas States

When saving, the current canvas state is captured from the `canvasMap` store:

```tsx
import { useCanvasStore } from '@/store/useCanvasStore';

const { canvasMap } = useCanvasStore();

// Capture states from all sides:
const canvasStates = {};
Object.entries(canvasMap).forEach(([sideId, canvas]) => {
  canvasStates[sideId] = canvas.toJSON();
});
```

---

## Key Features

### 1. Edit Snapshot (Order Mode)

When entering edit mode in order mode, the current state is saved as a snapshot. If the user cancels, the original state is restored:

```tsx
// On edit enter:
editSnapshotRef.current = {
  front: canvas.toJSON(),
  back: canvas.toJSON()
};

// On edit cancel:
canvas.loadFromJSON(editSnapshotRef.current[sideId]);
```

### 2. Pan and Zoom

**Desktop:**
- Mouse wheel: Zoom toward cursor
- Space + drag: Pan canvas
- Middle mouse button: Pan canvas

**Mobile:**
- Two-finger pinch: Zoom
- Two-finger pan: Move canvas

### 3. Multi-Side Canvas

The editor automatically arranges multiple sides in a grid:
- **1 side:** 1 column
- **2+ sides:** 2 columns

Canvas centering accounts for overlay widths (toolbar + panel).

### 4. Custom Fonts

Custom fonts uploaded in previous sessions are automatically loaded:

```tsx
customFonts={[
  {
    fontFamily: 'CustomFont',
    url: 'https://storage.url/font.ttf',
    format: 'truetype'
  }
]}
```

---

## Error Handling

The editor includes comprehensive error handling:

1. **Loading States:**
   - Shows spinner during data fetch
   - Error message if product/data fails to load

2. **Save Errors:**
   - Displays error message in header
   - Does not navigate away on failure

3. **Missing Data:**
   - Gracefully handles missing product
   - Shows appropriate fallback UI

---

## Best Practices

### 1. Navigation

Always provide a `returnUrl` when navigating to the editor:

```tsx
const returnUrl = `/products/${productId}`;
router.push(`/editor/${productId}?mode=design&returnUrl=${encodeURIComponent(returnUrl)}`);
```

### 2. Product Configuration

Ensure products have valid `configuration` with at least one side:

```tsx
if (!product.configuration || product.configuration.length === 0) {
  throw new Error('Product must have at least one side configured');
}
```

### 3. Canvas States

Always check if canvas states exist before accessing:

```tsx
const state = canvasStates[sideId];
if (state && typeof state === 'object') {
  // Use state
}
```

### 4. Mobile Testing

Test on actual mobile devices to ensure:
- Touch gestures work smoothly
- Slide-up panel is easily discoverable
- Canvas is fully visible

---

## API Endpoints Used

### Design Mode
- `GET /api/admin/designs/[id]` - Fetch saved design
- `POST /api/admin/designs` - Create new design
- `PUT /api/admin/designs/[id]` - Update existing design

### Order Mode
- Supabase query to `order_items` table
- `PUT /api/admin/orders/[orderId]/items/[itemId]` - Update order item

### Template Mode
- Supabase query to `design_templates` table
- `POST /api/admin/design-templates` - Create template
- `PUT /api/admin/design-templates/[id]` - Update template
- `DELETE /api/admin/design-templates?id=[id]` - Delete template

---

## Troubleshooting

### Canvas not loading saved design

**Issue:** Canvas appears blank even with `designId`

**Solution:** Check that `canvasStates` is being passed correctly:
```tsx
// Correct:
canvasStates={mode === 'design' && !designId ? undefined : canvasStates}

// Wrong:
canvasStates={mode !== 'design' ? canvasStates : undefined}
```

### Mobile panel not visible

**Issue:** Panel hidden on mobile

**Solution:** Ensure panel has proper z-index and is not hidden by parent overflow:
```tsx
className="... z-50 fixed bottom-0 left-0 right-0"
```

### Touch gestures not working

**Issue:** Pinch zoom or pan doesn't work

**Solution:** Check that touch event listeners are added with `{ passive: false }`:
```tsx
el.addEventListener('touchmove', handleTouchMove, { passive: false });
```

---

## Future Enhancements

Potential improvements to consider:

- [ ] Undo/Redo functionality
- [ ] Keyboard shortcuts
- [ ] Collaborative editing
- [ ] Version history
- [ ] Auto-save drafts
- [ ] Preview mode with mockups
- [ ] Export as PDF/PNG
- [ ] Copy/paste between sides

---

## Related Files

```
modoo_admin/
├── app/editor/[productId]/page.tsx          # Entry point
├── components/editor/
│   ├── UnifiedEditor.tsx                     # Main component
│   ├── EditorCanvas.tsx                      # Canvas workspace
│   ├── EditorHeader.tsx                      # Top navigation
│   ├── EditorRightPanel.tsx                  # Side/bottom panel
│   ├── hooks/
│   │   ├── useEditorMode.ts                  # Mode configuration
│   │   ├── useEditorData.ts                  # Data fetching
│   │   └── useEditorSave.ts                  # Save logic
│   └── panels/
│       ├── DesignModePanel.tsx               # Design UI
│       ├── OrderModePanel.tsx                # Order view UI
│       ├── OrderEditPanel.tsx                # Order edit UI
│       └── TemplateModePanel.tsx             # Template UI
├── components/canvas/
│   ├── SingleSideCanvas.tsx                  # Individual canvas
│   └── Toolbar.tsx                           # Tools sidebar
└── store/
    └── useCanvasStore.ts                     # Canvas state store
```

---

**Last Updated:** 2026-02-20
