
'use client'
import React, {useEffect, useRef, useState} from 'react';
import * as fabric from "fabric";
import { ProductSide, ProductLayer, CanvasState, CustomFont } from '@/types/types';
import { useCanvasStore } from '@/store/useCanvasStore';
import ScaleBox from './ScaleBox';
import { formatMm } from '@/lib/canvasUtils';
// Import CurvedText to register the class with fabric.js for deserialization
import '@/lib/curvedText';
import { setupCurvedTextEditing, loadCustomFonts, isCurvedText } from '@/lib/curvedText';
import { fetchProductCalibrations } from '@/lib/calibrationFetch';

// Stable empty array to avoid creating a new reference on every render
// (prevents unnecessary effect re-fires when no custom fonts are provided)
const EMPTY_CUSTOM_FONTS: CustomFont[] = [];

interface SingleSideCanvasProps {
  side: ProductSide;
  /** Operational product id. When given, calibration mmPerPx is fetched and used for px↔mm. */
  productId?: string;
  width?: number; // these are optional because there will be a default value
  height?: number; // ''
  isEdit?: boolean; // whether canvas is in edit mode
  canvasState?: CanvasState | string | null;
  productColor?: string;
  onCanvasReady?: (canvas: fabric.Canvas, sideId: string, canvasScale: number) => void;
  renderFromCanvasStateOnly?: boolean;
  customFonts?: CustomFont[]; // Custom fonts to load before rendering
  showScaleBox?: boolean; // whether to show the scale box overlay (default true)
  enableZoomPan?: boolean; // enable mouse wheel zoom and space+drag pan (default false)
  onZoomChange?: (zoom: number) => void; // callback when zoom changes
}

const SingleSideCanvas: React.FC<SingleSideCanvasProps> = ({
  side,
  productId,
  width = 500,
  height = 500,
  isEdit = false,
  canvasState,
  productColor,
  onCanvasReady,
  renderFromCanvasStateOnly = false,
  customFonts = EMPTY_CUSTOM_FONTS,
  showScaleBox = true,
  enableZoomPan = false,
  onZoomChange,
}) => {
  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const isEditRef = useRef(isEdit);
  const productImageRef = useRef<fabric.FabricImage | null>(null);
  const layerImagesRef = useRef<Map<string, fabric.FabricImage>>(new Map());
  const loadSessionRef = useRef(0);
  const scaleRef = useRef(1);
  const suppressObjectAddedRef = useRef(false);
  const lastCanvasStateRef = useRef<string | null>(null);
  const lastCanvasSideRef = useRef<string | null>(null);
  /** Native mmPerPx fetched from product_calibrations. 0 = no calibration → legacy fallback. */
  const calibrationNativeMmPerPxRef = useRef<number>(0);

  const { registerCanvas, unregisterCanvas, productColor: productColorFromStore, markImageLoaded, incrementCanvasVersion, initializeLayerColors, layerColors, resetZoom, saveHistory, resetHistory } = useCanvasStore();

  // Fetch product calibration once per (productId, side.id). Stored on canvas
  // for downstream features (anchor preset snap, mm labels) — no destructive change.
  useEffect(() => {
    let cancelled = false;
    if (!productId) {
      calibrationNativeMmPerPxRef.current = 0;
      return;
    }
    fetchProductCalibrations(productId).then((map) => {
      if (cancelled) return;
      const cal = map.get(side.id);
      calibrationNativeMmPerPxRef.current = cal?.nativeMmPerPx ?? 0;
      const canvas = canvasRef.current;
      if (canvas) {
        // @ts-expect-error - Custom property
        canvas.calibrationNativeMmPerPx = calibrationNativeMmPerPxRef.current;
        canvas.requestRenderAll();
      }
    }).catch(() => {
      if (!cancelled) calibrationNativeMmPerPxRef.current = 0;
    });
    return () => { cancelled = true; };
  }, [productId, side.id]);

  // Loading state to track when all images are loaded
  const [isLoading, setIsLoading] = useState(true);

  // Track when layers are fully loaded and ready for color application
  const [layersReady, setLayersReady] = useState(false);

  // Scale box state
  const [scaleBoxVisible, setScaleBoxVisible] = useState(false);
  const [scaleBoxDimensions, setScaleBoxDimensions] = useState({
    x: '0mm',
    y: '0mm',
    width: '0mm',
    height: '0mm',
  });
  const [scaleBoxPosition, setScaleBoxPosition] = useState({ x: 0, y: 0 });

  const normalizeStacking = (canvas: fabric.Canvas, currentSide: ProductSide) => {
    const objects = canvas.getObjects();
    const backgroundObjects = objects.filter((obj) => {
      const objData = obj as { data?: { id?: string } };
      return objData.data?.id === 'background-product-image';
    });

    if (backgroundObjects.length > 0) {
      if (currentSide.layers && currentSide.layers.length > 0) {
        const layerOrder = new Map(currentSide.layers.map((layer) => [layer.id, layer.zIndex]));
        const sortedBackgrounds = [...backgroundObjects].sort((a, b) => {
          const aData = a as { data?: { layerId?: string } };
          const bData = b as { data?: { layerId?: string } };
          const aIndex = layerOrder.get(aData.data?.layerId ?? '') ?? 0;
          const bIndex = layerOrder.get(bData.data?.layerId ?? '') ?? 0;
          return aIndex - bIndex;
        });

        sortedBackgrounds.forEach((obj, index) => {
          canvas.moveObjectTo(obj, index);
        });
      } else {
        backgroundObjects.forEach((obj) => canvas.sendObjectToBack(obj));
      }
    }

    objects.forEach((obj) => {
      const objData = obj as { data?: { id?: string } };
      if (objData.data?.id === 'background-product-image') return;
      canvas.bringObjectToFront(obj);
    });
  };

  // Update isEdit ref when prop changes
  useEffect(() => {
    isEditRef.current = isEdit;
  }, [isEdit]);

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
    lastCanvasStateRef.current = null;
    lastCanvasSideRef.current = null;

    console.log(`[SingleSideCanvas] Initializing canvas for side: ${side.id}`);
    if (!canvasHostRef.current) {
      console.error(`[SingleSideCanvas] Canvas host element not found for side: ${side.id}`);
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

    fabric.InteractiveFabricObject.ownDefaults = {
    ...fabric.InteractiveFabricObject.ownDefaults,
    cornerStyle: 'circle',
    cornerColor: 'lightblue',
    transparentCorners: false,
    borderColor: 'blue',
    borderScaleFactor: 1,
}

    // Register this canvas to the global store
    console.log(`[SingleSideCanvas] Registering canvas for side: ${side.id}`);
    registerCanvas(side.id, canvas)
    console.log(`[SingleSideCanvas] Canvas registered for side: ${side.id}`);

    // Setup CurvedText double-click editing support
    setupCurvedTextEditing(canvas);


    // -- For calculations
    const printW = side.printArea.width;
    const printH = side.printArea.height;

    // Temporary centered position (will be updated when image loads)
    const tempCenteredLeft = (width - printW) / 2;
    const tempCenteredTop = (height - printH) / 2;
    const tempPrintCenterX = tempCenteredLeft + (printW / 2);

    // Check if side has layers (multi-layer mode) or single imageUrl (legacy mode)
    const hasLayers = side.layers && side.layers.length > 0;

    if (hasLayers) {
      // Multi-layer mode: Initialize layer colors and load all layers
      initializeLayerColors(side.id, side.layers!);

      // Sort layers by zIndex
      const sortedLayers = [...side.layers!].sort((a, b) => a.zIndex - b.zIndex);

      // Helper function to ensure image is fully loaded and decoded
      // This pre-loads the image using native Image() before passing to Fabric.js
      const ensureImageFullyLoaded = async (imageUrl: string, layerName: string, layerId: string, maxRetries = 3): Promise<fabric.FabricImage | null> => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          if (!isSessionActive()) return null;

          try {
            console.log(`[SingleSideCanvas] Attempt ${attempt}/${maxRetries}: Pre-loading image for ${layerName} (${layerId})`);

            // Step 1: Pre-load using native Image() to ensure it's fully available
            const nativeImg = new Image();
            nativeImg.crossOrigin = 'anonymous';

            // Create a promise that resolves when the image is fully loaded
            const imageLoadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
              let timeoutId: ReturnType<typeof setTimeout> | null = null;
              nativeImg.onload = () => {
                if (timeoutId) clearTimeout(timeoutId);
                console.log(`[SingleSideCanvas] Native image loaded: ${layerName} (${layerId}) - ${nativeImg.naturalWidth}x${nativeImg.naturalHeight}`);
                resolve(nativeImg);
              };
              nativeImg.onerror = (error) => {
                if (timeoutId) clearTimeout(timeoutId);
                console.error(`[SingleSideCanvas] Native image failed to load: ${layerName} (${layerId})`, error);
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
              console.log(`[SingleSideCanvas] Decoding image: ${layerName} (${layerId})`);
              await loadedImg.decode();
              console.log(`[SingleSideCanvas] Image decoded successfully: ${layerName} (${layerId})`);
            }
            if (!isSessionActive()) return null;

            // Step 3: Verify dimensions
            const imgWidth = loadedImg.naturalWidth;
            const imgHeight = loadedImg.naturalHeight;

            if (imgWidth === 0 || imgHeight === 0) {
              throw new Error(`Invalid dimensions: ${imgWidth}x${imgHeight}`);
            }

            console.log(`[SingleSideCanvas] Image verified with dimensions: ${imgWidth}x${imgHeight} for ${layerName} (${layerId})`);

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

            console.log(`[SingleSideCanvas] ✓ Successfully created Fabric image for ${layerName} (${layerId})`);
            return fabricImg;

          } catch (error) {
            console.error(`[SingleSideCanvas] Attempt ${attempt}/${maxRetries} failed for ${layerName} (${layerId}):`, error);

            if (attempt === maxRetries) {
              console.error(`[SingleSideCanvas] All ${maxRetries} attempts failed for ${layerName} (${layerId})`);
              return null;
            }

            // Wait before retrying (exponential backoff)
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`[SingleSideCanvas] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }

        return null;
      };

      // Load all layer images sequentially (one by one) to guarantee all images load
      const loadLayersSequentially = async () => {
        const validResults: Array<{ img: fabric.FabricImage; scale: number; imgWidth: number; imgHeight: number; layer: ProductLayer }> = [];

        console.log(`[SingleSideCanvas] Starting sequential loading of ${sortedLayers.length} layers for side: ${side.id}`);

        for (const layer of sortedLayers) {
          if (!isSessionActive()) break;

          try {
            console.log(`[SingleSideCanvas] Loading layer ${layer.name} (${layer.id})...`);
            const img = await ensureImageFullyLoaded(layer.imageUrl, layer.name, layer.id);
            if (!isSessionActive()) break;

            if (!img) {
              console.error(`[SingleSideCanvas] Failed to load layer ${layer.name} (${layer.id}), skipping...`);
              continue;
            }

            // Scale the image to fit the canvas
            const imgWidth = img.width || 0;
            const imgHeight = img.height || 0;

            const baseScale = Math.min(width / imgWidth, height / imgHeight);
            const scale = baseScale;

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
              shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 15, offsetX: 0, offsetY: 4 }),
              data: {
                id: 'background-product-image',
                layerId: layer.id
              },
            });

            // Store reference to this layer image (before applying filters)
            layerImagesRef.current.set(layer.id, img);

            console.log(`[SingleSideCanvas] Successfully loaded and configured layer: ${layer.name} (${layer.id}) with dimensions ${imgWidth}x${imgHeight} for side: ${side.id}`);
            validResults.push({ img, scale, imgWidth, imgHeight, layer });
          } catch (error) {
            // Catch individual layer loading errors to prevent one failure from breaking all layers
            console.error(`[SingleSideCanvas] Error loading layer: ${layer.name} (${layer.id}) from ${layer.imageUrl}`, error);
            // Continue to next layer instead of stopping the entire process
          }
        }

        return validResults;
      };

      // Execute sequential loading
      loadLayersSequentially().then((validResults) => {
        if (!isSessionActive()) return;

        if (validResults.length === 0) {
          console.error('[SingleSideCanvas] No valid layer images loaded');
          setIsLoading(false);
          return;
        }

        console.log(`[SingleSideCanvas] ${validResults.length}/${sortedLayers.length} layer images loaded successfully for side: ${side.id}`);

        // Use the first layer's dimensions for calculations
        const firstResult = validResults[0]!;
        const { scale, imgWidth, imgHeight } = firstResult;
        scaleRef.current = scale;

        // Add all layer images to canvas in z-index order (bottom to top)
        console.log(`[SingleSideCanvas] Adding ${sortedLayers.length} layers to canvas for side: ${side.id}`);

        let addedLayerCount = 0;

        // Parse canvasState to get initial layerColors
        const initialLayerColors = (() => {
          if (!canvasState) return {};
          if (typeof canvasState === 'string') {
            try {
              const parsed = JSON.parse(canvasState);
              return parsed?.layerColors || {};
            } catch {
              return {};
            }
          }
          return (canvasState as CanvasState)?.layerColors || {};
        })();

        console.log(`[SingleSideCanvas] Initial layerColors from canvasState:`, initialLayerColors);

        // Sync canvasState layer colors to store so user can override them later
        Object.entries(initialLayerColors).forEach(([layerId, color]) => {
          if (typeof color === 'string' && (color as string).startsWith('#')) {
            useCanvasStore.getState().setLayerColor(side.id, layerId, color as string);
          }
        });

        // Add layers to canvas and apply initial color filters immediately
        sortedLayers.forEach((layer) => {
          const layerImg = layerImagesRef.current.get(layer.id);
          if (layerImg) {
            // Apply initial color filter from canvasState
            const parsedProductColor = (() => {
              if (!canvasState) return null;
              const cs = typeof canvasState === 'string' ? (() => { try { return JSON.parse(canvasState); } catch { return null; } })() : canvasState;
              return typeof cs?.productColor === 'string' ? cs.productColor : null;
            })();
            const initialColor = (typeof initialLayerColors[layer.id] === 'string' && (initialLayerColors[layer.id] as string).startsWith('#'))
              ? (initialLayerColors[layer.id] as string)
              : parsedProductColor || layer.colorOptions[0]?.hex || '#FFFFFF';

            layerImg.filters = [];
            const colorFilter = new fabric.filters.BlendColor({
              color: initialColor,
              mode: 'multiply',
              alpha: 1,
            });
            layerImg.filters.push(colorFilter);
            layerImg.applyFilters();

            canvas.add(layerImg);
            addedLayerCount++;
            console.log(`[SingleSideCanvas] Added layer ${layer.name} (${layer.id}) to canvas with initial color: ${initialColor}`);
          } else {
            console.error(`[SingleSideCanvas] Layer image not found in ref for ${layer.name} (${layer.id})`);
          }
        });

        // Verify all layers were added
        if (addedLayerCount !== validResults.length) {
          console.error(`[SingleSideCanvas] Layer count mismatch: Added ${addedLayerCount} but expected ${validResults.length}`);
        }

        // Send all layers to the back in reverse order to maintain zIndex
        // This ensures layers are at the very bottom, below guide elements
        for (let i = sortedLayers.length - 1; i >= 0; i--) {
          const layer = sortedLayers[i];
          const layerImg = layerImagesRef.current.get(layer.id);
          if (layerImg) {
            canvas.sendObjectToBack(layerImg);
            console.log(`[SingleSideCanvas] Sent layer ${layer.name} (${layer.id}) to back`);
          }
        }

        // Debug: Log all objects on canvas
        console.log(`[SingleSideCanvas] Canvas now has ${canvas.getObjects().length} objects:`,
          canvas.getObjects().map((obj, i) => ({
            index: i,
            type: obj.type,
            // @ts-expect-error - Checking custom data property
            id: obj.data?.id,
            // @ts-expect-error - Checking custom data property
            layerId: obj.data?.layerId
          })));

        // Calculate print area position relative to the first layer
        const scaledPrintW = side.printArea.width * scale;
        const scaledPrintH = side.printArea.height * scale;
        const scaledPrintX = side.printArea.x * scale;
        const scaledPrintY = side.printArea.y * scale;

        const imageLeft = (width / 2) - (imgWidth * scale / 2);
        const imageTop = (height / 2) - (imgHeight * scale / 2);

        const printAreaLeft = imageLeft + scaledPrintX;
        const printAreaTop = imageTop + scaledPrintY;
        const printCenterX = printAreaLeft + (scaledPrintW / 2);

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
        canvas.printCenterX = printCenterX;
        // @ts-expect-error - Custom property
        canvas.originalImageWidth = imgWidth;
        // @ts-expect-error - Custom property
        canvas.originalImageHeight = imgHeight;
        // @ts-expect-error - Custom property
        canvas.scaledImageWidth = imgWidth * scale;
        // @ts-expect-error - Custom property
        canvas.scaledImageHeight = imgHeight * scale;
        // Mockup top-left in canvas px (mockup is centered, so non-zero).
        // @ts-expect-error - Custom property
        canvas.mockupCanvasLeft = imageLeft;
        // @ts-expect-error - Custom property
        canvas.mockupCanvasTop = imageTop;
        if (calibrationNativeMmPerPxRef.current > 0) {
          // @ts-expect-error - Custom property
          canvas.calibrationNativeMmPerPx = calibrationNativeMmPerPxRef.current;
        }

        // For multi-layer mode, store canvas center as the snap center
        // @ts-expect-error - Custom property
        canvas.printCenterX = width / 2;

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

          console.log(`[SingleSideCanvas] Verification: ${layerObjectsOnCanvas.length} layer objects rendered on canvas`);

          if (layerObjectsOnCanvas.length !== addedLayerCount) {
            console.warn(`[SingleSideCanvas] Canvas render verification failed: Expected ${addedLayerCount} layers but found ${layerObjectsOnCanvas.length}`);
          }

          // Mark image as loaded in store
          markImageLoaded(side.id);

          // All layers loaded, added, and rendered - mark as ready
          // Set layersReady to trigger the color application effect
          setLayersReady(true);
          setIsLoading(false);
          saveHistory(side.id); // Save initial (empty) history snapshot
          console.log(`[SingleSideCanvas] All layers loaded and rendered for side: ${side.id} ✓`);
        });
      }).catch((error) => {
        if (!isSessionActive()) return;
        console.error('[SingleSideCanvas] Error loading layer images:', error);
        setIsLoading(false);
      });
    } else {
      // Legacy single-image mode: use imageUrl
      const imageUrl = side.imageUrl;
      if (!imageUrl) {
        console.error('Side has no imageUrl or layers');
        setIsLoading(false);
        return;
      }

      // Helper function to ensure single image is fully loaded and decoded
      const loadSingleImage = async () => {
        try {
          // First, load the image using Fabric.js
          const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });

          if (!img) {
            console.error('[SingleSideCanvas] Failed to load image:', side.imageUrl);
            return null;
          }

          // Get the underlying HTMLImageElement
          const imgElement = img.getElement() as HTMLImageElement;

          // Ensure the image is fully loaded
          if (!imgElement.complete) {
            console.log(`[SingleSideCanvas] Waiting for single image to complete loading for side: ${side.id}`);
            await new Promise<void>((resolve, reject) => {
              imgElement.onload = () => resolve();
              imgElement.onerror = () => reject(new Error('Image failed to load'));
              // Add timeout to prevent infinite waiting
              setTimeout(() => reject(new Error('Image load timeout')), 30000);
            });
          }

          // Use the decode() API to ensure the image is fully decoded
          if (imgElement.decode) {
            console.log(`[SingleSideCanvas] Decoding single image for side: ${side.id}`);
            await imgElement.decode();
            console.log(`[SingleSideCanvas] Single image decoded successfully for side: ${side.id}`);
          }

          // Verify dimensions after decode
          const imgWidth = img.width || 0;
          const imgHeight = img.height || 0;

          if (imgWidth === 0 || imgHeight === 0) {
            console.error('[SingleSideCanvas] Image has invalid dimensions after decode:', imgWidth, 'x', imgHeight);
            return null;
          }

          console.log(`[SingleSideCanvas] Single image fully loaded and decoded with dimensions ${imgWidth}x${imgHeight} for side: ${side.id}`);
          return img;
        } catch (error) {
          console.error('[SingleSideCanvas] Error loading single image for', side.name, ':', error);
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

        // for changing the scaling of the image based on the canvas's width and height
        const baseScale = Math.min(width / imgWidth, height / imgHeight);
        const scale = baseScale;
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
          shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 15, offsetX: 0, offsetY: 4 }),
          data: { id: 'background-product-image' }, // Custom data to identify this as the background
        });

        // Store reference to the product image
        productImageRef.current = img;

        canvas.add(img);
        canvas.sendObjectToBack(img); // ensure it stays behind design elements

        // Parse canvasState to get productColor for initial filter
        const parsedCanvasState = (() => {
          if (!canvasState) return null;
          if (typeof canvasState === 'string') {
            try {
              return JSON.parse(canvasState);
            } catch {
              return null;
            }
          }
          return canvasState;
        })();

        // Apply initial color filter - prop (from order/design data) takes priority
        // over canvasState because a previous admin save may have persisted a stale
        // default (#FFFFFF) into canvasState.productColor.
        const initialProductColor = productColor || parsedCanvasState?.productColor || '#FFFFFF';
        // Only sync to global store in edit mode to allow user color changes
        if (isEdit) {
          useCanvasStore.getState().setProductColor(initialProductColor);
        }
        console.log(`[SingleSideCanvas] Single-image mode: applying initial productColor: ${initialProductColor} for side: ${side.id}`);

        img.filters = [];
        const initialColorFilter = new fabric.filters.BlendColor({
          color: initialProductColor,
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
        const printCenterX = printAreaLeft + (scaledPrintW / 2);

        // Store these values for use in event handlers and pricing calculations
        // @ts-expect-error - Adding custom properties to fabric.Canvas for print area tracking
        canvas.printAreaLeft = printAreaLeft;
        // @ts-expect-error - Custom property
        canvas.printAreaTop = printAreaTop;
        // @ts-expect-error - Custom property
        canvas.printAreaWidth = scaledPrintW;
        // @ts-expect-error - Custom property
        canvas.printAreaHeight = scaledPrintH;
        // @ts-expect-error - Custom property
        canvas.printCenterX = printCenterX;

        // Store original and scaled image dimensions for accurate pixel-to-mm conversion
        // @ts-expect-error - Custom property
        canvas.originalImageWidth = imgWidth;
        // @ts-expect-error - Custom property
        canvas.originalImageHeight = imgHeight;
        // @ts-expect-error - Custom property
        canvas.scaledImageWidth = imgWidth * scale;
        // @ts-expect-error - Custom property
        canvas.scaledImageHeight = imgHeight * scale;
        // Mockup top-left in canvas px (mockup is centered, so non-zero).
        // @ts-expect-error - Custom property
        canvas.mockupCanvasLeft = imageLeft;
        // @ts-expect-error - Custom property
        canvas.mockupCanvasTop = imageTop;
        if (calibrationNativeMmPerPxRef.current > 0) {
          // @ts-expect-error - Custom property
          canvas.calibrationNativeMmPerPx = calibrationNativeMmPerPxRef.current;
        }

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
            console.warn('[SingleSideCanvas] Canvas render verification failed: Product image not found on canvas');
          } else {
            console.log('[SingleSideCanvas] Verification: Product image successfully rendered on canvas');
          }

          // Mark image as loaded in store
          markImageLoaded(side.id);

          // Single image loaded and rendered - mark as ready
          setIsLoading(false);
          saveHistory(side.id); // Save initial (empty) history snapshot
          console.log(`[SingleSideCanvas] Single image loaded and rendered for side: ${side.id} ✓`);
        });
      })
      .catch((error) => {
        if (!isSessionActive()) return;
        console.error('[SingleSideCanvas] Error loading image for', side.name, ':', error);
        setIsLoading(false);
      });
    }

    // Helper function to update scale box with object dimensions
    const updateScaleBox = (obj: fabric.FabricObject | fabric.ActiveSelection) => {
        // Get the scaled product image width on the canvas
        // @ts-expect-error - Custom property
        const scaledImageWidth = canvas.scaledImageWidth;
        // @ts-expect-error - Custom property
        const scaledPrintLeft = canvas.printAreaLeft || 0;
        // @ts-expect-error - Custom property
        const scaledPrintTop = canvas.printAreaTop || 0;

        // Get real-world product width from product data
        const realWorldProductWidth = side.realLifeDimensions?.productWidthMm || 500; // Default to 500mm for t-shirts

        // Prefer calibration-based ratio (same source as anchor presets / pricing)
        // so the displayed mm match what the user picked in 자주 쓰는 위치.
        // @ts-expect-error - Custom property set by calibration effect
        const calibrationNative = (canvas.calibrationNativeMmPerPx as number | undefined) ?? 0;
        // @ts-expect-error - Custom property
        const originalImageWidth = canvas.originalImageWidth as number | undefined;
        const calibratedRatio =
          calibrationNative > 0 && originalImageWidth && scaledImageWidth
            ? calibrationNative / (scaledImageWidth / originalImageWidth)
            : 0;
        // Calculate pixel-to-mm ratio: calibration > legacy productWidthMm > 0.25 fallback.
        const pixelToMmRatio = calibratedRatio > 0
          ? calibratedRatio
          : (scaledImageWidth ? realWorldProductWidth / scaledImageWidth : 0.25);

        // Get object's bounding box dimensions (includes scale and rotation)
        // These are in the SCALED canvas coordinate system
        const boundingRect = obj.getBoundingRect();
        const objWidth = boundingRect.width;
        const objHeight = boundingRect.height;

        // Calculate object position relative to print area origin
        // Both values are in the same coordinate space (scaled canvas pixels)
        const objX = boundingRect.left - scaledPrintLeft;
        const objY = boundingRect.top - scaledPrintTop;

        // Convert to mm using the product-based ratio
        // This ensures consistent measurements with the pricing calculation
        const widthMm = objWidth * pixelToMmRatio;
        const heightMm = objHeight * pixelToMmRatio;
        const xMm = objX * pixelToMmRatio;
        const yMm = objY * pixelToMmRatio;

        setScaleBoxDimensions({
          x: formatMm(xMm),
          y: formatMm(yMm),
          width: formatMm(widthMm),
          height: formatMm(heightMm),
        });

        // Position below the object's bounding box at the horizontal center
        setScaleBoxPosition({
          x: boundingRect.left + boundingRect.width / 2,
          y: boundingRect.top + boundingRect.height + 10,
        });

        setScaleBoxVisible(true);
    };

    canvas.on('object:added', (e) => {
        const obj = e.target;
        if (!obj) return;

        // @ts-expect-error - Checking custom data property
        if (obj.data?.id === 'background-product-image') {
          normalizeStacking(canvas, side);
          return;
        }

        if (suppressObjectAddedRef.current) return;
        // Skip guide boxes and snap lines
        if (obj.excludeFromExport) return;

        // Assign a unique ID to each user-added object if it doesn't have one
        // @ts-expect-error - Setting custom data property
        if (!obj.data) obj.data = {};
        // @ts-expect-error - Setting custom data property
        if (!obj.data.objectId) {
          // @ts-expect-error - Setting custom data property
          obj.data.objectId = `${side.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }

        // Set default print method for non-image objects
        // @ts-expect-error - Checking custom data property
        if (obj.type !== 'image' && !obj.data.printMethod) {
          // @ts-expect-error - Setting custom data property
          obj.data.printMethod = 'printing'; // Default to printing
        }

        // Make objects selectable based on current edit mode
        obj.selectable = isEditRef.current;
        obj.evented = isEditRef.current;

        // Increment canvas version to trigger updates in components that depend on canvas state
        incrementCanvasVersion();
        saveHistory(side.id);

        normalizeStacking(canvas, side);
    })

    const snapThreshold = 10;

    // Update scale box during object transformations
    canvas.on('object:scaling', (e) => {
        if (e.target) {
          updateScaleBox(e.target);
        }
    });

    canvas.on('object:rotating', (e) => {
        if (e.target) {
          updateScaleBox(e.target);
        }
    });

    canvas.on('object:modified', (e) => {
        if (e.target) {
          updateScaleBox(e.target);
        }
        // Increment canvas version when object is modified (color, size, etc.)
        incrementCanvasVersion();
        saveHistory(side.id);
    });

    // Increment canvas version when object is removed
    canvas.on('object:removed', (e) => {
        const obj = e.target;
        // Skip guide boxes, snap lines, and background product image
        // @ts-expect-error - Checking custom data property
        if (!obj || obj.excludeFromExport || (obj.data?.id === 'background-product-image')) return;

        incrementCanvasVersion();
        saveHistory(side.id);
    });

    canvas.on('object:moving', (e) => {
        const obj = e.target;
        if (!obj) return; // for error handling if there is no object

        // Update scale box position during movement
        updateScaleBox(obj);
    });

    canvas.on('mouse:up', () => {
        canvas.requestRenderAll();
    });

    // Show scale box when object is selected
    canvas.on('selection:created', (e) => {
        const selected = e.selected;
        if (selected && selected.length > 0) {
          const activeObj = canvas.getActiveObject();
          if (activeObj) {
            updateScaleBox(activeObj);
          }
        }
    });

    // Update scale box when selection changes
    canvas.on('selection:updated', (e) => {
        const selected = e.selected;
        if (selected && selected.length > 0) {
          const activeObj = canvas.getActiveObject();
          if (activeObj) {
            updateScaleBox(activeObj);
          }
        }
    });

    // Hide scale box when selection is cleared
    canvas.on('selection:cleared', () => {
        setScaleBoxVisible(false);
    });

    return () => {
      isDisposed = true;
      loadSessionRef.current++;
      unregisterCanvas(side.id);
      canvas.dispose();
      canvasRef.current = null;
      if (canvasHostRef.current) {
        canvasHostRef.current.innerHTML = '';
      }
      canvasEl.current = null;
    };
    // Note: canvasState, initializeLayerColors, and productColor are intentionally excluded from dependencies
    // because we only want to initialize the canvas once when the side changes.
    // Subsequent canvasState/color changes are handled by the separate color application effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, height, width, registerCanvas, unregisterCanvas, markImageLoaded, incrementCanvasVersion]);

  // Separate effect to update selection state when isEdit changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Reset zoom when entering or exiting edit mode
    resetZoom(side.id);

    canvas.selection = isEdit;
    canvas.forEachObject((obj) => {
      // Skip guide boxes and snap lines
      if (obj.excludeFromExport) return;

      // Skip the product background image (check by ID)
      // @ts-expect-error - Checking custom data property
      if (obj.data?.id === 'background-product-image') {
        // Ensure background stays locked regardless of edit mode
        obj.selectable = false;
        obj.evented = false;
        return;
      }

      // Make all other objects (including user-added images) selectable/editable
      obj.selectable = isEdit;
      obj.evented = isEdit;
    });
    canvas.requestRenderAll();
  }, [isEdit, side.id, resetZoom]);

  // Effect for mouse wheel zoom and space+drag panning
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enableZoomPan) return;

    let isPanning = false;
    let spaceHeld = false;
    let lastPanPoint: { x: number; y: number } | null = null;

    const handleWheel = (opt: fabric.TEvent<WheelEvent>) => {
      const e = opt.e;
      e.preventDefault();
      e.stopPropagation();

      const delta = e.deltaY;
      const currentZoom = canvas.getZoom();
      const zoomFactor = 0.999 ** delta;
      let nextZoom = currentZoom * zoomFactor;
      nextZoom = Math.max(0.2, Math.min(5, nextZoom));

      const point = canvas.getScenePoint(e);
      canvas.zoomToPoint(point, nextZoom);
      canvas.requestRenderAll();
      onZoomChange?.(nextZoom);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceHeld) {
        spaceHeld = true;
        if (canvasHostRef.current) {
          canvasHostRef.current.style.cursor = 'grab';
        }
        // Temporarily disable object selection while panning
        canvas.selection = false;
        canvas.forEachObject((obj) => {
          const objData = obj as { data?: { id?: string } };
          if (objData.data?.id === 'background-product-image') return;
          obj.evented = false;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld = false;
        isPanning = false;
        lastPanPoint = null;
        if (canvasHostRef.current) {
          canvasHostRef.current.style.cursor = '';
        }
        // Restore selection state based on edit mode
        canvas.selection = isEditRef.current;
        canvas.forEachObject((obj) => {
          const objData = obj as { data?: { id?: string } };
          if (objData.data?.id === 'background-product-image') return;
          obj.evented = isEditRef.current;
        });
      }
    };

    const getClientXY = (e: MouseEvent | TouchEvent): { x: number; y: number } | null => {
      if ('clientX' in e) return { x: e.clientX, y: e.clientY };
      const touch = e.touches?.[0] || e.changedTouches?.[0];
      return touch ? { x: touch.clientX, y: touch.clientY } : null;
    };

    const handleMouseDown = (opt: fabric.TEvent<MouseEvent | TouchEvent>) => {
      if (spaceHeld) {
        isPanning = true;
        lastPanPoint = getClientXY(opt.e);
        if (canvasHostRef.current) {
          canvasHostRef.current.style.cursor = 'grabbing';
        }
        opt.e.preventDefault();
        opt.e.stopPropagation();
      }
    };

    const handleMouseMove = (opt: fabric.TEvent<MouseEvent | TouchEvent>) => {
      if (isPanning && lastPanPoint) {
        const point = getClientXY(opt.e);
        if (!point) return;
        const dx = point.x - lastPanPoint.x;
        const dy = point.y - lastPanPoint.y;
        const vpt = canvas.viewportTransform;
        if (vpt) {
          vpt[4] += dx;
          vpt[5] += dy;
          canvas.setViewportTransform(vpt);
        }
        lastPanPoint = point;
        opt.e.preventDefault();
        opt.e.stopPropagation();
      }
    };

    const handleMouseUp = () => {
      if (isPanning) {
        isPanning = false;
        lastPanPoint = null;
        if (canvasHostRef.current && spaceHeld) {
          canvasHostRef.current.style.cursor = 'grab';
        }
      }
    };

    canvas.on('mouse:wheel', handleWheel);
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      canvas.off('mouse:wheel', handleWheel);
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [enableZoomPan, onZoomChange]);

  // Sync canvasState colors to store when canvasState changes (e.g., switching templates)
  // This ensures the store is the single source of truth for colors
  useEffect(() => {
    if (!canvasState) return;

    const parsed = (() => {
      if (typeof canvasState === 'string') {
        try { return JSON.parse(canvasState); } catch { return null; }
      }
      return canvasState;
    })();

    if (!parsed) return;

    const hasLayers = side.layers && side.layers.length > 0;

    if (hasLayers && parsed.layerColors) {
      Object.entries(parsed.layerColors as Record<string, string>).forEach(([layerId, color]) => {
        if (typeof color === 'string' && (color as string).startsWith('#')) {
          useCanvasStore.getState().setLayerColor(side.id, layerId, color as string);
        }
      });
    } else if (!hasLayers && parsed.productColor && isEdit && !productColor) {
      // Only sync canvasState.productColor to store when no prop is provided.
      // When productColor prop exists (order/design mode), it is the authoritative
      // source and has already been synced to the store by UnifiedEditor.
      useCanvasStore.getState().setProductColor(parsed.productColor);
    }
  }, [canvasState, side.id, side.layers, isEdit, productColor]);

  // Effect to apply color filter when productColor changes (legacy single-image mode)
  // Only applies in edit mode - preview canvases use their initial color and don't react to store changes
  useEffect(() => {
    if (!isEdit) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Only apply in legacy mode (when side has no layers)
    if (side.layers && side.layers.length > 0) return;

    // Use store as the single source of truth (synced from canvasState by the sync effect above)
    const color = productColorFromStore;
    console.log(`[SingleSideCanvas] Single-image mode effect: applying productColor: ${color} for side: ${side.id}`);

    // Find all objects with id 'background-product-image' and apply color filter
    canvas.forEachObject((obj) => {
      // @ts-expect-error - Checking custom data property
      if (obj.data?.id === 'background-product-image' && obj.type === 'image') {
        const imgObj = obj as fabric.FabricImage;

        // Remove any existing filters
        imgObj.filters = [];

        const colorFilter = new fabric.filters.BlendColor({
          color: color,
          mode: 'multiply',
          alpha: 1,
        });

        imgObj.filters.push(colorFilter);
        imgObj.applyFilters();
      }
    });

    canvas.requestRenderAll();
  }, [productColorFromStore, side.layers, side.id]);

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
          console.error('[SingleSideCanvas] Failed to parse canvas state:', error);
          return null;
        }
      }
      return canvasState;
    })();

    if (!parsedState || !parsedState.objects) return;

    // Set guard refs SYNCHRONOUSLY before starting async work.
    // This prevents a race condition where re-renders (e.g., from toggling edit mode)
    // cause this effect to fire again while the async applyObjects is still running,
    // which would result in objects being added to the canvas twice.
    lastCanvasStateRef.current = serializedState;
    lastCanvasSideRef.current = side.id;

    const existingObjects = canvas.getObjects().filter((obj) => {
      if (obj.excludeFromExport) return false;
      const objData = obj as { data?: { id?: string } };
      return objData.data?.id !== 'background-product-image';
    });

    existingObjects.forEach((obj) => canvas.remove(obj));

    const getBackgroundObjects = () =>
      canvas.getObjects().filter((obj) => {
        const objData = obj as { data?: { id?: string } };
        return objData.data?.id === 'background-product-image';
      });

    const waitForBackground = async () => {
      const maxFrames = 20;
      for (let i = 0; i < maxFrames; i++) {
        const backgroundObjects = getBackgroundObjects();
        if (backgroundObjects.length > 0) {
          return backgroundObjects;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return getBackgroundObjects();
    };

    const applyObjects = async () => {
      await waitForBackground();

      // Load custom fonts before enliving objects that may use them
      if (customFonts.length > 0) {
        console.log(`[SingleSideCanvas] Loading ${customFonts.length} custom font(s) before rendering...`);
        await loadCustomFonts(customFonts.map(f => ({ fontFamily: f.fontFamily, url: f.url })));
        // Wait for document fonts to be ready (ensures FontFace API fonts are fully available)
        if (typeof document !== 'undefined' && document.fonts?.ready) {
          await document.fonts.ready;
        }
        console.log(`[SingleSideCanvas] Custom fonts loaded and ready.`);
      }

      suppressObjectAddedRef.current = true; // Always suppress during state loading to avoid per-object history entries
      const objects = await fabric.util.enlivenObjects(parsedState.objects);

      objects.forEach((obj) => {
        if (!obj || typeof obj !== 'object' || !('type' in obj)) return;

        const fabricObj = obj as fabric.FabricObject;

        fabricObj.selectable = isEditRef.current;
        fabricObj.evented = isEditRef.current;
        canvas.add(fabricObj);
        canvas.bringObjectToFront(fabricObj);

        // For text objects, recalculate dimensions to ensure custom fonts render correctly
        const objType = fabricObj.type?.toLowerCase() || '';
        if (objType === 'i-text' || objType === 'itext' || objType === 'text' || objType === 'textbox') {
          const textObj = fabricObj as fabric.IText | fabric.Text | fabric.Textbox;
          // Force text measurement recalculation with loaded font
          if ('initDimensions' in textObj && typeof textObj.initDimensions === 'function') {
            textObj.initDimensions();
          }
          textObj.setCoords();
        } else if (isCurvedText(fabricObj)) {
          // For CurvedText, call updateBounds to recalculate with the loaded font
          fabricObj.updateBounds();
        }
      });

      normalizeStacking(canvas, side);
      try {
        const { restoreDesignerPendingBadges } = await import('./designerPendingBadge');
        restoreDesignerPendingBadges(canvas);
      } catch (err) {
        console.error('[SingleSideCanvas] Failed to restore designer-pending badges:', err);
      }
      canvas.requestRenderAll();

      // Additional render pass after a short delay to ensure fonts are applied
      if (customFonts.length > 0) {
        requestAnimationFrame(() => {
          canvas.getObjects().forEach((obj) => {
            const objType = obj.type?.toLowerCase() || '';
            if (objType === 'i-text' || objType === 'itext' || objType === 'text' || objType === 'textbox') {
              obj.setCoords();
              obj.dirty = true;
            } else if (isCurvedText(obj)) {
              // For CurvedText, updateBounds recalculates dimensions with the loaded font
              obj.updateBounds();
            }
          });
          canvas.requestRenderAll();
        });
      }
      // Re-apply color filter after object restoration. The productColor prop
      // (from order/design data) takes priority over canvasState.productColor
      // which may contain a stale default (#FFFFFF) from a previous buggy save.
      const reapplyColor = productColor || (parsedState?.productColor as string) || null;
      if (!hasLayers && reapplyColor) {
        canvas.getObjects().forEach((obj) => {
          const objData = obj as { data?: { id?: string } };
          if (objData.data?.id === 'background-product-image' && obj.type === 'image') {
            const imgObj = obj as fabric.FabricImage;
            imgObj.filters = [];
            const colorFilter = new fabric.filters.BlendColor({
              color: reapplyColor,
              mode: 'multiply',
              alpha: 1,
            });
            imgObj.filters.push(colorFilter);
            imgObj.applyFilters();
          }
        });
        canvas.requestRenderAll();
      }

      suppressObjectAddedRef.current = false;
      resetHistory(side.id); // Reset history so loaded state becomes the initial state

      if (onCanvasReady) {
        onCanvasReady(canvas, side.id, scaleRef.current);
      }

      // Signal that objects are loaded so consumers like objectPreviews can regenerate.
      // Use rAF to ensure the canvas has painted the new objects before previews are captured.
      requestAnimationFrame(() => {
        incrementCanvasVersion();
      });
    };

    applyObjects().catch(() => {
      // If applyObjects fails, reset the guard refs so a retry can succeed
      lastCanvasStateRef.current = null;
      lastCanvasSideRef.current = null;
    });
  }, [canvasState, customFonts, height, isLoading, layersReady, onCanvasReady, renderFromCanvasStateOnly, side, width]);

  // Effect to apply color filter to layers when layerColors change or layers are ready
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Only apply in multi-layer mode
    if (!side.layers || side.layers.length === 0) return;

    // Wait for layers to be loaded before applying colors
    if (!layersReady) {
      console.log(`[SingleSideCanvas] Waiting for layers to be ready before applying colors for side: ${side.id}`);
      return;
    }

    // Use store as the single source of truth (synced from canvasState by the sync effect)
    console.log(`[SingleSideCanvas] Applying color filters to ${side.layers.length} layers for side: ${side.id}`);
    console.log(`[SingleSideCanvas] store layerColors for side:`, layerColors[side.id]);

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
    let colorsApplied = 0;
    side.layers.forEach((layer) => {
      const canvasLayerImages = layerImagesById.get(layer.id) || [];
      const refLayerImage = layerImagesRef.current.get(layer.id);
      const layerImages = canvasLayerImages.length > 0
        ? canvasLayerImages
        : (refLayerImage ? [refLayerImage] : []);

      if (layerImages.length === 0) {
        console.warn(`[SingleSideCanvas] Layer image not found for ${layer.name} (${layer.id}) when applying colors`);
        return;
      }

      // Use store color as the single source of truth (synced from canvasState by the sync effect)
      const storeColor = layerColors[side.id]?.[layer.id];
      const defaultColor = layer.colorOptions[0]?.hex || '#FFFFFF';
      const selectedColor = (typeof storeColor === 'string' && storeColor.startsWith('#'))
        ? storeColor
        : defaultColor;

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
        colorsApplied++;
      });

      console.log(`[SingleSideCanvas] Applied color ${selectedColor} to ${layerImages.length} image(s) for layer ${layer.name} (${layer.id}) [source: ${storeColor ? 'store' : 'default'}]`);
    });

    console.log(`[SingleSideCanvas] Successfully applied colors to ${colorsApplied}/${side.layers.length} layers for side: ${side.id}`);

    canvas.requestRenderAll();
  }, [layerColors, side.id, side.layers, layersReady]);

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
      {showScaleBox && (
        <ScaleBox
          x={scaleBoxDimensions.x}
          y={scaleBoxDimensions.y}
          width={scaleBoxDimensions.width}
          height={scaleBoxDimensions.height}
          position={scaleBoxPosition}
          visible={scaleBoxVisible}
        />
      )}
    </div>
  )
}

export default SingleSideCanvas;
