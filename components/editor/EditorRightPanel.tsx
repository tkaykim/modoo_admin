'use client';

import { useEffect, useRef, useState } from 'react';

interface EditorRightPanelProps {
  children: React.ReactNode;
  wide?: boolean;
}

export default function EditorRightPanel({ children, wide = false }: EditorRightPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [panelHeight, setPanelHeight] = useState(120); // Initial peek height
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Handle drag start
  const handleDragStart = (clientY: number) => {
    setIsDragging(true);
    dragStartY.current = clientY;
    dragStartHeight.current = panelHeight;
  };

  // Handle drag move
  const handleDragMove = (clientY: number) => {
    if (!isDragging) return;
    const deltaY = dragStartY.current - clientY; // Inverted: dragging up = positive
    const newHeight = Math.max(80, Math.min(window.innerHeight - 60, dragStartHeight.current + deltaY));
    setPanelHeight(newHeight);
  };

  // Handle drag end with snap
  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const windowHeight = window.innerHeight;
    const snapPoints = [120, windowHeight * 0.5, windowHeight - 60]; // Peek, half, full

    // Find closest snap point
    const closest = snapPoints.reduce((prev, curr) =>
      Math.abs(curr - panelHeight) < Math.abs(prev - panelHeight) ? curr : prev
    );

    setPanelHeight(closest);
  };

  // Mouse events
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientY);
    const onMouseUp = () => handleDragEnd();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, panelHeight]);

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientY);
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragMove(e.touches[0].clientY);
    }
  };

  const onTouchEnd = () => {
    handleDragEnd();
  };

  return (
    <>
      {/* Desktop Layout (md and up) */}
      <aside className={`hidden md:flex ${wide ? 'w-120' : 'w-72'} h-full bg-white/95 backdrop-blur-sm border-l border-gray-200 flex-col overflow-y-auto shrink-0 text-xs transition-[width] duration-200`}>
        {children}
      </aside>

      {/* Mobile Slide-up Panel (below md) */}
      <div
        ref={panelRef}
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm rounded-t-2xl shadow-2xl flex flex-col text-xs transition-all duration-200 ease-out z-50"
        style={{
          height: `${panelHeight}px`,
          touchAction: 'none',
        }}
      >
        {/* Drag Handle */}
        <div
          className="shrink-0 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
