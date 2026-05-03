'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductSide } from '@/types/types';
import { useCanvasStore } from '@/store/useCanvasStore';

interface EditorSideNavProps {
  sides: ProductSide[];
}

export default function EditorSideNav({ sides }: EditorSideNavProps) {
  const { activeSideId, setActiveSide } = useCanvasStore();
  const currentIndex = sides.findIndex((s) => s.id === activeSideId);
  const validIndex = currentIndex >= 0 ? currentIndex : 0;

  if (sides.length <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        onClick={() => validIndex > 0 && setActiveSide(sides[validIndex - 1].id)}
        disabled={validIndex <= 0}
        className="p-1 rounded-full bg-white shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
      >
        <ChevronLeft className="w-3 h-3" />
      </button>
      <div className="flex gap-1">
        {sides.map((side, index) => (
          <button
            key={side.id}
            onClick={() => setActiveSide(side.id)}
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
              index === validIndex
                ? 'bg-neutral-800 text-white'
                : 'bg-white text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {side.name}
          </button>
        ))}
      </div>
      <button
        onClick={() => validIndex < sides.length - 1 && setActiveSide(sides[validIndex + 1].id)}
        disabled={validIndex >= sides.length - 1}
        className="p-1 rounded-full bg-white shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
      >
        <ChevronRight className="w-3 h-3" />
      </button>
    </div>
  );
}
