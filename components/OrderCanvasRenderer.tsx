/**
 * OrderCanvasRenderer - Standalone Canvas State Renderer
 *
 * This component renders Fabric.js canvas states from order_items in the database.
 * It recreates the exact visual output with proper dimensions and placements.
 *
 * COMPLETELY SELF-CONTAINED - No external component dependencies
 * Can be extracted and used in other codebases with the same Supabase database.
 *
 * Dependencies:
 * - fabric (6.9.1+): npm install fabric
 * - @supabase/supabase-js: npm install @supabase/supabase-js
 *
 * Database Requirements:
 * - order_items table with canvas_state column (jsonb)
 * - products table with configuration column (jsonb)
 * - Supabase Storage for product mockup images
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ProductLayer {
  id: string;
  name: string;
  imageUrl: string;
  colorOptions: Array<{
    hex: string;
    colorCode: string;
  }>;
  zIndex: number;
}

interface CanvasState {
  version?: string;
  objects: any[];
  background?: string;
  backgroundImage?: any;
  layerColors?: Record<string, string>;
  productColor?: string;
}

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
  layers?: ProductLayer[];
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_title: string;
  quantity: number;
  price_per_item: number;
  canvas_state: Record<string, string> | Record<string, unknown>;
  item_options?: {
    size_id?: string;
    size_name?: string;
    color_id?: string;
    color_name?: string;
    color_hex?: string;
    variants?: Array<{
      size_id?: string;
      size_name?: string;
      color_id?: string;
      color_name?: string;
      color_hex?: string;
      quantity?: number;
    }>;
  };
  thumbnail_url?: string | null;
}

interface Product {
  id: string;
  title: string;
  configuration: ProductSide[];
}

interface CanvasStateData {
  version?: string;
  objects: any[];
}

// ============================================================================
// SUPABASE CLIENT (INLINE)
// ============================================================================

/**
 * Creates a Supabase client
 * Replace these with your own Supabase credentials if using in another project
 */
function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

// ============================================================================
// SINGLE CANVAS RENDERER (INLINE COMPONENT)
// ============================================================================

interface SingleCanvasRendererProps {
  side: ProductSide;
  canvasState: CanvasState | string;
  productColor?: string;
  width?: number;
  height?: number;
  onCanvasReady?: (canvas: fabric.Canvas, sideId: string, scale: number) => void;
  renderFromCanvasStateOnly?: boolean;
}

const SingleCanvasRenderer: React.FC<SingleCanvasRendererProps> = ({
  side,
  width = 500,
  height = 500,
  canvasState,
  productColor,
  onCanvasReady,
  renderFromCanvasStateOnly = false,
}) => {
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const productImageRef = useRef<fabric.FabricImage | null>(null);
  const layerImagesRef = useRef<Map<string, fabric.FabricImage>>(new Map());
  const loadSessionRef = useRef(0);
  const scaleRef = useRef(1);
  const suppressObjectAddedRef = useRef(false);
  const lastCanvasStateRef = useRef<string | null>(null);
  const lastCanvasSideRef = useRef<string | null>(null);

  // Loading state to track when all images are loaded
  const [isLoading, setIsLoading] = useState(true);

  // Track when layers are fully loaded and ready for color application
  const [layersReady, setLayersReady] = useState(false);

  // Reset layersReady when side changes
  useEffect(() => {
    setLayersReady(false);
  }, [side.id]);

  // Initialize canvas once
  useEffect(() => {
    const sessionId = ++loadSessionRef.current;
    let isDisposed = false;
    const isSessionActive = () => !isDisposed && loadSessionRef.current === sessionId;

    setIsLoading(true);
    setLayersReady(false);
    layerImagesRef.current.clear();
    productImageRef.current = null;

    if (!canvasHostRef.current) {
      return; // if the canvas element is not initialized properly pass this code
    }

    const canvasElement = document.createElement('canvas');
    canvasElement.width = width;
    canvasElement.height = height;
    canvasHostRef.current.innerHTML = '';
    canvasHostRef.current.appendChild(canvasElement);
    canvasEl.current = canvasElement;

    const canvas = new fabric.Canvas(canvasElement, {
      width,
      height,
      backgroundColor: '#f3f3f3', // light gray background for visibility
      preserveObjectStacking: true, // keeps selected objects from jumping to front automatically
      selection: false, // Will be controlled by separate effect based on isEdit
    })

    canvasRef.current = canvas;

    // -- For calculations
    const printW = side.printArea.width;
    const printH = side.printArea.height;

    // Temporary centered position (will be updated when image loads)
    const tempCenteredLeft = (width - printW) / 2;
    const tempCenteredTop = (height - printH) / 2;

    // Check if side has layers (multi-layer mode) or single imageUrl (legacy mode)
    const hasLayers = side.layers && side.layers.length > 0;

    if (hasLayers) {
      // Multi-layer mode: Initialize layer colors and load all layers
      // Sort layers by zIndex
      const sortedLayers = [...side.layers!].sort((a, b) => a.zIndex - b.zIndex);

      // Helper function to ensure image is fully loaded and decoded
      // This pre-loads the image using native Image() before passing to Fabric.js
      const ensureImageFullyLoaded = async (imageUrl: string, layerName: string, layerId: string, maxRetries = 3): Promise<fabric.FabricImage | null> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          if (!isSessionActive()) return null;

          try {
            // Step 1: Pre-load using native Image() to ensure it's fully available
            const nativeImg = new Image();
            nativeImg.crossOrigin = 'anonymous';

            // Create a promise that resolves when the image is fully loaded
            const imageLoadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
              let timeoutId: ReturnType<typeof setTimeout> | null = null;
              nativeImg.onload = () => {
                if (timeoutId) clearTimeout(timeoutId);
                resolve(nativeImg);
              };
              nativeImg.onerror = (error) => {
                if (timeoutId) clearTimeout(timeoutId);
                reject(new Error(`Failed to load image: ${imageUrl}`));
              };
              // Set timeout for image loading
              timeoutId = setTimeout(() => reject(new Error('Image load timeout')), 30000);
            });

            // Start loading the image
            nativeImg.src = imageUrl;

            // Wait for the image to load
            const loadedImg = await imageLoadPromise;
            if (!isSessionActive()) return null;

            // Step 2: Decode the image to ensure it's fully decoded in memory
            if (loadedImg.decode) {
              await loadedImg.decode();
            }
            if (!isSessionActive()) return null;

            // Step 3: Verify dimensions
            const imgWidth = loadedImg.naturalWidth;
            const imgHeight = loadedImg.naturalHeight;

            if (imgWidth === 0 || imgHeight === 0) {
              throw new Error(`Invalid dimensions: ${imgWidth}x${imgHeight}`);
            }

            // Step 4: Now create Fabric.js image from the pre-loaded native image
            // This is much more reliable than fromURL because the image is already loaded
            const fabricImg = new fabric.FabricImage(loadedImg, {
              crossOrigin: 'anonymous'
            });
            if (!isSessionActive()) return null;

            // Final verification
            if (!fabricImg || fabricImg.width === 0 || fabricImg.height === 0) {
              throw new Error(`Fabric image creation failed or has invalid dimensions`);
            }

            return fabricImg;

          } catch (error) {
            if (attempt === maxRetries) {
              return null;
            }

            // Wait before retrying (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        return null;
      };

      // Load all layer images sequentially (one by one) to guarantee all images load
      const loadLayersSequentially = async () => {
        const validResults: Array<{ img: fabric.FabricImage; scale: number; imgWidth: number; imgHeight: number; layer: ProductLayer }> = [];

        for (const layer of sortedLayers) {
          if (!isSessionActive()) break;

          try {
            const img = await ensureImageFullyLoaded(layer.imageUrl, layer.name, layer.id);
            if (!isSessionActive()) break;

            if (!img) {
              continue;
            }

            // Scale the image to fit the canvas
            const imgWidth = img.width || 0;
            const imgHeight = img.height || 0;

            // Get zoom scale from side configuration
            const zoomScale = side.zoomScale || 1.0;
            const baseScale = Math.min(width / imgWidth, height / imgHeight);
            const scale = baseScale * zoomScale;

            scaleRef.current = scale;
            img.set({
              scaleX: scale,
              scaleY: scale,
              originX: 'center',
              originY: 'center',
              left: width / 2,
              top: height / 2,
              selectable: false,
              evented: false,
              lockMovementX: true,
              lockMovementY: true,
              lockRotation: true,
              lockScalingX: true,
              lockScalingY: true,
              hasControls: false,
              hasBorders: false,
              data: {
                id: 'background-product-image',
                layerId: layer.id
              },
            });

            // Store reference to this layer image (before applying filters)
            layerImagesRef.current.set(layer.id, img);

            validResults.push({ img, scale, imgWidth, imgHeight, layer });
          } catch (error) {
            // Catch individual layer loading errors to prevent one failure from breaking all layers
            // Continue to next layer instead of stopping the entire process
          }
        }

        return validResults;
      };

      // Execute sequential loading
      loadLayersSequentially().then((validResults) => {
        if (!isSessionActive()) return;

        if (validResults.length === 0) {
          setIsLoading(false);
          return;
        }

        // Use the first layer's dimensions for calculations
        const firstResult = validResults[0]!;
        const { scale, imgWidth, imgHeight } = firstResult;
        scaleRef.current = scale;

        // Add all layer images to canvas in z-index order (bottom to top)
        let addedLayerCount = 0;

        // Add layers to canvas FIRST without color filters
        // Color filters will be applied by the effect after all layers are confirmed loaded
        sortedLayers.forEach((layer) => {
          const layerImg = layerImagesRef.current.get(layer.id);
          if (layerImg) {
            canvas.add(layerImg);
            addedLayerCount++;
          }
        });

        // Verify all layers were added
        if (addedLayerCount !== validResults.length) {
        }

        // Send all layers to the back in reverse order to maintain zIndex
        // This ensures layers are at the very bottom, below guide elements
        for (let i = sortedLayers.length - 1; i >= 0; i--) {
          const layer = sortedLayers[i];
          const layerImg = layerImagesRef.current.get(layer.id);
          if (layerImg) {
            canvas.sendObjectToBack(layerImg);
          }
        }

        // Calculate print area position relative to the first layer
        const scaledPrintW = side.printArea.width * scale;
        const scaledPrintH = side.printArea.height * scale;
        const scaledPrintX = side.printArea.x * scale;
        const scaledPrintY = side.printArea.y * scale;

        const imageLeft = (width / 2) - (imgWidth * scale / 2);
        const imageTop = (height / 2) - (imgHeight * scale / 2);

        const printAreaLeft = imageLeft + scaledPrintX;
        const printAreaTop = imageTop + scaledPrintY;

        // Store values for use in event handlers
        // @ts-expect-error - Adding custom properties
        canvas.printAreaLeft = printAreaLeft;
        // @ts-expect-error - Custom property
        canvas.printAreaTop = printAreaTop;
        // @ts-expect-error - Custom property
        canvas.printAreaWidth = scaledPrintW;
        // @ts-expect-error - Custom property
        canvas.printAreaHeight = scaledPrintH;
        // @ts-expect-error - Custom property
        canvas.originalImageWidth = imgWidth;
        // @ts-expect-error - Custom property
        canvas.originalImageHeight = imgHeight;
        // @ts-expect-error - Custom property
        canvas.scaledImageWidth = imgWidth * scale;
        // @ts-expect-error - Custom property
        canvas.scaledImageHeight = imgHeight * scale;

        // Force a render to ensure all objects are processed by Fabric.js
        canvas.requestRenderAll();

        // Wait for next animation frame to ensure Fabric.js has completed rendering
        // This guarantees all layer images are properly initialized before showing the canvas
        requestAnimationFrame(() => {
          if (!isSessionActive()) return;
          // Verify all layers are actually rendered on the canvas
          const canvasObjects = canvas.getObjects();
          const layerObjectsOnCanvas = canvasObjects.filter(obj => {
            // @ts-expect-error - Checking custom data property
            return obj.data?.id === 'background-product-image';
          });

          if (layerObjectsOnCanvas.length !== addedLayerCount) {
          }

          // All layers loaded, added, and rendered - mark as ready
          // Set layersReady to trigger the color application effect
          setLayersReady(true);
          setIsLoading(false);
        });
      }).catch((error) => {
        if (!isSessionActive()) return;
        setIsLoading(false);
      });
    } else {
      // Legacy single-image mode: use imageUrl
      const imageUrl = side.imageUrl;
      if (!imageUrl) {
        setIsLoading(false);
        return;
      }

      // Helper function to ensure single image is fully loaded and decoded
      const loadSingleImage = async () => {
        try {
          // First, load the image using Fabric.js
          const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });

          if (!img) {
            return null;
          }

          // Get the underlying HTMLImageElement
          const imgElement = img.getElement() as HTMLImageElement;

          // Ensure the image is fully loaded
          if (!imgElement.complete) {
            await new Promise<void>((resolve, reject) => {
              imgElement.onload = () => resolve();
              imgElement.onerror = () => reject(new Error('Image failed to load'));
              // Add timeout to prevent infinite waiting
              setTimeout(() => reject(new Error('Image load timeout')), 30000);
            });
          }

          // Use the decode() API to ensure the image is fully decoded
          if (imgElement.decode) {
            await imgElement.decode();
          }

          // Verify dimensions after decode
          const imgWidth = img.width || 0;
          const imgHeight = img.height || 0;

          if (imgWidth === 0 || imgHeight === 0) {
            return null;
          }

          return img;
        } catch (error) {
          return null;
        }
      };

      loadSingleImage().then((img) => {
        if (!isSessionActive()) return;

        if (!img) {
          setIsLoading(false);
          return;
        }

        // Scale the image to fit the canvas (basically contains the image inside the canvas)
        const imgWidth = img.width || 0;
        const imgHeight = img.height || 0;

        // Get zoom scale from side configuration (default to 1.0 if not provided)
        const zoomScale = side.zoomScale || 1.0;

        // for changing the scaling of the image based on the canvas's width and height
        const baseScale = Math.min(width / imgWidth, height / imgHeight);
        const scale = baseScale * zoomScale;
        scaleRef.current = scale;

        img.set({
          scaleX: scale,
          scaleY: scale,
          originX: 'center',
          originY: 'center',
          left: width / 2,
          top: height / 2,
          selectable: false, // Users should not be able move the t-shirt itself
          evented: false, // Clicks pass through the objects behind (if any) or canvas
          lockMovementX: true, // Prevent any horizontal movement
          lockMovementY: true, // Prevent any vertical movement
          lockRotation: true, // Prevent rotation
          lockScalingX: true, // Prevent scaling
          lockScalingY: true, // Prevent scaling
          hasControls: false, // Remove all controls
          hasBorders: false, // Remove borders
          data: { id: 'background-product-image' }, // Custom data to identify this as the background
        });

        // Store reference to the product image
        productImageRef.current = img;

        canvas.add(img);
        canvas.sendObjectToBack(img); // ensure it stays behind design elements

        // Apply initial color filter using the current productColor from store
        const currentColor = productColor;
        img.filters = [];
        const initialColorFilter = new fabric.filters.BlendColor({
          color: currentColor,
          mode: 'multiply',
          alpha: 1,
        });
        img.filters.push(initialColorFilter);
        img.applyFilters();

        // Calculate print area position relative to the product image
        // The print area coordinates are in the original image pixel space
        // We need to scale them and position them relative to the scaled image

        // Scale the print area dimensions to match the image scale
        const scaledPrintW = side.printArea.width * scale;
        const scaledPrintH = side.printArea.height * scale;
        const scaledPrintX = side.printArea.x * scale;
        const scaledPrintY = side.printArea.y * scale;

        // Calculate the position of the scaled image on the canvas
        // The image is centered, so we need to account for that
        const imageLeft = (width / 2) - (imgWidth * scale / 2);
        const imageTop = (height / 2) - (imgHeight * scale / 2);

        // Position the print area relative to the image position
        const printAreaLeft = imageLeft + scaledPrintX;
        const printAreaTop = imageTop + scaledPrintY;

        // Store these values for use in event handlers and pricing calculations
        // @ts-expect-error - Adding custom properties to fabric.Canvas for print area tracking
        canvas.printAreaLeft = printAreaLeft;
        // @ts-expect-error - Custom property
        canvas.printAreaTop = printAreaTop;
        // @ts-expect-error - Custom property
        canvas.printAreaWidth = scaledPrintW;
        // @ts-expect-error - Custom property
        canvas.printAreaHeight = scaledPrintH;

        // Store original and scaled image dimensions for accurate pixel-to-mm conversion
        // @ts-expect-error - Custom property
        canvas.originalImageWidth = imgWidth;
        // @ts-expect-error - Custom property
        canvas.originalImageHeight = imgHeight;
        // @ts-expect-error - Custom property
        canvas.scaledImageWidth = imgWidth * scale;
        // @ts-expect-error - Custom property
        canvas.scaledImageHeight = imgHeight * scale;

        // Force a render to ensure all objects are processed by Fabric.js
        canvas.requestRenderAll();

        // Wait for next animation frame to ensure Fabric.js has completed rendering
        // This guarantees the image is properly initialized before showing the canvas
        requestAnimationFrame(() => {
          if (!isSessionActive()) return;
          // Verify the image is actually rendered on the canvas
          const canvasObjects = canvas.getObjects();
          const productImageOnCanvas = canvasObjects.find(obj => {
            // @ts-expect-error - Checking custom data property
            return obj.data?.id === 'background-product-image';
          });

          if (!productImageOnCanvas) {
          } else {
          }

          // Single image loaded and rendered - mark as ready
          setIsLoading(false);
        });
      })
      .catch((error) => {
        if (!isSessionActive()) return;
        setIsLoading(false);
      });
    }

    return () => {
      isDisposed = true;
      loadSessionRef.current++;
      canvas.dispose();
      canvasRef.current = null;
      if (canvasHostRef.current) {
        canvasHostRef.current.innerHTML = '';
      }
      canvasEl.current = null;
    };
  }, [side, height, width]);

  // Effect to apply color filter when productColor changes (legacy single-image mode)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Only apply in legacy mode (when side has no layers)
    if (side.layers && side.layers.length > 0) return;

    // Find all objects with id 'background-product-image' and apply color filter
    canvas.forEachObject((obj) => {
      // @ts-expect-error - Checking custom data property
      if (obj.data?.id === 'background-product-image' && obj.type === 'image') {
        const imgObj = obj as fabric.FabricImage;

        // Remove any existing filters
        imgObj.filters = [];

        const state = typeof canvasState === 'string' ? JSON.parse(canvasState) : canvasState;
        const color = state?.productColor || productColor;

        const colorFilter = new fabric.filters.BlendColor({
          color: color,
          mode: 'multiply',
          alpha: 1, // Adjust opacity of the color overlay
        });

        imgObj.filters.push(colorFilter);
        imgObj.applyFilters();
      }
    });

    canvas.requestRenderAll();
  }, [productColor, side.layers, canvasState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!canvasState) return;

    const hasLayers = side.layers && side.layers.length > 0;
    if (isLoading) return;
    if (hasLayers && !layersReady) return;

    const serializedState =
      typeof canvasState === 'string'
        ? canvasState
        : JSON.stringify(canvasState ?? {});

    if (
      lastCanvasStateRef.current === serializedState &&
      lastCanvasSideRef.current === side.id
    ) {
      return;
    }

    const parsedState = (() => {
      if (!canvasState) return null;
      if (typeof canvasState === 'string') {
        try {
          return JSON.parse(canvasState) as CanvasState;
        } catch (error) {
          return null;
        }
      }
      return canvasState;
    })();

    if (!parsedState || !parsedState.objects) return;

    // Restore calibration mmPerPx from saved canvas_state so admin pricing /
    // dimension calculations match what the user saw at design time. Absent
    // for legacy designs → falls back to legacy productWidthMm ratio.
    const embeddedCalibration =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (parsedState as any).__mmPerPxCalibrationNative;
    if (typeof embeddedCalibration === 'number' && embeddedCalibration > 0) {
      // @ts-expect-error - Custom property
      canvas.calibrationNativeMmPerPx = embeddedCalibration;
    }

    const existingObjects = canvas.getObjects().filter((obj) => {
      if (obj.excludeFromExport) return false;
      const objData = obj as { data?: { id?: string } };
      return objData.data?.id !== 'background-product-image';
    });

    existingObjects.forEach((obj) => canvas.remove(obj));

    const applyObjects = async () => {
      suppressObjectAddedRef.current = renderFromCanvasStateOnly;
      const objects = await fabric.util.enlivenObjects(parsedState.objects);

      objects.forEach((obj) => {
        if (!obj || typeof obj !== 'object' || !('type' in obj)) return;

        const fabricObj = obj as fabric.FabricObject;

        fabricObj.selectable = false;
        fabricObj.evented = false;
        canvas.add(fabricObj);
        canvas.bringObjectToFront(fabricObj);
      });

      canvas.requestRenderAll();
      suppressObjectAddedRef.current = false;
      lastCanvasStateRef.current = serializedState;
      lastCanvasSideRef.current = side.id;

      if (onCanvasReady) {
        onCanvasReady(canvas, side.id, scaleRef.current);
      }
    };

    applyObjects();
  }, [canvasState, height, isLoading, layersReady, onCanvasReady, side.id, side.layers, side.printArea.height, side.printArea.width, width]);

  // Effect to apply color filter to layers when layerColors change or layers are ready
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Only apply in multi-layer mode
    if (!side.layers || side.layers.length === 0) return;

    // Wait for layers to be loaded before applying colors
    if (!layersReady) {
      return;
    }

    // Build a lookup of layerId -> images on canvas to handle duplicates reliably
    const layerImagesById = new Map<string, fabric.FabricImage[]>();
    canvas.getObjects().forEach((obj) => {
      if (obj.type !== 'image') return;
      // @ts-expect-error - Checking custom data property
      const dataId = obj.data?.id;
      // @ts-expect-error - Checking custom data property
      const dataLayerId = obj.data?.layerId as string | undefined;
      if (dataId !== 'background-product-image' || !dataLayerId) return;
      const list = layerImagesById.get(dataLayerId) || [];
      list.push(obj as fabric.FabricImage);
      layerImagesById.set(dataLayerId, list);
    });

    // Update each layer's color based on layerColors state
    side.layers.forEach((layer) => {
      const canvasLayerImages = layerImagesById.get(layer.id) || [];
      const refLayerImage = layerImagesRef.current.get(layer.id);
      const layerImages = canvasLayerImages.length > 0
        ? canvasLayerImages
        : (refLayerImage ? [refLayerImage] : []);

      if (layerImages.length === 0) {
        return;
      }

      // Check for color in canvasState first, then fall back
      const state = typeof canvasState === 'string' ? JSON.parse(canvasState) : canvasState;
      const selectedColor = state?.layerColors?.[layer.id] || state?.productColor || layer.colorOptions[0]?.hex || '#FFFFFF';

      layerImages.forEach((layerImg) => {
        // Remove any existing filters
        layerImg.filters = [];

        const colorFilter = new fabric.filters.BlendColor({
          color: selectedColor,
          mode: 'multiply',
          alpha: 1,
        });

        layerImg.filters.push(colorFilter);
        layerImg.applyFilters();
      });
    });

    canvas.requestRenderAll();
  }, [side.id, side.layers, layersReady, canvasState]);

  return (
    <div className="relative" style={{ width, height }}>
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gray-100"
          style={{ width, height }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="text-sm text-gray-600">Loading canvas...</p>
          </div>
        </div>
      )}
      <div
        ref={canvasHostRef}
        className="w-full h-full"
        style={{ opacity: isLoading ? 0 : 1, transition: 'opacity 0.3s' }}
      />
    </div>
  )
};

// ============================================================================
// MAIN ORDER CANVAS RENDERER COMPONENT
// ============================================================================

interface OrderCanvasRendererProps {
  orderId?: string;
  orderItemId?: string;
  orderItems?: OrderItem[];
  canvasWidth?: number;
  canvasHeight?: number;
  layout?: 'grid' | 'horizontal' | 'vertical';
  showItemInfo?: boolean;
}

const OrderCanvasRenderer: React.FC<OrderCanvasRendererProps> = ({
  orderId,
  orderItemId,
  orderItems: providedOrderItems,
  canvasWidth = 500,
  canvasHeight = 500,
  layout = 'grid',
  showItemInfo = true,
}) => {
  const [orderItems, setOrderItems] = useState<OrderItem[]>(providedOrderItems || []);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [loading, setLoading] = useState(!providedOrderItems);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (providedOrderItems) {
      loadProducts(providedOrderItems);
    } else if (orderId || orderItemId) {
      fetchOrderItems();
    }
  }, [orderId, orderItemId, providedOrderItems]);

  const fetchOrderItems = async () => {
    try {
      setLoading(true);
      const supabase = createSupabaseClient();

      let query = supabase.from('order_items').select('*');

      if (orderItemId) {
        query = query.eq('id', orderItemId);
      } else if (orderId) {
        query = query.eq('order_id', orderId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        throw new Error('No order items found');
      }

      setOrderItems(data as OrderItem[]);
      await loadProducts(data as OrderItem[]);
    } catch (err) {
      console.error('Error fetching order items:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch order items');
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async (items: OrderItem[]) => {
    try {
      const supabase = createSupabaseClient();
      const productIds = [...new Set(items.map((item) => item.product_id))];

      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, title, configuration')
        .in('id', productIds);

      if (productsError) throw productsError;

      const productsMap: Record<string, Product> = {};
      (productsData || []).forEach((product) => {
        productsMap[product.id] = product as Product;
      });

      setProducts(productsMap);
    } catch (err) {
      console.error('Error loading products:', err);
      setError(err instanceof Error ? err.message : 'Failed to load products');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
          <div className="text-sm text-gray-600">Loading order items...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-sm text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (orderItems.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="text-sm text-gray-600">No order items to display</div>
      </div>
    );
  }

  const getLayoutClass = () => {
    switch (layout) {
      case 'horizontal':
        return 'flex flex-row flex-wrap gap-6';
      case 'vertical':
        return 'flex flex-col gap-6';
      case 'grid':
      default:
        return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    }
  };

  return (
    <div className="w-full">
      <div className={getLayoutClass()}>
        {orderItems.map((item) => {
          const product = products[item.product_id];

          if (!product || !product.configuration) {
            return (
              <div
                key={item.id}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="text-sm text-gray-600">
                  Product configuration not found
                </div>
              </div>
            );
          }

          const canvasState = item.canvas_state as Record<string, string>;
          const productColor =
            item.item_options?.color_hex || item.item_options?.variants?.[0]?.color_hex || '#FFFFFF';

          return (
            <div
              key={item.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              {showItemInfo && (
                <div className="mb-4 border-b border-gray-200 pb-4">
                  <h3 className="font-semibold text-gray-900">
                    {item.product_title}
                  </h3>
                  {(item.item_options?.size_name || item.item_options?.variants?.[0]?.size_name) && (
                    <div className="mt-1 text-sm text-gray-600">
                      Size: {item.item_options?.size_name || item.item_options?.variants?.[0]?.size_name}
                    </div>
                  )}
                  {(item.item_options?.color_name || item.item_options?.variants?.[0]?.color_name) && (
                    <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                      <span>
                        Color: {item.item_options?.color_name || item.item_options?.variants?.[0]?.color_name}
                      </span>
                      <div
                        className="h-4 w-4 rounded-full border border-gray-300"
                        style={{ backgroundColor: productColor }}
                      />
                    </div>
                  )}
                  <div className="mt-1 text-sm text-gray-600">
                    Quantity: {item.quantity}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-4">
                {product.configuration.map((side) => {
                  const sideCanvasState = canvasState[side.id];

                  // Only render sides that have canvas state
                  if (!sideCanvasState) return null;

                  return (
                    <SingleCanvasRenderer
                      key={side.id}
                      side={side}
                      canvasState={sideCanvasState}
                      productColor={productColor}
                      width={canvasWidth}
                      height={canvasHeight}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default OrderCanvasRenderer;
export { SingleCanvasRenderer };
export type {
  OrderCanvasRendererProps,
  SingleCanvasRendererProps,
  OrderItem,
  Product,
  ProductSide,
};
