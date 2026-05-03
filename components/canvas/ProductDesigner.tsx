'use client'

import React, { useRef, useState, useEffect } from "react";
import dynamic from 'next/dynamic';
import { ProductConfig } from "@/types/types";
import Toolbar from "./Toolbar";
import { useCanvasStore } from '@/store/useCanvasStore';
import { preloadBackgroundRemoval } from '@/components/background-removal/BackgroundRemovalFlow';


const SingleSideCanvas = dynamic(() => import('./SingleSideCanvas'), {
  ssr: false,
  loading: () => <div className="w-125 h-125 bg-gray-100 animate-pulse" />,
});

interface ProductDesignerProps {
  config: ProductConfig;
  layout?: 'mobile' | 'desktop';
}

const ProductDesigner: React.FC<ProductDesignerProps> = ({ config, layout = 'mobile' }) => {
  const { isEditMode, setEditMode, setActiveSide, activeSideId, canvasMap } = useCanvasStore();
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDesktop = layout === 'desktop';
  const allowSwipe = !isDesktop && !isEditMode;
  const shouldFullscreen = isEditMode && !isDesktop;

  // Derive current index from activeSideId
  const currentIndex = config.sides.findIndex(side => side.id === activeSideId);
  const validCurrentIndex = currentIndex !== -1 ? currentIndex : 0;

  // Update container width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Background-removal model prefetch (idle, courteous on slow networks).
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType && /^(2g|slow-2g)$/.test(conn.effectiveType)) return;
    const start = () => {
      void preloadBackgroundRemoval();
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(start, { timeout: 3000 });
    } else {
      const t = setTimeout(start, 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!allowSwipe) return;
    setIsDragging(true);
    setStartX(e.touches[0].clientX);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!allowSwipe) return;
    setIsDragging(true);
    setStartX(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !allowSwipe) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    setTranslateX(diff);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !allowSwipe) return;
    const currentX = e.clientX;
    const diff = currentX - startX;
    setTranslateX(diff);
  };

  const handleDragEnd = () => {
    if (!isDragging || !allowSwipe) return;
    setIsDragging(false);

    const threshold = 50; // Minimum drag distance to trigger slide change

    if (translateX > threshold && validCurrentIndex > 0) {
      // Swipe right - go to previous
      setActiveSide(config.sides[validCurrentIndex - 1].id);
    } else if (translateX < -threshold && validCurrentIndex < config.sides.length - 1) {
      // Swipe left - go to next
      setActiveSide(config.sides[validCurrentIndex + 1].id);
    }

    setTranslateX(0);
  };

  const getTransform = () => {
    const baseTranslate = -validCurrentIndex * 100;
    const dragTranslate = allowSwipe && isDragging && containerWidth > 0 ? (translateX / containerWidth) * 100 : 0;
    return `translateX(${baseTranslate + dragTranslate}%)`;
  };

  const handleExitEditMode = () => {
    // Deselect all items on all canvases before exiting edit mode
    Object.values(canvasMap).forEach((canvas) => {
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    });
    setEditMode(false);
  };

  const containerWidthClass = isDesktop ? 'w-full' : 'max-w-2xl mx-auto';
  const containerHeightClass = shouldFullscreen
    ? 'h-screen'
    : isDesktop
      ? 'h-[560px] md:h-[640px]'
      : 'h-100';

  return (
    <div className={shouldFullscreen ? "min-h-screen" : ""}>
      <div className="">
        {isDesktop && (
          <div className="mb-4">
            <Toolbar sides={config.sides} handleExitEditMode={handleExitEditMode} variant="desktop" />
          </div>
        )}

        {isDesktop && config.sides.length > 1 && (
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            {config.sides.map((side, index) => (
              <button
                key={side.id}
                onClick={() => setActiveSide(side.id)}
                className={`rounded-full border px-4 py-2.5 text-xs font-semibold transition ${
                  index === validCurrentIndex
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'
                }`}
              >
                {side.name}
              </button>
            ))}
          </div>
        )}

        <div className={`${containerWidthClass} overflow-hidden transition-all relative duration-300 ${containerHeightClass} bg-[#f3f3f3] flex flex-col justify-center items-center`}>
          <div
            ref={containerRef}
            className={`relative ${allowSwipe ? 'touch-pan-y' : ''}`}
            onTouchStart={allowSwipe ? handleTouchStart : undefined}
            onTouchMove={allowSwipe ? handleTouchMove : undefined}
            onTouchEnd={allowSwipe ? handleDragEnd : undefined}
            onMouseDown={allowSwipe ? handleMouseDown : undefined}
            onMouseMove={allowSwipe ? handleMouseMove : undefined}
            onMouseUp={allowSwipe ? handleDragEnd : undefined}
            onMouseLeave={allowSwipe ? handleDragEnd : undefined}
          >
            <div
              className="flex transition-transform"
              style={{
                transform: getTransform(),
                transitionDuration: isDragging ? '0ms' : '300ms',
                cursor: allowSwipe && !isDragging ? 'grab' : allowSwipe && isDragging ? 'grabbing' : 'default',
              }}
            >
              {config.sides.map((side) => (
                <div
                  className="flex flex-col items-center shrink-0 w-full"
                  key={side.id}
                >
                  <SingleSideCanvas
                    side={side}
                    width={400}
                    height={500}
                    isEdit={isEditMode}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Pagination dots */}
          {!isDesktop && !isEditMode && config.sides.length > 1 && (
            <div className="flex justify-center gap-2 pb-3 absolute bottom-0">
              {config.sides.map((side, index) => (
                <button
                  key={side.id}
                  onClick={() => {
                    setActiveSide(side.id);
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === validCurrentIndex
                      ? 'bg-gray-900 w-6'
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={`Go to ${side.name}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toolbar - shows only in edit mode */}
      {!isDesktop && <Toolbar sides={config.sides} handleExitEditMode={handleExitEditMode} />}
    </div>
  );
};

export default ProductDesigner;
