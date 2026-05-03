import React, { useState, useMemo, useEffect } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '@/store/useCanvasStore';
import { Plus, TextCursor, Layers, FileImage, Trash2, RefreshCcw, ZoomIn, ZoomOut, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown, Undo2, Redo2 } from 'lucide-react';
import { ProductSide } from '@/types/types';
import TextStylePanel from './TextStylePanel';
import { isCurvedText } from '@/lib/curvedText';
import { uploadFileToStorage } from '@/lib/supabase-storage';
import { STORAGE_BUCKETS, STORAGE_FOLDERS } from '@/lib/storage-config';
import { createClient } from '@/lib/supabase-client';
import { convertToPNG, isAiOrPsdFile, getConversionErrorMessage, MAX_UPLOAD_BYTES } from '@/lib/imageConvert';
import LoadingModal from '@/components/LoadingModal';
import { fetchProductCalibrations, calibrationToCanvasMmPerPx } from '@/lib/calibrationFetch';
import type { AnchorPreset } from '@/lib/anchorPresets';
import { snapArtworkToAnchor } from '@/lib/anchorSnap';
import { drawAnchorPreviews, clearAnchorPreviews } from './anchorPreviewLayer';
import AnchorPresetPanel from './AnchorPresetPanel';
import {
  BackgroundRemovalFlow,
  type DesignerRequestPayload,
  type FlowResult,
} from '@/components/background-removal/BackgroundRemovalFlow';
import {
  addDesignerPendingBadge,
  removeDesignerPendingBadge,
} from './designerPendingBadge';
import {
  submitDesignerRequest,
  markDesignerRequestCompleted,
} from '@/lib/designerRequest';
import { useAuthStore } from '@/store/useAuthStore';
import { isAdminLike } from '@/lib/auth-helpers';

interface ToolbarProps {
  sides?: ProductSide[];
  handleExitEditMode?: () => void;
  variant?: 'mobile' | 'desktop' | 'editor';
  horizontal?: boolean;
  onSelectedObjectChange?: (obj: fabric.FabricObject | null) => void;
  /** Operational product id for fetching anchor presets and calibration. */
  productId?: string;
}

const Toolbar: React.FC<ToolbarProps> = ({ sides = [], handleExitEditMode, variant = 'mobile', horizontal = false, onSelectedObjectChange, productId }) => {
  const { getActiveCanvas, activeSideId, setActiveSide, isEditMode, canvasMap, incrementCanvasVersion, zoomIn, zoomOut, getZoomLevel, undo, redo, canUndo, canRedo } = useCanvasStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [color, setColor] = useState("");
  const currentZoom = getZoomLevel();
  const isDesktop = variant === 'desktop' || variant === 'editor';

  // Loading modal state
  const [isLoadingModalOpen, setIsLoadingModalOpen] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingSubmessage, setLoadingSubmessage] = useState('');

  // Image upload popup state
  const [isImagePopupOpen, setIsImagePopupOpen] = useState(false);
  const [imageUploadAgreed, setImageUploadAgreed] = useState(false);

  // Background-removal modal state. Single-file uploads route through this
  // flow; batch (multi-file) uploads bypass it and use the existing path.
  type BgPending = {
    pngFile: File;
    sourceFile: File;
    sourceUrl: string | null;
    sourcePath: string | null;
  };
  const [bgPending, setBgPending] = useState<BgPending | null>(null);
  const [bgModalOpen, setBgModalOpen] = useState(false);
  const [designerPayload, setDesignerPayload] = useState<DesignerRequestPayload | null>(null);

  // Admin role gate for the "이미지 교체" button on designer-pending objects.
  const userRole = useAuthStore((s) => s.user?.role);
  const isAdmin = isAdminLike(userRole);
  // const canvas = getActiveCanvas();

  // Anchor preset state.
  const [isAnchorPanelOpen, setIsAnchorPanelOpen] = useState(false);
  const [sideAnchors, setSideAnchors] = useState<AnchorPreset[]>([]);
  const [nativeMmPerPxForSide, setNativeMmPerPxForSide] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    if (!productId || !activeSideId) {
      setSideAnchors([]);
      setNativeMmPerPxForSide(0);
      return;
    }
    fetchProductCalibrations(productId).then((map) => {
      if (cancelled) return;
      const cal = map.get(activeSideId);
      setSideAnchors(cal?.anchors ?? []);
      setNativeMmPerPxForSide(cal?.nativeMmPerPx ?? 0);
    }).catch(() => {
      if (!cancelled) {
        setSideAnchors([]);
        setNativeMmPerPxForSide(0);
      }
    });
    return () => { cancelled = true; };
  }, [productId, activeSideId]);

  const resolveCanvasGeometry = (): {
    mmPerPx: number;
    mockupLeft: number;
    mockupTop: number;
  } | null => {
    const canvas = getActiveCanvas();
    if (!canvas) return null;
    // @ts-expect-error - Custom property
    const sw = canvas.scaledImageWidth as number | undefined;
    // @ts-expect-error - Custom property
    const ow = canvas.originalImageWidth as number | undefined;
    // @ts-expect-error - Custom property
    const mockupLeft = (canvas.mockupCanvasLeft as number | undefined) ?? 0;
    // @ts-expect-error - Custom property
    const mockupTop = (canvas.mockupCanvasTop as number | undefined) ?? 0;
    if (nativeMmPerPxForSide > 0 && sw && ow) {
      const r = calibrationToCanvasMmPerPx({
        nativeMmPerPx: nativeMmPerPxForSide,
        scaledImageWidth: sw,
        originalImageWidth: ow,
      });
      if (r) return { mmPerPx: r, mockupLeft, mockupTop };
    }
    // @ts-expect-error - Custom property
    const realW = (canvas.realWorldProductWidth as number | undefined) ?? 500;
    if (sw && sw > 0 && realW > 0) {
      return { mmPerPx: realW / sw, mockupLeft, mockupTop };
    }
    return null;
  };

  useEffect(() => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    if (isAnchorPanelOpen && sideAnchors.length > 0) {
      const geo = resolveCanvasGeometry();
      if (geo) {
        drawAnchorPreviews(canvas, sideAnchors, {
          canvasMmPerPx: geo.mmPerPx,
          mockupCanvasLeft: geo.mockupLeft,
          mockupCanvasTop: geo.mockupTop,
        });
      }
    } else {
      clearAnchorPreviews(canvas);
    }
    return () => {
      clearAnchorPreviews(canvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnchorPanelOpen, sideAnchors, activeSideId, nativeMmPerPxForSide]);

  const handlePickAnchor = (anchor: AnchorPreset) => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const target = canvas.getActiveObject();
    if (!target) return;
    const geo = resolveCanvasGeometry();
    if (!geo) return;
    const ok = snapArtworkToAnchor({
      obj: target,
      anchor,
      canvasMmPerPx: geo.mmPerPx,
      mockupCanvasLeft: geo.mockupLeft,
      mockupCanvasTop: geo.mockupTop,
    });
    if (ok) {
      canvas.requestRenderAll();
      incrementCanvasVersion();
      setIsAnchorPanelOpen(false);
    }
  };

  const hasAnchors = sideAnchors.length > 0;
  const hasSelectedArtwork = !!selectedObject;

  const handleObjectSelection = (object : fabric.FabricObject | null) => {
    // console.log('handleObjectSelection called with:', object?.type);

    if (!object) {
      setSelectedObject(null);
      onSelectedObjectChange?.(null);
      return;
    }

    setSelectedObject(object);
    onSelectedObjectChange?.(object);

    if (object.type === "i-text" || object.type === "text") {
    }
  }

  // Resetting states
  const clearSettings = () => {
    setColor("");
  }

  useEffect(() => {
    const canvas = getActiveCanvas();
    if (!canvas) {
      setSelectedObject(null);
      return;
    }

    // Clear any existing selection when switching canvases
    setSelectedObject(null);

    const handleSelectionCreated = (options: { selected: fabric.FabricObject[] }) => {
      const selected = options.selected?.[0] || canvas.getActiveObject();
      handleObjectSelection(selected || null);
    };

    const handleSelectionUpdated = (options: { selected: fabric.FabricObject[]; deselected: fabric.FabricObject[] }) => {
      const selected = options.selected?.[0] || canvas.getActiveObject();
      handleObjectSelection(selected || null);
    };

    const handleSelectionCleared = () => {
      handleObjectSelection(null);
      clearSettings();
    };

    const handleObjectModified = (options: { target?: fabric.FabricObject }) => {
      const target = options.target || canvas.getActiveObject();
      handleObjectSelection(target || null);
      // Trigger pricing recalculation when object is modified (scaled, rotated, etc.)
      incrementCanvasVersion();
    };

    const handleObjectScaling = (options: { target?: fabric.FabricObject }) => {
      const target = options.target || canvas.getActiveObject();
      handleObjectSelection(target || null);
      // Trigger pricing recalculation when object is scaling
      incrementCanvasVersion();
    };

    canvas.on("selection:created", handleSelectionCreated);
    canvas.on("selection:updated", handleSelectionUpdated);
    canvas.on("selection:cleared", handleSelectionCleared);
    canvas.on("object:modified", handleObjectModified);
    canvas.on("object:scaling", handleObjectScaling);

    return () => {
      console.log('Cleaning up canvas event listeners');
      canvas.off("selection:created", handleSelectionCreated);
      canvas.off("selection:updated", handleSelectionUpdated);
      canvas.off("selection:cleared", handleSelectionCleared);
      canvas.off("object:modified", handleObjectModified);
      canvas.off("object:scaling", handleObjectScaling);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSideId, canvasMap]);
  
  


  const addText = () => {
    const canvas = getActiveCanvas();
    if (!canvas) return; // for error handling

    const text = new fabric.IText('텍스트', {
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Arial',
      fill: '#333',
      fontSize: 30,
    })

    canvas.add(text);
    canvas.setActiveObject(text); // set the selected object to the text once created
    canvas.renderAll();  // render the new object

    // Manually trigger selection handler for newly created text
    handleObjectSelection(text);

    // Trigger pricing recalculation
    incrementCanvasVersion();
  };

  const handleAddImageClick = () => {
    console.log('handleAddImageClick called - showing modal');
    setImageUploadAgreed(false);
    setIsImagePopupOpen(true);
  };

  const handleImagePopupConfirm = () => {
    if (!imageUploadAgreed) return;
    setIsImagePopupOpen(false);
    addImage();
  };

  const addSingleImageToCanvas = async (file: File, canvas: fabric.Canvas) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      alert(
        `파일이 너무 큽니다 (현재 ${mb}MB / 최대 50MB)\n\n` +
        `아래 방법 중 하나로 진행해주세요:\n` +
        `1) 더 작은 파일(최대 50MB)로 다시 업로드\n` +
        `2) 디자인을 완료한 뒤 [주문 요청사항] 탭에서 첨부파일로 추가\n` +
        `3) modoo.contact@gmail.com 으로 원본 파일 전달`
      );
      return;
    }

    const supabase = createClient();

    let displayUrl: string;
    let originalFileUploadResult;

    if (isAiOrPsdFile(file)) {
      console.log('AI/PSD file detected, converting to PNG...');

      setLoadingMessage('파일 변환 중...');
      setLoadingSubmessage(`${file.name} - AI/PSD 파일을 PNG로 변환하고 있습니다. (최대 수 분 소요)`);
      setIsLoadingModalOpen(true);

      // Conversion + original-file upload run in parallel.
      const [conversionResult, origUploadResult] = await Promise.all([
        convertToPNG(file, (msg) => setLoadingSubmessage(`${file.name} - ${msg}`)),
        uploadFileToStorage(
          supabase,
          file,
          STORAGE_BUCKETS.USER_DESIGNS,
          STORAGE_FOLDERS.IMAGES
        ),
      ]);

      if (!conversionResult.success || !conversionResult.pngBlob) {
        setIsLoadingModalOpen(false);
        const errorMessage = getConversionErrorMessage(conversionResult.error);
        console.error('Conversion failed:', conversionResult.error);
        alert(errorMessage);
        return;
      }

      if (!origUploadResult.success || !origUploadResult.url) {
        setIsLoadingModalOpen(false);
        const rawErr = origUploadResult.error || '';
        console.error('Failed to upload original file:', rawErr);
        const friendly = rawErr.includes('exceeded the maximum')
          ? '파일 용량이 서버 한도를 초과했습니다 (최대 50MB).\n\n' +
            '아래 방법 중 하나로 진행해주세요:\n' +
            '1) 더 작은 파일(최대 50MB)로 다시 업로드\n' +
            '2) 디자인을 완료한 뒤 [주문 요청사항] 탭에서 첨부파일로 추가\n' +
            '3) modoo.contact@gmail.com 으로 원본 파일 전달'
          : `원본 파일 업로드에 실패했습니다.\n사유: ${rawErr || '알 수 없음'}`;
        alert(friendly);
        return;
      }

      originalFileUploadResult = origUploadResult;

      setLoadingMessage('파일 업로드 중...');
      setLoadingSubmessage(`${file.name} - 변환된 PNG를 저장하고 있습니다.`);

      const pngFile = new File([conversionResult.pngBlob], `${file.name.split('.')[0]}.png`, {
        type: 'image/png',
      });

      const pngUploadResult = await uploadFileToStorage(
        supabase,
        pngFile,
        STORAGE_BUCKETS.USER_DESIGNS,
        STORAGE_FOLDERS.IMAGES
      );

      if (!pngUploadResult.success || !pngUploadResult.url) {
        setIsLoadingModalOpen(false);
        const rawErr = pngUploadResult.error || '';
        console.error('Failed to upload PNG:', rawErr);
        const friendly = rawErr.includes('exceeded the maximum')
          ? '변환된 PNG가 서버 한도를 초과했습니다 (최대 50MB).\n\n' +
            '아래 방법 중 하나로 진행해주세요:\n' +
            '1) 더 작은 파일(최대 50MB)로 다시 업로드\n' +
            '2) 디자인을 완료한 뒤 [주문 요청사항] 탭에서 첨부파일로 추가\n' +
            '3) modoo.contact@gmail.com 으로 원본 파일 전달'
          : `변환된 이미지 업로드에 실패했습니다.\n사유: ${rawErr || '알 수 없음'}`;
        alert(friendly);
        return;
      }

      displayUrl = pngUploadResult.url;
    } else {
      originalFileUploadResult = await uploadFileToStorage(
        supabase,
        file,
        STORAGE_BUCKETS.USER_DESIGNS,
        STORAGE_FOLDERS.IMAGES
      );

      if (!originalFileUploadResult.success || !originalFileUploadResult.url) {
        const rawErr = originalFileUploadResult.error || '';
        console.error('Failed to upload image:', rawErr);
        const friendly = rawErr.includes('exceeded the maximum')
          ? '파일 용량이 서버 한도를 초과했습니다 (최대 50MB).\n\n' +
            '아래 방법 중 하나로 진행해주세요:\n' +
            '1) 더 작은 파일(최대 50MB)로 다시 업로드\n' +
            '2) 디자인을 완료한 뒤 [주문 요청사항] 탭에서 첨부파일로 추가\n' +
            '3) modoo.contact@gmail.com 으로 원본 파일 전달'
          : `이미지 업로드에 실패했습니다: ${file.name}\n사유: ${rawErr || '알 수 없음'}`;
        alert(friendly);
        return;
      }

      displayUrl = originalFileUploadResult.url;
    }

    const img = await fabric.FabricImage.fromURL(displayUrl, {
      crossOrigin: 'anonymous',
    });

    const maxWidth = canvas.width * 0.5;
    const maxHeight = canvas.height * 0.5;

    if (img.width > maxWidth || img.height > maxHeight) {
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
      img.scale(scale);
    }

    img.set({
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center',
    });

    // @ts-expect-error - Adding custom data property to FabricImage
    img.data = {
      // @ts-expect-error - Reading data property
      ...(img.data || {}),
      supabaseUrl: displayUrl,
      supabasePath: originalFileUploadResult.path,
      originalFileUrl: originalFileUploadResult.url,
      originalFileName: file.name,
      fileType: file.type || 'unknown',
      isConverted: isAiOrPsdFile(file),
      uploadedAt: new Date().toISOString(),
    };

    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.renderAll();
    incrementCanvasVersion();
  };

  const addImage = async () => {
    console.log('addImage called - opening file picker');
    const canvas = getActiveCanvas();
    if (!canvas) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.ai,.psd';
    input.multiple = true;

    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const files = target.files;
      if (!files || files.length === 0) return;

      const fileList = Array.from(files);

      // Single-file upload → background-removal flow (lets the user choose
      // bg removal / keep / delegate to designer). Batch uploads bypass the
      // modal to keep the existing "drop many files at once" workflow snappy.
      if (fileList.length === 1) {
        await routeSingleFileThroughBgRemoval(fileList[0]);
        return;
      }

      const totalCount = fileList.length;
      const hasConvertible = fileList.some(isAiOrPsdFile);

      if (totalCount > 1 || hasConvertible) {
        setLoadingMessage('이미지 업로드 중...');
        setLoadingSubmessage(`${totalCount}개 파일 처리 중...`);
        setIsLoadingModalOpen(true);
      }

      let successCount = 0;
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (totalCount > 1) {
          setLoadingSubmessage(`(${i + 1}/${totalCount}) ${file.name} 처리 중...`);
        }
        try {
          await addSingleImageToCanvas(file, canvas);
          successCount++;
        } catch (error) {
          console.error(`Error adding image ${file.name}:`, error);
        }
      }

      if (totalCount > 1 || hasConvertible) {
        setLoadingMessage('완료!');
        setLoadingSubmessage(`${successCount}개 파일이 추가되었습니다.`);
        setIsLoadingModalOpen(true);
        setTimeout(() => setIsLoadingModalOpen(false), 1500);
      } else {
        setIsLoadingModalOpen(false);
      }
    };

    input.click();
  };

  // Single-file path: convert AI/PSD if needed, then open BackgroundRemovalFlow.
  // Result is uploaded + placed via handleBgComplete.
  const routeSingleFileThroughBgRemoval = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      alert(
        `파일이 너무 큽니다 (현재 ${mb}MB / 최대 50MB)\n\n` +
        `아래 방법 중 하나로 진행해주세요:\n` +
        `1) 더 작은 파일(최대 50MB)로 다시 업로드\n` +
        `2) 디자인을 완료한 뒤 [주문 요청사항] 탭에서 첨부파일로 추가\n` +
        `3) modoo.contact@gmail.com 으로 원본 파일 전달`,
      );
      return;
    }

    try {
      const supabase = createClient();
      if (isAiOrPsdFile(file)) {
        setLoadingMessage('파일 변환 중...');
        setLoadingSubmessage(`${file.name} - AI/PSD 파일을 PNG로 변환하고 있습니다. (최대 수 분 소요)`);
        setIsLoadingModalOpen(true);

        const [conversionResult, origUploadResult] = await Promise.all([
          convertToPNG(file, (msg) => setLoadingSubmessage(`${file.name} - ${msg}`)),
          uploadFileToStorage(supabase, file, STORAGE_BUCKETS.USER_DESIGNS, STORAGE_FOLDERS.IMAGES),
        ]);
        setIsLoadingModalOpen(false);

        if (!conversionResult.success || !conversionResult.pngBlob) {
          alert(getConversionErrorMessage(conversionResult.error));
          return;
        }
        if (!origUploadResult.success || !origUploadResult.url) {
          alert(`원본 파일 업로드에 실패했습니다.\n사유: ${origUploadResult.error || '알 수 없음'}`);
          return;
        }

        const pngFile = new File(
          [conversionResult.pngBlob],
          `${file.name.split('.')[0]}.png`,
          { type: 'image/png' },
        );
        setBgPending({
          pngFile,
          sourceFile: file,
          sourceUrl: origUploadResult.url,
          sourcePath: origUploadResult.path ?? null,
        });
        setDesignerPayload(null);
        setBgModalOpen(true);
      } else {
        setBgPending({
          pngFile: file,
          sourceFile: file,
          sourceUrl: null,
          sourcePath: null,
        });
        setDesignerPayload(null);
        setBgModalOpen(true);
      }
    } catch (error) {
      setIsLoadingModalOpen(false);
      console.error('Error preparing image for bg-removal:', error);
      alert('이미지 추가 중 오류가 발생했습니다.');
    }
  };

  const handleBgCancel = () => {
    setBgModalOpen(false);
    setBgPending(null);
    setDesignerPayload(null);
  };

  const handleBgComplete = async (result: FlowResult) => {
    if (!bgPending) return;
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const pending = bgPending;
    setBgModalOpen(false);

    setLoadingMessage('이미지 업로드 중...');
    setLoadingSubmessage('이미지를 저장하고 있습니다.');
    setIsLoadingModalOpen(true);

    try {
      const supabase = createClient();
      const finalFile = new File(
        [result.blob],
        `image-${Date.now()}.png`,
        { type: result.blob.type || 'image/png' },
      );
      const upload = await uploadFileToStorage(
        supabase,
        finalFile,
        STORAGE_BUCKETS.USER_DESIGNS,
        STORAGE_FOLDERS.IMAGES,
      );
      if (!upload.success || !upload.url) {
        setIsLoadingModalOpen(false);
        alert(`이미지 업로드에 실패했습니다.\n사유: ${upload.error || '알 수 없음'}`);
        setBgPending(null);
        setDesignerPayload(null);
        return;
      }

      let designerJobId: string | null = null;
      if (result.designerPending) {
        designerJobId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const payload = designerPayload;
        const baseInput = {
          jobId: designerJobId,
          designId: productId ?? null,
          requesterName: payload?.name ?? '',
          requesterContact: payload?.contact ?? '',
          requestNote: payload?.note,
        };
        const submission = await submitDesignerRequest(
          supabase,
          pending.sourceUrl
            ? { ...baseInput, sourceUrl: pending.sourceUrl }
            : { ...baseInput, sourceFile: pending.sourceFile },
        );
        if (!submission.success) {
          console.error('Designer request submit failed:', submission.error);
        }
      }

      const displayUrl = upload.url;
      setLoadingMessage('이미지 불러오는 중...');
      setLoadingSubmessage('캔버스에 이미지를 추가하고 있습니다.');

      const img = await fabric.FabricImage.fromURL(displayUrl, { crossOrigin: 'anonymous' });
      const maxWidth = canvas.width * 0.5;
      const maxHeight = canvas.height * 0.5;
      if (img.width > maxWidth || img.height > maxHeight) {
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
        img.scale(scale);
      }
      img.set({
        left: canvas.width / 2,
        top: canvas.height / 2,
        originX: 'center',
        originY: 'center',
      });
      // @ts-expect-error - Adding custom data property to FabricImage
      img.data = {
        // @ts-expect-error - Reading data property
        ...(img.data || {}),
        supabaseUrl: displayUrl,
        supabasePath: upload.path,
        originalFileUrl: pending.sourceUrl ?? displayUrl,
        originalFileName: pending.sourceFile.name,
        fileType: pending.sourceFile.type || 'unknown',
        isConverted: isAiOrPsdFile(pending.sourceFile),
        uploadedAt: new Date().toISOString(),
        ...(designerJobId
          ? { designerJobId, designerPending: true }
          : { bgRemoved: result.usedRemoval }),
      };

      canvas.add(img);
      canvas.setActiveObject(img);
      if (designerJobId) {
        addDesignerPendingBadge(canvas, img);
      }
      canvas.renderAll();
      incrementCanvasVersion();

      setIsLoadingModalOpen(false);
      if (isAiOrPsdFile(pending.sourceFile)) {
        setLoadingMessage('완료!');
        setLoadingSubmessage('파일이 성공적으로 추가되었습니다.');
        setIsLoadingModalOpen(true);
        setTimeout(() => setIsLoadingModalOpen(false), 1500);
      }
    } catch (error) {
      setIsLoadingModalOpen(false);
      console.error('Error placing image on canvas:', error);
      alert('이미지를 캔버스에 추가하는 데 실패했습니다.');
    } finally {
      setBgPending(null);
      setDesignerPayload(null);
    }
  };

  // Admin-only: replace a designer-pending placeholder image while keeping
  // its position/size/rotation. Updates the designer_requests row to
  // 'completed' so the work is logged.
  const handleReplaceDesignerImage = async () => {
    const canvas = getActiveCanvas();
    if (!canvas) return;
    const obj = canvas.getActiveObject();
    if (!obj || obj.type !== 'image') return;
    // @ts-expect-error - Reading custom data
    const jobId = obj.data?.designerJobId as string | undefined;
    // @ts-expect-error - Reading custom data
    const isPending = obj.data?.designerPending as boolean | undefined;
    if (!jobId || !isPending) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        alert('파일이 너무 큽니다 (최대 50MB).');
        return;
      }
      setLoadingMessage('교체 이미지 업로드 중...');
      setLoadingSubmessage(file.name);
      setIsLoadingModalOpen(true);
      try {
        const supabase = createClient();
        const upload = await uploadFileToStorage(
          supabase,
          file,
          STORAGE_BUCKETS.USER_DESIGNS,
          STORAGE_FOLDERS.IMAGES,
        );
        if (!upload.success || !upload.url) {
          alert(`업로드 실패: ${upload.error || '알 수 없음'}`);
          return;
        }
        // setSrc preserves position/scale/rotation.
        await new Promise<void>((resolve, reject) => {
          const fabricImg = obj as fabric.FabricImage;
          fabricImg
            .setSrc(upload.url!, { crossOrigin: 'anonymous' })
            .then(() => resolve())
            .catch(reject);
        });
        // @ts-expect-error - Update custom data
        obj.data = {
          // @ts-expect-error - Read custom data
          ...(obj.data || {}),
          supabaseUrl: upload.url,
          supabasePath: upload.path,
          designerPending: false,
          completedUrl: upload.url,
          replacedAt: new Date().toISOString(),
        };
        removeDesignerPendingBadge(canvas, obj);
        canvas.renderAll();
        incrementCanvasVersion();

        const result = await markDesignerRequestCompleted(supabase, jobId, upload.url);
        if (!result.success) {
          console.error('markDesignerRequestCompleted failed:', result.error);
        }
        setLoadingMessage('완료!');
        setLoadingSubmessage('교체된 이미지가 적용되었습니다.');
        setTimeout(() => setIsLoadingModalOpen(false), 1200);
      } catch (err) {
        console.error('Replace designer image error:', err);
        alert('교체 중 오류가 발생했습니다.');
        setIsLoadingModalOpen(false);
      }
    };
    input.click();
  };

  const handleSideSelect = (sideId: string) => {
    setActiveSide(sideId);
    setIsModalOpen(false);
  };

  const handleDeleteObject = () => {
    const canvas = getActiveCanvas();
    const selectedObject = canvas?.getActiveObject();
    const selectedObjects = canvas?.getActiveObjects();

    if (selectedObjects && selectedObjects.length > 0) {
    // Remove all selected objects
    selectedObjects.forEach(obj => canvas?.remove(obj));
    // Discard the selection after removal
    canvas?.discardActiveObject()
    canvas?.renderAll();
    // Trigger pricing recalculation
    incrementCanvasVersion();
  } else if (selectedObject) {
    // Remove a single selected object
    canvas?.remove(selectedObject);
    canvas?.renderAll();
    // Trigger pricing recalculation
    incrementCanvasVersion();
    }
  }

  const handleResetCanvas = () => {
    const canvas = getActiveCanvas();

    if (!canvas) return;

    canvas.getObjects().forEach((obj) => {
      const objData = obj.get('data') as { id?: string } | undefined;
      // remove all objects except for background image and center guide line
      if (objData?.id !== 'background-product-image' && objData?.id !== 'center-line') {
        canvas.remove(obj)
      }
    })

    canvas.renderAll();

    // Trigger pricing recalculation
    incrementCanvasVersion();
  }

  // Layer manipulation functions
  const bringToFront = () => {
    const canvas = getActiveCanvas();
    const activeObject = canvas?.getActiveObject();
    if (canvas && activeObject) {
      canvas.bringObjectToFront(activeObject);
      canvas.renderAll();
    }
  };

  const sendToBack = () => {
    const canvas = getActiveCanvas();
    const activeObject = canvas?.getActiveObject();
    if (canvas && activeObject) {
      const objects = canvas.getObjects();
      const systemObjects = objects.filter(obj => {
        const objData = obj.get('data') as { id?: string } | undefined;
        return objData?.id === 'background-product-image' ||
               objData?.id === 'center-line' ||
               obj.get('excludeFromExport') === true;
      });

      const maxSystemIndex = Math.max(...systemObjects.map(obj => objects.indexOf(obj)), -1);
      const currentIndex = objects.indexOf(activeObject);
      const targetIndex = maxSystemIndex + 1;

      if (currentIndex > targetIndex) {
        canvas.remove(activeObject);
        canvas.insertAt(targetIndex, activeObject);
        canvas.setActiveObject(activeObject);
        canvas.renderAll();
      }
    }
  };

  const bringForward = () => {
    const canvas = getActiveCanvas();
    const activeObject = canvas?.getActiveObject();
    if (canvas && activeObject) {
      canvas.bringObjectForward(activeObject);
      canvas.renderAll();
    }
  };

  const sendBackward = () => {
    const canvas = getActiveCanvas();
    const activeObject = canvas?.getActiveObject();
    if (canvas && activeObject) {
      const objects = canvas.getObjects();
      const systemObjects = objects.filter(obj => {
        const objData = obj.get('data') as { id?: string } | undefined;
        return objData?.id === 'background-product-image' ||
               objData?.id === 'center-line' ||
               obj.get('excludeFromExport') === true;
      });

      const maxSystemIndex = Math.max(...systemObjects.map(obj => objects.indexOf(obj)), -1);
      const currentIndex = objects.indexOf(activeObject);
      if (currentIndex > maxSystemIndex + 1) {
        canvas.sendObjectBackwards(activeObject);
        canvas.renderAll();
      }
    }
  };

  // Generate canvas previews when modal is open
  const canvasPreviews = useMemo(() => {
    if (!isModalOpen) return {};

    const previews: Record<string, string> = {};
    sides.forEach((side) => {
      const canvas = canvasMap[side.id];
      if (canvas) {
        // Generate a data URL from the canvas
        previews[side.id] = canvas.toDataURL({
          format: 'png',
          quality: 0.8,
          multiplier: 0.3, // Scale down for thumbnail
        });
      }
    });
    return previews;
  }, [isModalOpen, sides, canvasMap]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input or textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Skip if a fabric.js IText is in editing mode
      const canvas = getActiveCanvas();
      const active = canvas?.getActiveObject();
      if (active && 'isEditing' in active && (active as fabric.IText).isEditing) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redo();
      } else if (isCtrlOrCmd && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (!canvas) return;
        const selectedObjects = canvas.getActiveObjects();
        if (selectedObjects.length > 0) {
          e.preventDefault();
          selectedObjects.forEach(obj => canvas.remove(obj));
          canvas.discardActiveObject();
          canvas.renderAll();
          incrementCanvasVersion();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [getActiveCanvas, undo, redo, incrementCanvasVersion]);

  // Only show toolbar in edit mode
  if (!isEditMode) return null;

  const currentSide = sides.find(side => side.id === activeSideId);

  // Shared modal element rendered once at the end of every variant return.
  const bgRemovalModal =
    bgModalOpen && bgPending ? (
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-200 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleBgCancel();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="이미지 추가하기"
      >
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleBgCancel}
            aria-label="닫기"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          <h2 className="text-lg font-bold mb-4 pr-8">이미지 추가하기</h2>
          <BackgroundRemovalFlow
            initialFile={bgPending.pngFile}
            onComplete={handleBgComplete}
            onCancel={handleBgCancel}
            onDesignerRequest={async (payload) => {
              setDesignerPayload(payload);
            }}
          />
        </div>
      </div>
    ) : null;

  // Designer-pending status of the currently selected object — used to gate
  // the admin-only "이미지 교체" button.
  // @ts-expect-error - reading custom data field
  const selectedIsDesignerPending = !!selectedObject?.data?.designerPending;
  const showReplaceDesignerButton = isAdmin && selectedIsDesignerPending;

  // Floating "이미지 교체" CTA shown only when an admin selects a designer-
  // pending placeholder. Lives outside the toolbar layout so it doesn't
  // disturb existing variant designs.
  const replaceDesignerButton = showReplaceDesignerButton ? (
    <div className="fixed bottom-6 right-6 z-100">
      <button
        type="button"
        onClick={handleReplaceDesignerImage}
        className="flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-amber-600 transition"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        디자이너 작업 이미지로 교체
      </button>
    </div>
  ) : null;

  // Compact editor variant – dark vertical tool sidebar (Photoshop-like)
  if (variant === 'editor') {
    const editorBtnBase = 'p-1.5 rounded transition-colors flex items-center justify-center';
    const editorBtnIdle = 'text-neutral-400 hover:text-white hover:bg-neutral-700';
    const editorBtnDisabled = 'text-neutral-600 cursor-not-allowed';

    return (
      <>
        <div className={horizontal
          ? "h-9 bg-neutral-800 flex flex-row items-center px-2 gap-0.5 shrink-0 border-b border-neutral-700"
          : "w-9 bg-neutral-800 flex flex-col items-center pt-2 pb-1 gap-0.5 shrink-0 border-r border-neutral-700"
        }>
          {/* Add tools */}
          <button onClick={addText} className={`${editorBtnBase} ${editorBtnIdle}`} title="텍스트 추가">
            <TextCursor className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleAddImageClick} className={`${editorBtnBase} ${editorBtnIdle}`} title="이미지 추가">
            <FileImage className="w-3.5 h-3.5" />
          </button>
          {hasAnchors && (
            <button
              onClick={() => setIsAnchorPanelOpen(true)}
              disabled={!selectedObject}
              className={`${editorBtnBase} ${selectedObject ? editorBtnIdle : editorBtnDisabled}`}
              title="자주 쓰는 위치"
            >
              <span className="text-sm leading-none">📍</span>
            </button>
          )}

          <div className={horizontal ? "h-5 border-l border-neutral-600 mx-1" : "w-5 border-t border-neutral-600 my-1"} />

          {/* Layer controls */}
          <button onClick={bringToFront} disabled={!selectedObject} className={`${editorBtnBase} ${selectedObject ? editorBtnIdle : editorBtnDisabled}`} title="맨 앞으로">
            <ChevronsUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={bringForward} disabled={!selectedObject} className={`${editorBtnBase} ${selectedObject ? editorBtnIdle : editorBtnDisabled}`} title="앞으로">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={sendBackward} disabled={!selectedObject} className={`${editorBtnBase} ${selectedObject ? editorBtnIdle : editorBtnDisabled}`} title="뒤로">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={sendToBack} disabled={!selectedObject} className={`${editorBtnBase} ${selectedObject ? editorBtnIdle : editorBtnDisabled}`} title="맨 뒤로">
            <ChevronsDown className="w-3.5 h-3.5" />
          </button>

          <div className={horizontal ? "h-5 border-l border-neutral-600 mx-1" : "w-5 border-t border-neutral-600 my-1"} />

          {/* Undo/Redo */}
          <button onClick={() => undo()} disabled={!canUndo()} className={`${editorBtnBase} ${canUndo() ? editorBtnIdle : editorBtnDisabled}`} title="실행 취소 (Ctrl+Z)">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => redo()} disabled={!canRedo()} className={`${editorBtnBase} ${canRedo() ? editorBtnIdle : editorBtnDisabled}`} title="다시 실행 (Ctrl+Shift+Z)">
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className={horizontal ? "h-5 border-l border-neutral-600 mx-1" : "w-5 border-t border-neutral-600 my-1"} />

          {/* Destructive */}
          <button onClick={handleDeleteObject} disabled={!selectedObject} className={`${editorBtnBase} ${selectedObject ? 'text-red-400 hover:text-red-300 hover:bg-neutral-700' : editorBtnDisabled}`} title="삭제">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleResetCanvas} className={`${editorBtnBase} ${editorBtnIdle}`} title="초기화">
            <RefreshCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <AnchorPresetPanel
          open={isAnchorPanelOpen}
          onClose={() => setIsAnchorPanelOpen(false)}
          anchors={sideAnchors}
          hasSelectedArtwork={hasSelectedArtwork}
          onPick={handlePickAnchor}
          variant="desktop"
        />

        {/* Loading Modal for file conversion */}
        <LoadingModal
          isOpen={isLoadingModalOpen}
          message={loadingMessage}
          submessage={loadingSubmessage}
        />

        {/* Image Upload Modal */}
        {isImagePopupOpen && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-200"
            onClick={() => setIsImagePopupOpen(false)}
          >
            <div
              className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold mb-4">이미지 파일 안내</h2>
              <div className="space-y-3 text-sm text-gray-700">
                <p><strong className="text-black">AI/PSD 파일</strong>을 권장드립니다.</p>
                <p>다른 파일 형식(PNG, JPG 등)도 사용 가능하지만, 인쇄 품질 확인을 위해 연락드릴 수 있습니다.</p>
              </div>
              <label className="flex items-start gap-3 mt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={imageUploadAgreed}
                  onChange={(e) => setImageUploadAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
                />
                <span className="text-sm text-gray-700">위 내용을 확인했습니다.</span>
              </label>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setIsImagePopupOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  취소
                </button>
                <button
                  onClick={handleImagePopupConfirm}
                  disabled={!imageUploadAgreed}
                  className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
        {bgRemovalModal}
        {replaceDesignerButton}
      </>
    );
  }

  if (isDesktop) {
    return (
      <>
        <div className="w-full space-y-3">
          {/* Main Toolbar */}
          <div className="w-full flex items-center justify-start gap-4 rounded-md border border-gray-200 bg-white p-2">
            <div className="flex items-center gap-2">
              <button
                onClick={addText}
                className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                title="텍스트 추가"
              >
                <TextCursor className="size-4" />
                텍스트
              </button>
              <button
                onClick={handleAddImageClick}
                className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                title="이미지 추가"
              >
                <FileImage className="size-4" />
                이미지
              </button>
              <button
                onClick={handleResetCanvas}
                className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                title="초기화"
              >
                <RefreshCcw className="size-4" />
                초기화
              </button>
            </div>
          </div>

          {/* Layer Manipulation Controls - Fixed height to prevent layout shift */}
          <div className={`w-full flex items-center justify-between gap-4 rounded-md border px-5 py-3 shadow-sm transition-all ${
            selectedObject
              ? 'border-blue-200 bg-blue-50/50'
              : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold mr-2 ${selectedObject ? 'text-gray-700' : 'text-gray-400'}`}>
                레이어 조정:
              </span>
              <button
                onClick={bringToFront}
                disabled={!selectedObject}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                title="맨 앞으로"
              >
                <ChevronsUp className="size-4" />
              </button>
              <button
                onClick={bringForward}
                disabled={!selectedObject}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                title="앞으로"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                onClick={sendBackward}
                disabled={!selectedObject}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                title="뒤로"
              >
                <ArrowDown className="size-4" />
              </button>
              <button
                onClick={sendToBack}
                disabled={!selectedObject}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                title="맨 뒤로"
              >
                <ChevronsDown className="size-4" />
              </button>
            </div>

            <button
              onClick={handleDeleteObject}
              disabled={!selectedObject}
              className="flex items-center gap-2 rounded-full border border-red-200 bg-white px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
              title="삭제"
            >
              <Trash2 className="size-4" />
              삭제
            </button>
          </div>
        </div>

        {/* Mobile: Render TextStylePanel here, Desktop: Rendered by parent component */}
        {!isDesktop && selectedObject && (selectedObject.type === "i-text" || selectedObject.type === "text" || isCurvedText(selectedObject)) && (
          <TextStylePanel
            selectedObject={selectedObject as fabric.IText}
            onClose={() => setSelectedObject(null)}
            variant="mobile"
          />
        )}

        {/* Loading Modal for file conversion */}
        <LoadingModal
          isOpen={isLoadingModalOpen}
          message={loadingMessage}
          submessage={loadingSubmessage}
        />

        {/* Image Upload Modal */}
        {isImagePopupOpen && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-200"
            onClick={() => setIsImagePopupOpen(false)}
          >
            <div
              className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold mb-4">이미지 파일 안내</h2>
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  <strong className="text-black">AI/PSD 파일</strong>을 권장드립니다.
                </p>
                <p>
                  다른 파일 형식(PNG, JPG 등)도 사용 가능하지만, 인쇄 품질 확인을 위해 연락드릴 수 있습니다.
                </p>
              </div>
              <label className="flex items-start gap-3 mt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={imageUploadAgreed}
                  onChange={(e) => setImageUploadAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
                />
                <span className="text-sm text-gray-700">
                  위 내용을 확인했습니다.
                </span>
              </label>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setIsImagePopupOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  취소
                </button>
                <button
                  onClick={handleImagePopupConfirm}
                  disabled={!imageUploadAgreed}
                  className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
        {bgRemovalModal}
        {replaceDesignerButton}
      </>
    );
  }

  return (
    <>

      {/* Exit Edit Mode Button */}
        {isEditMode && (
          <div className="w-full bg-white shadow-md z-100 fixed top-0 left-0 flex items-center justify-between px-4">
            <button
              onClick={handleExitEditMode}
              className="py-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold transition flex items-center gap-2"
            >
              완료
            </button>

            <div className='flex items-center gap-3'>
              {/* Zoom controls */}
              <div className='flex items-center gap-1 border-r border-gray-300 pr-3'>
                <button
                  onClick={() => zoomOut()}
                  className='p-1.5 hover:bg-gray-100 rounded transition'
                  title="축소"
                >
                  <ZoomOut className='text-black/80 size-5' />
                </button>
                <span className='text-xs text-gray-600 min-w-12 text-center'>
                  {Math.round(currentZoom * 100)}%
                </span>
                <button
                  onClick={() => zoomIn()}
                  className='p-1.5 hover:bg-gray-100 rounded transition'
                  title="확대"
                >
                  <ZoomIn className='text-black/80 size-5' />
                </button>
              </div>

              <button onClick={handleResetCanvas} title="초기화">
                <RefreshCcw className='text-black/80 font-extralight' />
              </button>
              {selectedObject && (
                <button onClick={handleDeleteObject} title="삭제">
                  <Trash2 className='text-red-400 font-extralight' />
                </button>
              )}
            </div>
          </div>
        )}


      {/* Modal for side selection */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-white/20 backdrop-blur-sm bg-opacity-50 flex items-center justify-center z-50 shadow-lg shadow-black"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4">편집할 면 선택</h2>
            <div className="space-y-3">
              {sides.map((side) => (
                <button
                  key={side.id}
                  onClick={() => handleSideSelect(side.id)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left flex items-center gap-4 ${
                    side.id === activeSideId
                      ? 'border-black bg-gray-100'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {/* Canvas Preview */}
                  <div className="flex-shrink-0 w-20 h-24 bg-gray-100 rounded border border-gray-200 overflow-hidden">
                    {canvasPreviews[side.id] ? (
                      <img
                        src={canvasPreviews[side.id]}
                        alt={`${side.name} preview`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                        미리보기
                      </div>
                    )}
                  </div>

                  {/* Side Info */}
                  <div className="flex-1">
                    <div className="font-semibold">{side.name}</div>
                    {side.id === activeSideId && (
                      <div className="text-sm text-gray-600 mt-1">현재 편집 중</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* Default Toolbar render only when no object is selected */}
      {/* Center button for side selection */}
      {sides.length > 0 && !selectedObject && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-white shadow-xl rounded-full px-6 py-3 flex items-center gap-2 hover:bg-gray-50 transition border border-gray-200"
          >
            <Layers className="size-5" />
            <span className="font-medium">{currentSide?.name || '면 선택'}</span>
          </button>
        </div>
      )}
      {!selectedObject && 
        <div className="fixed bottom-20 right-6 flex flex-col items-end gap-3 z-50">
          {/* Inner buttons - expand upwards */}
          <div className={`flex flex-col gap-2 transition-all duration-700 overflow-hidden ${
            isExpanded ? 'opacity-100 max-h-96' : 'opacity-0 max-h-0'
          }`}>
            <button
              onClick={addText}
            >
              <div className='bg-white rounded-full p-3 text-sm font-medium transition hover:bg-gray-50 border border-gray-200 whitespace-nowrap'>
                <TextCursor />
              </div>
              <p className='text-xs'>텍스트</p>
            </button>
            <button
              onClick={handleAddImageClick}
            >
              <div className='bg-white rounded-full p-3 text-sm font-medium transition hover:bg-gray-50 border border-gray-200 whitespace-nowrap'>
                <FileImage />
              </div>
              <p className='text-xs'>이미지</p>
            </button>
          </div>

          {/* Plus button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`size-12 ${isExpanded ? "bg-black text-white" : "bg-white text-black"} shadow-xl rounded-full flex items-center justify-center hover:bg-gray-200 transition-all duration-300`}
            aria-label={isExpanded ? 'Close menu' : 'Open menu'}
          >
            <Plus className={`${isExpanded ? 'rotate-45' : ''} size-8 transition-all duration-300`}/>
          </button>
        </div>
      }


      {/* Render if selected item is text */}
      {selectedObject && (selectedObject.type === "i-text" || selectedObject.type === "text" || isCurvedText(selectedObject)) && (
        <TextStylePanel
          selectedObject={selectedObject as fabric.IText}
          onClose={() => setSelectedObject(null)}
        />
      )}

      {/* Loading Modal for file conversion */}
      <LoadingModal
        isOpen={isLoadingModalOpen}
        message={loadingMessage}
        submessage={loadingSubmessage}
      />

      {/* Image Upload Modal */}
      {isImagePopupOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-200"
          onClick={() => setIsImagePopupOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4">이미지 파일 안내</h2>
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <strong className="text-black">AI/PSD 파일</strong>을 권장드립니다.
              </p>
              <p>
                다른 파일 형식(PNG, JPG 등)도 사용 가능하지만, 인쇄 품질 확인을 위해 연락드릴 수 있습니다.
              </p>
            </div>
            <label className="flex items-start gap-3 mt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={imageUploadAgreed}
                onChange={(e) => setImageUploadAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
              />
              <span className="text-sm text-gray-700">
                위 내용을 확인했습니다.
              </span>
            </label>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsImagePopupOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
              >
                취소
              </button>
              <button
                onClick={handleImagePopupConfirm}
                disabled={!imageUploadAgreed}
                className="flex-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {bgRemovalModal}
        {replaceDesignerButton}
    </>
  );
}

export default Toolbar;
